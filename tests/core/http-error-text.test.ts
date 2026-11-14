import type { ServerResponse } from 'node:http';
import { expect, it, vi } from 'vitest';
import { KinottaError } from '../../server/core/_internal/errors.ts';
import { sendError } from '../../server/http/_internal/handler.ts';

function respond(err: unknown): { status: number; body: string } {
  const sent = { status: 0, body: '' };
  const res = { writeHead: (status: number) => { sent.status = status; }, end: (body: string) => { sent.body = body; } } as unknown as ServerResponse;
  sendError(res, err);
  return sent;
}

it('keeps absolute paths out of the 500 response and logs them instead (#136)', () => {
  const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);
  const error = Object.assign(new Error("EBUSY: resource busy, rename 'C:\Users\someone\project\.delete-abc'"), { code: 'EBUSY' });
  const sent = respond(error);
  expect(sent.status).toBe(500);
  expect(sent.body).not.toMatch(/Users|EBUSY|\.delete-/);
  expect(log).toHaveBeenCalledWith(error);
  log.mockRestore();
});

it('still shows the message of an expected error', () => {
  expect(respond(new KinottaError('frozen', 'Current is built on v2.'))).toEqual({ status: 409, body: JSON.stringify({ error: 'Current is built on v2.' }) });
});
