import type { RateLimiterConfig } from "../types/rateLimiter.types.js";
import { validateRateLimiterConfig } from "./validation.js";

const defaultRateLimitConfigInput: Readonly<RateLimiterConfig> = {
  windowSizeInSeconds: 60,
  maxRequests: 10,
  enableLogging: true,
  enableFallback: true,
  prefix: "rate_limit",
  onRedisError: "fail-open",
};

const rlTestRateLimitConfigInput: Readonly<RateLimiterConfig> = {
  windowSizeInSeconds: 10,
  maxRequests: 3,
  enableLogging: false,
  enableFallback: true,
  prefix: "rate_limit",
  onRedisError: "fail-open",
};

const loginRateLimitConfigInput: Readonly<RateLimiterConfig> = {
  windowSizeInSeconds: 60,
  maxRequests: 5,
  enableLogging: true,
  enableFallback: true,
  prefix: "rate_limit",
  onRedisError: "fail-open",
};

const apiRateLimitConfigInput: Readonly<RateLimiterConfig> = {
  windowSizeInSeconds: 60,
  maxRequests: 100,
  enableLogging: true,
  enableFallback: true,
  prefix: "rate_limit",
  onRedisError: "fail-open",
};

export const DEFAULT_RATE_LIMIT_CONFIG = validateRateLimiterConfig(
  "DEFAULT_RATE_LIMIT_CONFIG",
  defaultRateLimitConfigInput,
);

export const RL_TEST_RATE_LIMIT_CONFIG = validateRateLimiterConfig(
  "RL_TEST_RATE_LIMIT_CONFIG",
  rlTestRateLimitConfigInput,
);

export const LOGIN_RATE_LIMIT_CONFIG = validateRateLimiterConfig(
  "LOGIN_RATE_LIMIT_CONFIG",
  loginRateLimitConfigInput,
);

export const API_RATE_LIMIT_CONFIG = validateRateLimiterConfig(
  "API_RATE_LIMIT_CONFIG",
  apiRateLimitConfigInput,
);
