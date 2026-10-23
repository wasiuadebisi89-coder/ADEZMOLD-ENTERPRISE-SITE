import { useCallback, useRef, useState } from 'react';
import type { CommandName } from '@bms/schemas';
import { ApiError, runCommand, type CommandPayload } from './api';

/**
 * Runs a command for one user action. The idempotency key is kept until the action succeeds,
 * so retrying after a network failure cannot apply it twice.
 */
export function useAction() {
  const key = useRef(crypto.randomUUID());
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);

  const run = useCallback(
    async <R = Record<string, unknown>, N extends CommandName = CommandName>(
      name: N,
      input: CommandPayload<N>,
    ) => {
      setPending(true);
      setError(null);
      try {
        const result = await runCommand<R, N>(name, input, key.current);
        key.current = crypto.randomUUID();
        return result;
      } catch (e) {
        const err = e instanceof ApiError ? e : new ApiError('Something went wrong', 'unknown');
        setError(err);
        throw err;
      } finally {
        setPending(false);
      }
    },
    [],
  );

  const reset = useCallback(() => {
    setError(null);
    key.current = crypto.randomUUID();
  }, []);

  return { run, pending, error, reset };
}
