import type { IncomingMessage, ServerResponse } from 'node:http';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { extname, join, normalize, sep } from 'node:path';
import type { Project } from '../../core/index.ts';

const CONTENT_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.png': 'image/png',
};

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { 'content-type': CONTENT_TYPES['.json'], 'cache-control': 'no-store' });
  res.end(JSON.stringify(body));
}

async function fileIn(root: string, urlPath: string): Promise<string | null> {
  const relative = normalize(decodeURIComponent(urlPath)).replace(/^[\\/]+/, '');
  const candidate = join(root, relative);
  if (candidate !== root && !candidate.startsWith(root + sep)) return null;
  try {
    return (await stat(candidate)).isFile() ? candidate : null;
  } catch {
    return null;
  }
}

async function serveStatic(res: ServerResponse, webRoot: string, urlPath: string): Promise<void> {
  const file = (await fileIn(webRoot, urlPath)) ?? (extname(urlPath) ? null : await fileIn(webRoot, 'index.html'));
  if (!file) {
    res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
    res.end('Not found');
    return;
  }
  res.writeHead(200, { 'content-type': CONTENT_TYPES[extname(file)] ?? 'application/octet-stream' });
  createReadStream(file).pipe(res);
}

export function createHandler(project: Project, webRoot: string) {
  return async (req: IncomingMessage, res: ServerResponse): Promise<void> => {
    try {
      const { pathname } = new URL(req.url ?? '/', 'http://localhost');
      if (req.method !== 'GET' && req.method !== 'HEAD') {
        res.writeHead(405).end();
      } else if (pathname === '/api/project') {
        sendJson(res, 200, { name: project.name });
      } else if (pathname === '/api/reels') {
        sendJson(res, 200, await project.listReels());
      } else if (pathname.startsWith('/api/')) {
        sendJson(res, 404, { error: 'Not found' });
      } else {
        await serveStatic(res, webRoot, pathname);
      }
    } catch (err) {
      sendJson(res, 500, { error: err instanceof Error ? err.message : 'Server error' });
    }
  };
}
