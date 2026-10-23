import { logger } from 'firebase-functions/v2';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { CommandError } from './lib/errors.js';
import { resolveCaller, runCommand } from './lib/command.js';
import { COMMANDS } from './registry.js';

const REGION = process.env.FUNCTIONS_REGION ?? 'europe-west1';

/**
 * Single callable entry point: `{ name, input }`. Every write in the product goes through here
 * (docs/bms/adr/0002-commands-only-writes.md).
 */
export const api = onCall(
  {
    region: REGION,
    enforceAppCheck: process.env.ENFORCE_APP_CHECK === 'true',
    memory: '256MiB',
    timeoutSeconds: 60,
  },
  async (request) => {
    if (!request.auth) throw new HttpsError('unauthenticated', 'Please sign in');
    const body = (request.data ?? {}) as { name?: unknown; input?: unknown };
    const name = typeof body.name === 'string' ? body.name : '';
    const command = Object.hasOwn(COMMANDS, name)
      ? COMMANDS[name as keyof typeof COMMANDS]
      : undefined;
    if (!command)
      throw new HttpsError('not-found', 'Unknown command', { reason: 'unknown_command' });

    try {
      const caller = await resolveCaller({
        uid: request.auth.uid,
        email: request.auth.token.email,
        email_verified: request.auth.token.email_verified,
        auth_time: request.auth.token.auth_time,
        platformAdmin: request.auth.token.platformAdmin,
      });
      const headers = request.rawRequest?.headers ?? {};
      return await runCommand(command, body.input, caller, {
        ip: request.rawRequest?.ip,
        userAgent: typeof headers['user-agent'] === 'string' ? headers['user-agent'] : undefined,
      });
    } catch (e) {
      if (e instanceof CommandError) throw e.toHttpsError();
      if (e instanceof HttpsError) throw e;
      logger.error('Command failed', { name, uid: request.auth.uid, error: e });
      throw new HttpsError('internal', 'Something went wrong. Nothing was saved.');
    }
  },
);
