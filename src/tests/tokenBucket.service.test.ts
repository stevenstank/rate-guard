import {
  computeTokenBucketState,
  tryConsumeToken,
} from "../services/tokenBucket.service.js";
import type { TokenBucketConfig, TokenBucketState } from "../types/tokenBucket.types.js";

describe("tokenBucket.service - pure logic", () => {
  it("refills tokens proportionally based on elapsed time", () => {
    const config: TokenBucketConfig = { capacity: 10, refillRate: 2 };
    const initial: TokenBucketState = { tokens: 2, lastRefillTimestampMs: 1_000 };

    const next = computeTokenBucketState(initial, 2_000, config);

    expect(next.tokens).toBe(4);
    expect(next.lastRefillTimestampMs).toBe(2_000);
  });

  it("caps tokens at capacity", () => {
    const config: TokenBucketConfig = { capacity: 10, refillRate: 10 };
    const initial: TokenBucketState = { tokens: 9.5, lastRefillTimestampMs: 0 };

    const next = computeTokenBucketState(initial, 1_000, config);

    expect(next.tokens).toBe(10);
  });

  it("consumes one token when available", () => {
    const initial: TokenBucketState = { tokens: 1.2, lastRefillTimestampMs: 10 };

    const result = tryConsumeToken(initial);

    expect(result.allowed).toBe(true);
    expect(result.remainingTokens).toBeCloseTo(0.2, 6);
    expect(result.nextState.tokens).toBeCloseTo(0.2, 6);
  });

  it("blocks when no token is available", () => {
    const initial: TokenBucketState = { tokens: 0.4, lastRefillTimestampMs: 10 };

    const result = tryConsumeToken(initial);

    expect(result.allowed).toBe(false);
    expect(result.remainingTokens).toBeCloseTo(0.4, 6);
  });

  it("handles timestamps moving backwards without negative refill", () => {
    const config: TokenBucketConfig = { capacity: 5, refillRate: 1 };
    const initial: TokenBucketState = { tokens: 2, lastRefillTimestampMs: 2_000 };

    const next = computeTokenBucketState(initial, 1_900, config);

    expect(next.tokens).toBe(2);
    expect(next.lastRefillTimestampMs).toBe(2_000);
  });

  it("throws for zero capacity configuration", () => {
    const config: TokenBucketConfig = { capacity: 0, refillRate: 1 };
    const initial: TokenBucketState = { tokens: 1, lastRefillTimestampMs: 0 };

    expect(() => computeTokenBucketState(initial, 1_000, config)).toThrow(
      "TokenBucketConfig.capacity must be a positive number.",
    );
  });

  it("remains stable for extremely high refill rates", () => {
    const config: TokenBucketConfig = { capacity: 1_000_000, refillRate: 1_000_000 };
    const initial: TokenBucketState = { tokens: 0, lastRefillTimestampMs: 0 };

    const next = computeTokenBucketState(initial, 60_000, config);

    expect(next.tokens).toBe(1_000_000);
    expect(Number.isFinite(next.tokens)).toBe(true);
  });

  it("normalizes negative token input to zero before consumption", () => {
    const initial: TokenBucketState = { tokens: -5, lastRefillTimestampMs: 0 };

    const result = tryConsumeToken(initial);

    expect(result.allowed).toBe(false);
    expect(result.remainingTokens).toBe(0);
  });
});
