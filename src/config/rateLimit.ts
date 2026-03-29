import type { RateLimitConfig } from "../types/rateLimit.js";

export interface RateLimitStoreConfig {
  cleanupIntervalMs: number;
  maxStoreSize: number;
}

export const DEFAULT_RATE_LIMIT_CONFIG: Readonly<RateLimitConfig> = Object.freeze(
  {
    windowMs: 60_000,
    maxRequests: 10,
  },
);

export const RL_TEST_RATE_LIMIT_CONFIG: Readonly<RateLimitConfig> = Object.freeze(
  {
    windowMs: 10_000,
    maxRequests: 3,
  },
);

export const LOGIN_RATE_LIMIT_CONFIG: Readonly<RateLimitConfig> = Object.freeze(
  {
    windowMs: 60_000,
    maxRequests: 5,
  },
);

export const API_RATE_LIMIT_CONFIG: Readonly<RateLimitConfig> = Object.freeze({
  windowMs: 60_000,
  maxRequests: 100,
});

export const DEFAULT_RATE_LIMIT_STORE_CONFIG: Readonly<RateLimitStoreConfig> =
  Object.freeze({
    cleanupIntervalMs: 60_000,
    maxStoreSize: 50_000,
  });
