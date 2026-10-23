import { describe, expect, it } from 'vitest';
import { RateLimiter } from './rate-limit.js';

describe('rate limiter', () => {
  it('allows up to the limit per user per minute, then refuses until the minute passes', () => {
    let now = 0;
    const limiter = new RateLimiter(3, () => now);
    expect([1, 2, 3, 4].map(() => limiter.allow('a'))).toEqual([true, true, true, false]);
    expect(limiter.allow('b')).toBe(true);
    now = 59_999;
    expect(limiter.allow('a')).toBe(false);
    now = 60_000;
    expect(limiter.allow('a')).toBe(true);
  });

  it('is off when the limit is zero', () => {
    const limiter = new RateLimiter(0);
    for (let i = 0; i < 1000; i++) expect(limiter.allow('a')).toBe(true);
  });
});
