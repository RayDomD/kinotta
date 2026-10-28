import { afterEach, describe, expect, it, vi } from 'vitest';
import { decidePinNote, fetchProject } from '../../web/src/api/_internal/client.ts';

describe('client API error handling and 204 handling', () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it('handles 204 No Content without JSON parsing errors', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 204,
      headers: new Headers(),
      json: vi.fn().mockRejectedValue(new SyntaxError('Unexpected end of JSON input')),
    } as unknown as Response);

    await expect(decidePinNote('demo-slug', 'note-1', true)).resolves.toBeUndefined();
  });

  it('handles 200 with content-length 0 without JSON parsing errors', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers({ 'content-length': '0' }),
      json: vi.fn().mockRejectedValue(new SyntaxError('Unexpected end of JSON input')),
    } as unknown as Response);

    await expect(decidePinNote('demo-slug', 'note-1', true)).resolves.toBeUndefined();
  });

  it('surfaces a friendly error when Kinotta server is unreachable', async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'));

    await expect(fetchProject()).rejects.toThrow(
      'Could not reach the Kinotta server. Check your connection and retry.'
    );
  });

  it('preserves AbortError without wrapping it in connection error', async () => {
    const abortErr = new Error('The user aborted a request.');
    abortErr.name = 'AbortError';
    globalThis.fetch = vi.fn().mockRejectedValue(abortErr);

    await expect(fetchProject()).rejects.toThrow('The user aborted a request.');
  });

  it('extracts server JSON error message on HTTP error status', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 400,
      headers: new Headers({ 'content-type': 'application/json' }),
      json: vi.fn().mockResolvedValue({ error: 'Reel name is already taken' }),
    } as unknown as Response);

    await expect(fetchProject()).rejects.toThrow('Reel name is already taken');
  });
});
