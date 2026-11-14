export type KinottaErrorCode = 'not-found' | 'invalid' | 'frozen';

/**
 * A failure the caller can show: `not-found` for an unknown reel or version, `invalid` for unreadable files,
 * `frozen` for a change to a version that is no longer the newest.
 */
export class KinottaError extends Error {
  constructor(
    readonly code: KinottaErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'KinottaError';
  }
}
