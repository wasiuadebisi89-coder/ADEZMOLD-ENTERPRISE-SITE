import { logger } from 'firebase-functions/v2';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { CommandError } from './lib/errors.js';
import { resolveCaller, runCommand } from './lib/command.js';
import { RateLimiter } from './lib/rate-limit.js';
import { COMMANDS } from './registry.js';

const REGION = process.env.FUNCTIONS_REGION ?? 'europe-west1';
const limiter = new RateLimiter(Number(process.env.RATE_LIMIT_PER_MINUTE ?? 300));

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
    // Caps cost and, with the per-user limit, how hard one account can drive the API.
    maxInstances: Number(process.env.MAX_INSTANCES ?? 10),
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
    if (!limiter.allow(request.auth.uid)) {
      logger.warn('Rate limited', { event: 'command', name, uid: request.auth.uid });
      throw new HttpsError(
        'resource-exhausted',
        'Too many requests. Wait a minute and try again.',
        {
          reason: 'rate_limited',
        },
      );
    }

    const started = Date.now();
    const companyId = (body.input as { companyId?: unknown } | undefined)?.companyId;
    // One structured line per command, for log-based metrics and alerts (docs/bms/OPERATIONS.md).
    const log = (outcome: string, extra: Record<string, unknown> = {}) =>
      logger.info('Command', {
        event: 'command',
        name,
        uid: request.auth!.uid,
        companyId: typeof companyId === 'string' ? companyId : undefined,
        outcome,
        durationMs: Date.now() - started,
        ...extra,
      });
    try {
      const caller = await resolveCaller({
        uid: request.auth.uid,
        email: request.auth.token.email,
        email_verified: request.auth.token.email_verified,
        auth_time: request.auth.token.auth_time,
        platformAdmin: request.auth.token.platformAdmin,
      });
      const headers = request.rawRequest?.headers ?? {};
      const result = await runCommand(command, body.input, caller, {
        ip: request.rawRequest?.ip,
        userAgent: typeof headers['user-agent'] === 'string' ? headers['user-agent'] : undefined,
      });
      log('ok');
      return result;
    } catch (e) {
      if (e instanceof CommandError) {
        log('refused', { reason: e.reason });
        throw e.toHttpsError();
      }
      if (e instanceof HttpsError) {
        log('refused', { reason: e.code });
        throw e;
      }
      log('error');
      logger.error('Command failed', {
        event: 'command_error',
        name,
        uid: request.auth.uid,
        error: e,
      });
      throw new HttpsError('internal', 'Something went wrong. Nothing was saved.');
    }
  },
);
