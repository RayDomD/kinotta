export type KinottaErrorCode = 'not-found' | 'invalid';

/** A failure the caller can show: `not-found` for an unknown reel or version, `invalid` for unreadable files. */
export class KinottaError extends Error {
  constructor(
    readonly code: KinottaErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'KinottaError';
  }
}
