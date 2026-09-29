import type { IncomingMessage, ServerResponse } from 'node:http';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { extname, join, normalize, sep } from 'node:path';
import { KinottaError } from '../../core/index.ts';
import type { NewComment, Project } from '../../core/index.ts';

const VERSION_API = /^\/api\/reels\/([^/]+)\/versions\/(\d+)$/;
const COMMENTS_API = /^\/api\/reels\/([^/]+)\/versions\/(\d+)\/comments$/;
const COMMENT_API = /^\/api\/reels\/([^/]+)\/versions\/(\d+)\/comments\/([^/]+)$/;
const NOTE_API = /^\/api\/reels\/([^/]+)\/versions\/(\d+)\/note$/;
const VERSIONS_API = /^\/api\/reels\/([^/]+)\/versions$/;
const BATCH_API = /^\/api\/reels\/([^/]+)\/versions\/(\d+)\/batch$/;
const FOOTAGE_ROUTE = /^\/footage\/([^/]+)$/;
const VERSION_FOLDER = /^v\d+$/;
const MAX_BODY_BYTES = 16 * 1024;
const HEARTBEAT_MS = 25_000;
const HTTP_CONFLICT = 409;

/** A request the server cannot read: malformed JSON (400) or a body over the size limit (413). */
class BadRequest extends Error {
  constructor(
    readonly status: 400 | 413,
    message: string,
  ) {
    super(message);
  }
}
const REELS_PREFIX = '/reels/';

const CONTENT_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
};

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { 'content-type': CONTENT_TYPES['.json'], 'cache-control': 'no-store' });
  res.end(JSON.stringify(body));
}

function sendNotFound(res: ServerResponse): void {
  res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
  res.end('Not found');
}

const KINOTTA_STATUS: Record<KinottaError['code'], number> = { 'not-found': 404, invalid: 422, frozen: HTTP_CONFLICT };

function sendError(res: ServerResponse, err: unknown): void {
  if (err instanceof BadRequest) sendJson(res, err.status, { error: err.message });
  else if (err instanceof KinottaError) sendJson(res, KINOTTA_STATUS[err.code], { error: err.message });
  else sendJson(res, 500, { error: err instanceof Error ? err.message : 'Server error' });
}

async function readJsonBody(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    size += (chunk as Buffer).length;
    if (size > MAX_BODY_BYTES) throw new BadRequest(413, 'The request body is too large.');
    chunks.push(chunk as Buffer);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    throw new BadRequest(400, 'The request body is not valid JSON.');
  }
}

async function handleComments(req: IncomingMessage, res: ServerResponse, project: Project, route: RegExpExecArray): Promise<void> {
  const slug = safeDecode(route[1]!);
  const version = Number(route[2]);
  if (slug === null) sendJson(res, 404, { error: 'Not found' });
  else if (req.method === 'POST') sendJson(res, 201, await project.addComment(slug, version, (await readJsonBody(req)) as NewComment));
  else if (req.method === 'GET' || req.method === 'HEAD') sendJson(res, 200, { comments: await project.listComments(slug, version) });
  else res.writeHead(405).end();
}

/** The one text field of a comment edit or a note. */
async function readTextField(req: IncomingMessage, field: string): Promise<string> {
  const body = await readJsonBody(req);
  const value = body !== null && typeof body === 'object' ? (body as Record<string, unknown>)[field] : undefined;
  if (typeof value !== 'string') throw new KinottaError('invalid', `The request needs a "${field}" text.`);
  return value;
}

async function handleComment(req: IncomingMessage, res: ServerResponse, project: Project, route: RegExpExecArray): Promise<void> {
  const slug = safeDecode(route[1]!);
  const id = safeDecode(route[3]!);
  const version = Number(route[2]);
  if (slug === null || id === null) sendJson(res, 404, { error: 'Not found' });
  else if (req.method === 'PATCH') sendJson(res, 200, await project.editComment(slug, version, id, await readTextField(req, 'text')));
  else if (req.method === 'DELETE') sendJson(res, 200, await project.deleteComment(slug, version, id));
  else res.writeHead(405).end();
}

async function handleNote(req: IncomingMessage, res: ServerResponse, project: Project, route: RegExpExecArray): Promise<void> {
  const slug = safeDecode(route[1]!);
  const version = Number(route[2]);
  if (slug === null) sendJson(res, 404, { error: 'Not found' });
  else if (req.method === 'PUT') sendJson(res, 200, await project.setNote(slug, version, await readTextField(req, 'note')));
  else if (req.method === 'GET' || req.method === 'HEAD') sendJson(res, 200, { note: await project.readNote(slug, version) });
  else res.writeHead(405).end();
}

async function handleBatch(req: IncomingMessage, res: ServerResponse, project: Project, route: RegExpExecArray): Promise<void> {
  const slug = safeDecode(route[1]!);
  if (slug === null) sendJson(res, 404, { error: 'Not found' });
  else if (req.method === 'POST') sendJson(res, 200, await project.copyBatch(slug, Number(route[2])));
  else res.writeHead(405).end();
}

/** Server-sent events: every project event as one JSON message, and a comment line now and then to keep the stream open. */
function streamEvents(res: ServerResponse, project: Project): void {
  res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache', connection: 'keep-alive' });
  res.write(': connected\n\n');
  const unsubscribe = project.subscribe((event) => res.write(`data: ${JSON.stringify(event)}\n\n`));
  const heartbeat = setInterval(() => res.write(': keep-alive\n\n'), HEARTBEAT_MS);
  res.on('close', () => {
    clearInterval(heartbeat);
    unsubscribe();
  });
}

function sendFile(req: IncomingMessage, res: ServerResponse, file: string): void {
  res.writeHead(200, { 'content-type': CONTENT_TYPES[extname(file)] ?? 'application/octet-stream' });
  if (req.method === 'HEAD') res.end();
  else createReadStream(file).pipe(res);
}

/** Parses a single `bytes=a-b` range against a file size; null when it is malformed or cannot be satisfied. */
function parseRange(header: string, size: number): { start: number; end: number } | null {
  const match = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (!match || (match[1] === '' && match[2] === '')) return null;
  let start: number;
  let end: number;
  if (match[1] === '') {
    start = Math.max(0, size - Number(match[2]));
    end = size - 1;
  } else {
    start = Number(match[1]);
    end = match[2] === '' ? size - 1 : Math.min(Number(match[2]), size - 1);
  }
  return start <= end && start < size ? { start, end } : null;
}

/** Serves a file with byte-range support, which video seeking needs. */
async function sendRanged(req: IncomingMessage, res: ServerResponse, file: string): Promise<void> {
  const { size } = await stat(file);
  const base = { 'content-type': CONTENT_TYPES[extname(file)] ?? 'application/octet-stream', 'accept-ranges': 'bytes' };
  const header = req.headers.range;
  const range = header === undefined ? null : parseRange(header, size);
  if (header !== undefined && range === null) {
    res.writeHead(416, { ...base, 'content-range': `bytes */${size}` }).end();
    return;
  }
  const [status, extra] = range
    ? [206, { 'content-range': `bytes ${range.start}-${range.end}/${size}`, 'content-length': String(range.end - range.start + 1) }]
    : [200, { 'content-length': String(size) }];
  res.writeHead(status, { ...base, ...extra });
  if (req.method === 'HEAD') res.end();
  else createReadStream(file, range ?? undefined).pipe(res);
}

async function serveFootage(req: IncomingMessage, res: ServerResponse, project: Project, route: RegExpExecArray): Promise<void> {
  const slug = safeDecode(route[1]!);
  const file = slug === null ? null : await project.footageFile(slug);
  if (file) await sendRanged(req, res, file);
  else sendNotFound(res);
}

function safeDecode(text: string): string | null {
  try {
    return decodeURIComponent(text);
  } catch {
    return null;
  }
}

async function fileIn(root: string, urlPath: string): Promise<string | null> {
  const decoded = safeDecode(urlPath);
  if (decoded === null) return null;
  const relative = normalize(decoded).replace(/^[\\/]+/, '');
  const candidate = join(root, relative);
  if (candidate !== root && !candidate.startsWith(root + sep)) return null;
  try {
    return (await stat(candidate)).isFile() ? candidate : null;
  } catch {
    return null;
  }
}

async function serveStatic(req: IncomingMessage, res: ServerResponse, webRoot: string, urlPath: string): Promise<void> {
  const file = (await fileIn(webRoot, urlPath)) ?? (extname(urlPath) ? null : await fileIn(webRoot, 'index.html'));
  if (file) sendFile(req, res, file);
  else sendNotFound(res);
}

/**
 * Serves /reels/<reel>/v<n>/<file> from the project's reels folder. Only version folders are reachable:
 * no dot folders (.kinotta), no path tricks, nothing outside reels/.
 */
async function serveVersionFile(req: IncomingMessage, res: ServerResponse, reelsDir: string, pathname: string): Promise<void> {
  const segments = pathname.slice(REELS_PREFIX.length).split('/').map(safeDecode);
  const clean = segments.every((s): s is string => s !== null && s !== '' && !s.startsWith('.') && !/[\\]/.test(s));
  const file =
    clean && segments.length >= 3 && VERSION_FOLDER.test(segments[1]!) ? await fileIn(reelsDir, segments.join('/')) : null;
  if (file) sendFile(req, res, file);
  else sendNotFound(res);
}

export function createHandler(project: Project, webRoot: string) {
  return async (req: IncomingMessage, res: ServerResponse): Promise<void> => {
    try {
      const { pathname } = new URL(req.url ?? '/', 'http://localhost');
      const versionRoute = VERSION_API.exec(pathname);
      const commentsRoute = COMMENTS_API.exec(pathname);
      const commentRoute = COMMENT_API.exec(pathname);
      const noteRoute = NOTE_API.exec(pathname);
      const versionsRoute = VERSIONS_API.exec(pathname);
      const batchRoute = BATCH_API.exec(pathname);
      const footageRoute = FOOTAGE_ROUTE.exec(pathname);
      if (commentsRoute) {
        await handleComments(req, res, project, commentsRoute);
      } else if (commentRoute) {
        await handleComment(req, res, project, commentRoute);
      } else if (noteRoute) {
        await handleNote(req, res, project, noteRoute);
      } else if (batchRoute) {
        await handleBatch(req, res, project, batchRoute);
      } else if (req.method !== 'GET' && req.method !== 'HEAD') {
        res.writeHead(405).end();
      } else if (footageRoute) {
        await serveFootage(req, res, project, footageRoute);
      } else if (pathname === '/api/project') {
        sendJson(res, 200, { name: project.name });
      } else if (pathname === '/api/reels') {
        sendJson(res, 200, await project.listReels());
      } else if (pathname === '/api/events') {
        streamEvents(res, project);
      } else if (versionsRoute) {
        const slug = safeDecode(versionsRoute[1]!);
        if (slug === null) sendJson(res, 404, { error: 'Not found' });
        else sendJson(res, 200, { versions: await project.listVersions(slug) });
      } else if (versionRoute) {
        const slug = safeDecode(versionRoute[1]!);
        if (slug === null) sendJson(res, 404, { error: 'Not found' });
        else sendJson(res, 200, await project.readVersion(slug, Number(versionRoute[2])));
      } else if (pathname.startsWith('/api/')) {
        sendJson(res, 404, { error: 'Not found' });
      } else if (pathname.startsWith(REELS_PREFIX)) {
        await serveVersionFile(req, res, project.reelsDir, pathname);
      } else {
        await serveStatic(req, res, webRoot, pathname);
      }
    } catch (err) {
      sendError(res, err);
    }
  };
}
