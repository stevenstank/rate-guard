import type { RateLimiterConfigOverrides } from "../types/rateLimiter.types.js";
import {
  DEFAULT_RATE_LIMITER_CONFIG,
  resolveRateLimiterConfig,
} from "./validation.js";

const defaultRateLimitOverrides: Readonly<RateLimiterConfigOverrides> = {
  tokenBucket: {
    capacity: 10,
    refillRate: 10 / 60,
  },
  enableLogging: true,
  onRedisError: "fail-open",
};

const loginRateLimitOverrides: Readonly<RateLimiterConfigOverrides> = {
  tokenBucket: {
    capacity: 5,
    refillRate: 5 / 60,
  },
  enableLogging: true,
  onRedisError: "fail-open",
};

const apiRateLimitOverrides: Readonly<RateLimiterConfigOverrides> = {
  tokenBucket: {
    capacity: 100,
    refillRate: 100 / 60,
  },
  enableLogging: true,
  onRedisError: "fail-open",
};

const testRateLimitOverrides: Readonly<RateLimiterConfigOverrides> = {
  tokenBucket: {
    capacity: 3,
    refillRate: 3 / 10,
  },
  enableLogging: false,
  onRedisError: "fail-open",
};

export const DEFAULT_RATE_LIMIT_CONFIG = resolveRateLimiterConfig(
  "DEFAULT_RATE_LIMIT_CONFIG",
  defaultRateLimitOverrides,
  DEFAULT_RATE_LIMITER_CONFIG,
);

export const LOGIN_RATE_LIMIT_CONFIG = resolveRateLimiterConfig(
  "LOGIN_RATE_LIMIT_CONFIG",
  loginRateLimitOverrides,
  DEFAULT_RATE_LIMIT_CONFIG,
);

export const API_RATE_LIMIT_CONFIG = resolveRateLimiterConfig(
  "API_RATE_LIMIT_CONFIG",
  apiRateLimitOverrides,
  DEFAULT_RATE_LIMIT_CONFIG,
);

export const RL_TEST_RATE_LIMIT_CONFIG = resolveRateLimiterConfig(
  "RL_TEST_RATE_LIMIT_CONFIG",
  testRateLimitOverrides,
  DEFAULT_RATE_LIMIT_CONFIG,
);
