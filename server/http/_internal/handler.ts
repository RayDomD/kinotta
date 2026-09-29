import type { IncomingMessage, ServerResponse } from 'node:http';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { extname, join, normalize, sep } from 'node:path';
import { KinottaError } from '../../core/index.ts';
import type { Project } from '../../core/index.ts';

const VERSION_API = /^\/api\/reels\/([^/]+)\/versions\/(\d+)$/;
const VERSION_FOLDER = /^v\d+$/;
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

function sendError(res: ServerResponse, err: unknown): void {
  if (err instanceof KinottaError) sendJson(res, err.code === 'not-found' ? 404 : 422, { error: err.message });
  else sendJson(res, 500, { error: err instanceof Error ? err.message : 'Server error' });
}

function sendFile(req: IncomingMessage, res: ServerResponse, file: string): void {
  res.writeHead(200, { 'content-type': CONTENT_TYPES[extname(file)] ?? 'application/octet-stream' });
  if (req.method === 'HEAD') res.end();
  else createReadStream(file).pipe(res);
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
      if (req.method !== 'GET' && req.method !== 'HEAD') {
        res.writeHead(405).end();
      } else if (pathname === '/api/project') {
        sendJson(res, 200, { name: project.name });
      } else if (pathname === '/api/reels') {
        sendJson(res, 200, await project.listReels());
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
