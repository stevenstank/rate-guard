import type { RateLimitConfig } from "../types/rateLimit.types.js";

export interface RateLimitStoreConfig {
  cleanupIntervalMs: number;
  maxStoreSize: number;
}

export const DEFAULT_RATE_LIMIT_CONFIG: Readonly<RateLimitConfig> = Object.freeze(
  {
    windowSizeInSeconds: 60,
    maxRequests: 10,
    prefix: "rate_limit",
    enableRedis: true,
  },
);

export const RL_TEST_RATE_LIMIT_CONFIG: Readonly<RateLimitConfig> = Object.freeze(
  {
    windowSizeInSeconds: 10,
    maxRequests: 3,
    prefix: "rate_limit",
    enableRedis: false,
  },
);

export const LOGIN_RATE_LIMIT_CONFIG: Readonly<RateLimitConfig> = Object.freeze(
  {
    windowSizeInSeconds: 60,
    maxRequests: 5,
    prefix: "rate_limit",
    enableRedis: true,
  },
);

export const API_RATE_LIMIT_CONFIG: Readonly<RateLimitConfig> = Object.freeze({
  windowSizeInSeconds: 60,
  maxRequests: 100,
  prefix: "rate_limit",
  enableRedis: true,
});

export const DEFAULT_RATE_LIMIT_STORE_CONFIG: Readonly<RateLimitStoreConfig> =
  Object.freeze({
    cleanupIntervalMs: 60_000,
    maxStoreSize: 50_000,
  });
