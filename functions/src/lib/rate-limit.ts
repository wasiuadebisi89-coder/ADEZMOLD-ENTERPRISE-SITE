/**
 * Best-effort limit on commands per user, kept in each function instance's memory
 * (docs/bms/SECURITY_REVIEW.md §4). With `maxInstances` capping the instances, it bounds how
 * fast one signed-in account can call the API without adding a database write to every call.
 * It is not a quota: App Check, Firebase Auth's own sign-in limits and the budget alert are the
 * other layers.
 */
export class RateLimiter {
  private readonly hits = new Map<string, { windowStart: number; count: number }>();

  constructor(
    private readonly perMinute: number,
    private readonly clock: () => number = Date.now,
  ) {}

  /** True when the call may go ahead. A limit of 0 or less turns the limiter off. */
  allow(key: string): boolean {
    if (this.perMinute <= 0) return true;
    const now = this.clock();
    const entry = this.hits.get(key);
    if (!entry || now - entry.windowStart >= 60_000) {
      if (this.hits.size > 10_000) this.prune(now);
      this.hits.set(key, { windowStart: now, count: 1 });
      return true;
    }
    entry.count += 1;
    return entry.count <= this.perMinute;
  }

  private prune(now: number) {
    for (const [k, v] of this.hits) if (now - v.windowStart >= 60_000) this.hits.delete(k);
  }
}
