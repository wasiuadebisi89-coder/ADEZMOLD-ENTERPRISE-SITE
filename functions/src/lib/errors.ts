import { HttpsError, type FunctionsErrorCode } from 'firebase-functions/v2/https';

/**
 * Errors raised by commands. `code` maps to a callable error code; `reason` is a stable
 * machine-readable string the web app uses to show a specific message.
 */
export class CommandError extends Error {
  constructor(
    public readonly code: FunctionsErrorCode,
    public readonly reason: string,
    message: string,
    public readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = 'CommandError';
  }

  toHttpsError(): HttpsError {
    return new HttpsError(this.code, this.message, { reason: this.reason, ...this.details });
  }
}

export const denied = (reason: string, message = 'You do not have permission to do this') =>
  new CommandError('permission-denied', reason, message);
export const notFound = (reason: string, message: string) =>
  new CommandError('not-found', reason, message);
export const conflict = (reason: string, message: string) =>
  new CommandError('already-exists', reason, message);
export const failedPrecondition = (reason: string, message: string) =>
  new CommandError('failed-precondition', reason, message);
export const invalid = (reason: string, message: string, details?: Record<string, unknown>) =>
  new CommandError('invalid-argument', reason, message, details);
