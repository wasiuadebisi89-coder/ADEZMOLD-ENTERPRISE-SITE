import { FirebaseError } from 'firebase/app';
import { httpsCallable } from 'firebase/functions';
import type { CommandInput, CommandName } from '@bms/schemas';
import { functions } from './firebase';

const apiCallable = httpsCallable<{ name: string; input: unknown }, unknown>(functions, 'api');

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly reason: string,
    public readonly fields: Record<string, string> = {},
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

/** Input without the idempotency key, which `runCommand` adds. */
export type CommandPayload<N extends CommandName> = Omit<CommandInput<N>, 'idempotencyKey'>;

/**
 * Sends a command. Pass the same `idempotencyKey` when retrying the same user action so a
 * network retry cannot apply it twice; by default each call is a new action.
 */
export async function runCommand<R = Record<string, unknown>, N extends CommandName = CommandName>(
  name: N,
  input: CommandPayload<N>,
  idempotencyKey: string = crypto.randomUUID(),
): Promise<R> {
  try {
    // Callable encoding turns undefined into null; drop undefined fields so optional ones stay absent.
    const body = JSON.parse(JSON.stringify({ ...input, idempotencyKey })) as unknown;
    const res = await apiCallable({ name, input: body });
    return res.data as R;
  } catch (e) {
    if (e instanceof FirebaseError) {
      const details = (
        e as FirebaseError & { details?: { reason?: string; fields?: Record<string, string> } }
      ).details;
      throw new ApiError(
        e.message.replace(/\s*\[\d+\]$/, ''),
        details?.reason ?? e.code,
        details?.fields ?? {},
      );
    }
    throw new ApiError(
      'Could not reach the server. Check your connection and try again.',
      'network',
    );
  }
}

export function errorMessage(e: unknown): string {
  if (e instanceof ApiError || e instanceof Error) return e.message;
  return 'Something went wrong';
}
