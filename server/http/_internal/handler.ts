import type { IncomingMessage, ServerResponse } from 'node:http';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { extname, join, normalize, sep } from 'node:path';
import { KinottaError, checkTools } from '../../core/index.ts';
import type { BatchOptions, NewBriefReel, NewComment, NewOperation, NewReel, Project, RenderRequest } from '../../core/index.ts';

const VERSION_API = /^\/api\/reels\/([^/]+)\/versions\/(\d+)$/;
const COMMENTS_API = /^\/api\/reels\/([^/]+)\/versions\/(\d+)\/comments$/;
const COMMENT_API = /^\/api\/reels\/([^/]+)\/versions\/(\d+)\/comments\/([^/]+)$/;
const NOTE_API = /^\/api\/reels\/([^/]+)\/versions\/(\d+)\/note$/;
const APPROVAL_API = /^\/api\/reels\/([^/]+)\/versions\/(\d+)\/approval$/;
const VERSIONS_API = /^\/api\/reels\/([^/]+)\/versions$/;
const BATCH_API = /^\/api\/reels\/([^/]+)\/versions\/(\d+)\/batch$/;
const EDITS_API = /^\/api\/reels\/([^/]+)\/edits(?:\/(undo|redo|[^/]+))?$/;
const SAVE_API = /^\/api\/reels\/([^/]+)\/save$/;
const SAVE_AND_RENDER_API = /^\/api\/reels\/([^/]+)\/save-and-render$/;
const OVERLOAD_API = /^\/api\/reels\/([^/]+)\/overload$/;
const MEDIA_MODEL_API = /^\/api\/reels\/([^/]+)\/media-model$/;
const HANDOFF_API = /^\/api\/reels\/([^/]+)\/handoff$/;
const TRANSCRIPTION_API = /^\/api\/reels\/([^/]+)\/transcription$/;
const RENDER_API = /^\/api\/renders\/([^/]+)$/;
const RENDER_SETTINGS_API = /^\/api\/reels\/([^/]+)\/render-settings$/;
const RENDERS_LIST_API = /^\/api\/reels\/([^/]+)\/renders$/;
const REVEAL_API = /^\/api\/reels\/([^/]+)\/renders\/([^/]+)\/reveal$/;
const RENDER_FILE_ROUTE = /^\/renders\/([^/]+)\/([^/]+)$/;
const HTTP_NO_CONTENT = 204;
const FOOTAGE_ROUTE = /^\/footage\/([^/]+)$/;
const MEDIA_ROUTE = /^\/media\/([^/]+)$/;
const VERSION_MEDIA_ROUTE = /^\/media\/([^/]+)\/(\d+)\/([^/]+)$/;
const WAVEFORM_API = /^\/api\/media\/([^/]+)\/waveform$/;
const SPEECH_API = /^\/api\/media\/([^/]+)\/speech$/;
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
  '.mov': 'video/quicktime',
  '.wav': 'audio/wav',
  '.mp3': 'audio/mpeg',
  '.m4a': 'audio/mp4',
  '.aac': 'audio/aac',
  '.ogg': 'audio/ogg',
  '.flac': 'audio/flac',
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

/** The request's JSON body. With `emptyAs`, a request with no body at all gives that instead of a 400. */
async function readJsonBody(req: IncomingMessage, emptyAs?: unknown): Promise<unknown> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    size += (chunk as Buffer).length;
    if (size > MAX_BODY_BYTES) throw new BadRequest(413, 'The request body is too large.');
    chunks.push(chunk as Buffer);
  }
  if (size === 0 && emptyAs !== undefined) return emptyAs;
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
  else if (req.method === 'GET' || req.method === 'HEAD') {
    sendJson(res, 200, { comments: await project.listComments(slug, version) });
  } else res.writeHead(405).end();
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

/** A version's approval: PUT approves, DELETE withdraws (R17: the editor is the only way to approve). */
async function handleApproval(req: IncomingMessage, res: ServerResponse, project: Project, route: RegExpExecArray): Promise<void> {
  const slug = safeDecode(route[1]!);
  const version = Number(route[2]);
  if (slug === null) sendJson(res, 404, { error: 'Not found' });
  else if (req.method === 'PUT') sendJson(res, 200, await project.approveVersion(slug, version));
  else if (req.method === 'DELETE') sendJson(res, 200, await project.withdrawApproval(slug, version));
  else res.writeHead(405).end();
}

async function handleBatch(req: IncomingMessage, res: ServerResponse, project: Project, route: RegExpExecArray): Promise<void> {
  const slug = safeDecode(route[1]!);
  if (slug === null) sendJson(res, 404, { error: 'Not found' });
  else if (req.method === 'POST') {
    const section = new URL(req.url ?? '/', 'http://localhost').searchParams.get('section') ?? undefined;
    sendJson(res, 200, await project.copyBatch(slug, Number(route[2]), { ...(await readBatchOptions(req)), section }));
  }
  else res.writeHead(405).end();
}

/** The reel's edit list: read it, add an operation, remove one (`/edits/<id>`), undo or redo (`/edits/undo`), or drop it. */
async function handleEdits(req: IncomingMessage, res: ServerResponse, project: Project, route: RegExpExecArray): Promise<void> {
  const slug = safeDecode(route[1]!);
  if (slug === null) sendJson(res, 404, { error: 'Not found' });
  else if (route[2] === 'undo' || route[2] === 'redo') {
    if (req.method !== 'POST') res.writeHead(405).end();
    else sendJson(res, 200, route[2] === 'undo' ? await project.undoEdit(slug) : await project.redoEdit(slug));
  } else if (route[2] !== undefined) {
    const id = safeDecode(route[2]);
    if (id === null) sendJson(res, 404, { error: 'Not found' });
    else if (req.method === 'DELETE') sendJson(res, 200, await project.removeOperation(slug, id));
    else res.writeHead(405).end();
  }
  else if (req.method === 'GET' || req.method === 'HEAD') sendJson(res, 200, await project.readEditList(slug));
  else if (req.method === 'POST') sendJson(res, 201, await project.addOperation(slug, (await readJsonBody(req)) as NewOperation));
  else if (req.method === 'DELETE') sendJson(res, 200, await project.discardEdits(slug));
  else res.writeHead(405).end();
}

/**
 * A render request's body: `{ reel, version, preset, fps?, size?, quality?, audio?, remember? }`. The core checks the
 * preset and the settings' values.
 */
async function readRenderRequest(req: IncomingMessage): Promise<RenderRequest> {
  const body = await readJsonBody(req);
  const { reel, version, preset, fps, size, quality, audio, remember, acceptOverload } = (body !== null && typeof body === 'object' ? body : {}) as Record<string, unknown>;
  if (typeof reel !== 'string' || !Number.isInteger(version) || typeof preset !== 'string') {
    throw new KinottaError('invalid', 'A render needs a "reel", a whole-number "version" and a "preset".');
  }
  return { reel, version, preset, fps, size, quality, audio, remember: remember === true, acceptOverload: acceptOverload === true } as RenderRequest;
}

/** A Save and render request's body: `{ preset, fps?, size?, quality?, audio?, remember? }`; the reel is in the path. */
async function readRenderChoice(req: IncomingMessage): Promise<Omit<RenderRequest, 'reel' | 'version'>> {
  const body = await readJsonBody(req);
  const { preset, fps, size, quality, audio, remember, acceptOverload } = (body !== null && typeof body === 'object' ? body : {}) as Record<string, unknown>;
  if (typeof preset !== 'string') throw new KinottaError('invalid', 'Save and render needs a "preset".');
  return { preset, fps, size, quality, audio, remember: remember === true, acceptOverload: acceptOverload === true } as Omit<RenderRequest, 'reel' | 'version'>;
}

/** The optional body of a batch request: `{ includeIssues, runtimeIssues }`. An empty body means the plain batch. */
async function readBatchOptions(req: IncomingMessage): Promise<BatchOptions> {
  const body = await readJsonBody(req, {});
  if (body === null || typeof body !== 'object') return {};
  const { includeIssues, runtimeIssues } = body as Record<string, unknown>;
  return {
    includeIssues: includeIssues === true,
    runtimeIssues: Array.isArray(runtimeIssues) ? runtimeIssues.filter((m): m is string => typeof m === 'string') : [],
  };
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

/** A finished render, with byte ranges so it can be played and sought. Anything but a finished render is a 404. */
async function serveRender(req: IncomingMessage, res: ServerResponse, project: Project, route: RegExpExecArray): Promise<void> {
  const slug = safeDecode(route[1]!);
  const file = safeDecode(route[2]!);
  const path = slug === null || file === null ? null : await project.renderFile(slug, file).catch(() => null);
  if (path) await sendRanged(req, res, path);
  else sendNotFound(res);
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
      const { pathname, searchParams } = new URL(req.url ?? '/', 'http://localhost');
      const versionRoute = VERSION_API.exec(pathname);
      const commentsRoute = COMMENTS_API.exec(pathname);
      const commentRoute = COMMENT_API.exec(pathname);
      const noteRoute = NOTE_API.exec(pathname);
      const approvalRoute = APPROVAL_API.exec(pathname);
      const versionsRoute = VERSIONS_API.exec(pathname);
      const batchRoute = BATCH_API.exec(pathname);
      const footageRoute = FOOTAGE_ROUTE.exec(pathname);
      const mediaRoute = MEDIA_ROUTE.exec(pathname);
      const versionMediaRoute = VERSION_MEDIA_ROUTE.exec(pathname);
      const waveformRoute = WAVEFORM_API.exec(pathname);
      const speechRoute = SPEECH_API.exec(pathname);
      const editsRoute = EDITS_API.exec(pathname);
      const saveRoute = SAVE_API.exec(pathname);
    const saveAndRenderRoute = SAVE_AND_RENDER_API.exec(pathname);
    const overloadRoute = OVERLOAD_API.exec(pathname);
      const mediaModelRoute = MEDIA_MODEL_API.exec(pathname);
      const handoffRoute = HANDOFF_API.exec(pathname);
      const transcriptionRoute = TRANSCRIPTION_API.exec(pathname);
      const renderRoute = RENDER_API.exec(pathname);
      const renderSettingsRoute = RENDER_SETTINGS_API.exec(pathname);
      const rendersListRoute = RENDERS_LIST_API.exec(pathname);
      const revealRoute = REVEAL_API.exec(pathname);
      const renderFileRoute = RENDER_FILE_ROUTE.exec(pathname);
      if (commentsRoute) {
        await handleComments(req, res, project, commentsRoute);
      } else if (commentRoute) {
        await handleComment(req, res, project, commentRoute);
      } else if (noteRoute) {
        await handleNote(req, res, project, noteRoute);
      } else if (approvalRoute) {
        await handleApproval(req, res, project, approvalRoute);
      } else if (batchRoute) {
        await handleBatch(req, res, project, batchRoute);
      } else if (editsRoute) {
        await handleEdits(req, res, project, editsRoute);
      } else if (saveRoute && req.method === 'POST') {
        const slug = safeDecode(saveRoute[1]!);
        if (slug === null) sendJson(res, 404, { error: 'Not found' });
        else sendJson(res, 200, await project.saveEdits(slug));
      } else if (handoffRoute && req.method === 'DELETE') {
        const slug = safeDecode(handoffRoute[1]!);
        if (slug === null) sendJson(res, 404, { error: 'Not found' });
        else sendJson(res, 200, await project.cancelHandoff(slug));
      } else if (overloadRoute && req.method === 'GET') {
        // `?version=<n>` measures that saved version; without it, the pending mix Save would preserve.
        const slug = safeDecode(overloadRoute[1]!);
        const asked = searchParams.get('version');
        const version = asked === null ? undefined : Number(asked);
        if (slug === null || (version !== undefined && !(Number.isInteger(version) && version > 0))) sendJson(res, 404, { error: 'Not found' });
        else sendJson(res, 200, await project.mixOverload(slug, version));
      } else if (saveAndRenderRoute && req.method === 'POST') {
        const slug = safeDecode(saveAndRenderRoute[1]!);
        if (slug === null) sendJson(res, 404, { error: 'Not found' });
        else sendJson(res, 201, await project.saveAndRender({ ...(await readRenderChoice(req)), reel: slug }));
      } else if (pathname === '/api/renders' && req.method === 'POST') {
        sendJson(res, 201, await project.render(await readRenderRequest(req)));
      } else if (renderRoute && req.method === 'DELETE') {
        const id = safeDecode(renderRoute[1]!);
        if (id === null) sendJson(res, 404, { error: 'Not found' });
        else sendJson(res, 200, await project.cancelRender(id));
      } else if (revealRoute && req.method === 'POST') {
        const slug = safeDecode(revealRoute[1]!);
        const file = safeDecode(revealRoute[2]!);
        if (slug === null || file === null) sendJson(res, 404, { error: 'Not found' });
        else {
          await project.revealRender(slug, file);
          res.writeHead(HTTP_NO_CONTENT).end();
        }
      } else if (pathname === '/api/reels/brief' && req.method === 'POST') {
        sendJson(res, 201, await project.startReelFromBrief((await readJsonBody(req)) as NewBriefReel));
      } else if (pathname === '/api/reels' && req.method === 'POST') {
        sendJson(res, 201, await project.startReel((await readJsonBody(req)) as NewReel));
      } else if (pathname === '/api/footage' && req.method === 'POST') {
        // The body is the video itself, streamed to disk: no size limit and never held in memory.
        const name = new URL(req.url ?? '/', 'http://localhost').searchParams.get('name') ?? '';
        const imported = await project.importVideo(name, req);
        sendJson(res, imported.copied ? 201 : 200, imported);
      } else if (pathname === '/api/media' && req.method === 'POST') {
        const imported = await project.importMedia(searchParams.get('name') ?? '', req);
        sendJson(res, imported.copied ? 201 : 200, imported);
      } else if (pathname === '/api/media/reference' && req.method === 'POST') {
        const body = await readJsonBody(req) as { path?: unknown };
        if (typeof body.path !== 'string') throw new BadRequest(400, 'Choose a project media path.');
        sendJson(res, 200, await project.referenceMedia(body.path));
      } else if (pathname === '/api/media/relink' && req.method === 'POST') {
        const body = await readJsonBody(req) as { source?: unknown; path?: unknown };
        if (typeof body.source !== 'string' || typeof body.path !== 'string') throw new BadRequest(400, 'Choose a source and project media path.');
        sendJson(res, 200, await project.relinkMedia(body.source, body.path));
      } else if (speechRoute && (req.method === 'GET' || req.method === 'POST')) {
        const source = safeDecode(speechRoute[1]!);
        const reel = searchParams.get('reel');
        const version = Number(searchParams.get('version'));
        if (source === null || (reel && (!Number.isInteger(version) || version <= 0))) throw new BadRequest(400, 'Choose a source and saved version.');
        const saved = reel ? { reel, version } : undefined;
        sendJson(res, 200, req.method === 'POST' ? await project.transcribeMedia(source, saved) : await project.mediaSpeech(source, saved));
      } else if (req.method !== 'GET' && req.method !== 'HEAD') {
        res.writeHead(405).end();
      } else if (footageRoute) {
        await serveFootage(req, res, project, footageRoute);
      } else if (mediaRoute || versionMediaRoute) {
        const route = (versionMediaRoute ?? mediaRoute)!;
        const source = safeDecode(route[versionMediaRoute ? 3 : 1]!);
        const reel = versionMediaRoute ? safeDecode(route[1]!) : undefined;
        const saved = versionMediaRoute && reel ? { reel, version: Number(route[2]) } : undefined;
        const file = source === null || reel === null ? null : await project.mediaFile(source, saved);
        if (file) await sendRanged(req, res, file);
        else sendNotFound(res);
      } else if (pathname === '/api/media/project') {
        sendJson(res, 200, { files: await project.listProjectMedia() });
      } else if (pathname === '/api/media') {
        const kind = searchParams.get('kind');
        if (kind !== null && !['video', 'image', 'audio'].includes(kind)) throw new BadRequest(400, 'Choose video, image or audio.');
        sendJson(res, 200, { media: await project.listMedia({ ...(kind ? { kind: kind as 'video' | 'image' | 'audio' } : {}), search: searchParams.get('search') ?? '' }) });
      } else if (waveformRoute) {
        const source = safeDecode(waveformRoute[1]!);
        const reel = searchParams.get('reel');
        const version = Number(searchParams.get('version'));
        if (source === null || (reel && (!Number.isInteger(version) || version <= 0))) throw new BadRequest(400, 'Choose a source and saved version.');
        sendJson(res, 200, await project.mediaWaveform(source, reel ? { reel, version } : undefined));
      } else if (renderFileRoute) {
        await serveRender(req, res, project, renderFileRoute);
      } else if (pathname === '/api/project') {
        sendJson(res, 200, { name: project.name });
      } else if (transcriptionRoute) {
        const slug = safeDecode(transcriptionRoute[1]!);
        if (slug === null) sendJson(res, 404, { error: 'Not found' });
        else sendJson(res, 200, { progress: project.transcriptionProgress(slug) });
      } else if (pathname === '/api/renders') {
        sendJson(res, 200, { jobs: project.renderJobs() });
      } else if (rendersListRoute) {
        const slug = safeDecode(rendersListRoute[1]!);
        if (slug === null) sendJson(res, 404, { error: 'Not found' });
        else sendJson(res, 200, { renders: await project.listRenders(slug) });
      } else if (renderSettingsRoute) {
        const slug = safeDecode(renderSettingsRoute[1]!);
        if (slug === null) sendJson(res, 404, { error: 'Not found' });
        else sendJson(res, 200, { settings: await project.renderSettings(slug) });
      } else if (pathname === '/api/videos') {
        sendJson(res, 200, { videos: await project.listVideos() });
      } else if (pathname === '/api/tools') {
        sendJson(res, 200, await checkTools());
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
      } else if (mediaModelRoute) {
        const slug = safeDecode(mediaModelRoute[1]!);
        if (slug === null) sendNotFound(res);
        else sendJson(res, 200, await project.readMediaModel(slug));
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
