import type {
  TokenBucketConfig,
  TokenBucketConsumeResult,
  TokenBucketState,
} from "../types/tokenBucket.types.js";

const MILLISECONDS_PER_SECOND = 1000;
const CONSUME_COST = 1;
const TOKEN_EPSILON = 1e-9;

const clamp = (value: number, min: number, max: number): number => {
  return Math.min(Math.max(value, min), max);
};

const normalizeTokenValue = (value: number): number => {
  const nonNegativeValue = value < 0 ? 0 : value;
  if (Math.abs(nonNegativeValue) < TOKEN_EPSILON) {
    return 0;
  }

  // Keep precision stable for repeated arithmetic updates.
  return Number(nonNegativeValue.toFixed(9));
};

const validateConfig = (config: Readonly<TokenBucketConfig>): void => {
  if (!Number.isFinite(config.capacity) || config.capacity <= 0) {
    throw new Error("TokenBucketConfig.capacity must be a positive number.");
  }

  if (!Number.isFinite(config.refillRate) || config.refillRate <= 0) {
    throw new Error("TokenBucketConfig.refillRate must be a positive number.");
  }
};

const validateState = (state: Readonly<TokenBucketState>): void => {
  if (!Number.isFinite(state.tokens)) {
    throw new Error("TokenBucketState.tokens must be a finite number.");
  }

  if (!Number.isFinite(state.lastRefillTimestampMs)) {
    throw new Error(
      "TokenBucketState.lastRefillTimestampMs must be a finite number.",
    );
  }
};

export const computeTokenBucketState = (
  state: Readonly<TokenBucketState>,
  now: number,
  config: Readonly<TokenBucketConfig>,
): TokenBucketState => {
  validateConfig(config);
  validateState(state);

  if (!Number.isFinite(now)) {
    throw new Error("now must be a finite millisecond timestamp.");
  }

  const safeNow = Math.max(0, Math.floor(now));
  const safeLastRefill = Math.max(0, Math.floor(state.lastRefillTimestampMs));
  const elapsedMs = safeNow - safeLastRefill;
  const nonNegativeElapsedMs = elapsedMs > 0 ? elapsedMs : 0;

  const refillPerMs = config.refillRate / MILLISECONDS_PER_SECOND;
  const refillAmount = nonNegativeElapsedMs * refillPerMs;

  const normalizedCurrentTokens = normalizeTokenValue(state.tokens);
  const nextTokens = clamp(
    normalizeTokenValue(normalizedCurrentTokens + refillAmount),
    0,
    config.capacity,
  );

  // If time went backward, preserve monotonic refill anchor.
  const nextLastRefillTimestampMs =
    safeNow >= safeLastRefill ? safeNow : safeLastRefill;

  return {
    tokens: nextTokens,
    lastRefillTimestampMs: nextLastRefillTimestampMs,
  };
};

export const tryConsumeToken = (
  state: Readonly<TokenBucketState>,
): TokenBucketConsumeResult & { nextState: TokenBucketState } => {
  validateState(state);

  const availableTokens = normalizeTokenValue(state.tokens);
  const hasToken = availableTokens + TOKEN_EPSILON >= CONSUME_COST;

  if (!hasToken) {
    return {
      allowed: false,
      remainingTokens: availableTokens,
      nextState: {
        tokens: availableTokens,
        lastRefillTimestampMs: state.lastRefillTimestampMs,
      },
    };
  }

  const remainingTokens = normalizeTokenValue(availableTokens - CONSUME_COST);
  return {
    allowed: true,
    remainingTokens,
    nextState: {
      tokens: remainingTokens,
      lastRefillTimestampMs: state.lastRefillTimestampMs,
    },
  };
};
