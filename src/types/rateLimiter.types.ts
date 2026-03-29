import type { Request } from "express";

export interface TokenBucketRuntimeConfig {
  capacity: number;
  refillRate: number;
  redisKeyPrefix: string;
  ttlSeconds?: number;
}

export interface RateLimiterConfig {
  tokenBucket: TokenBucketRuntimeConfig;
  errorMessage?: string;
  enableLogging?: boolean;
  onRedisError?: "fail-open" | "fail-closed";
  keyGenerator?: (req: Request) => string;
}

export interface RateLimiterConfigOverrides {
  tokenBucket?: Partial<TokenBucketRuntimeConfig>;
  errorMessage?: string;
  enableLogging?: boolean;
  onRedisError?: "fail-open" | "fail-closed";
  keyGenerator?: (req: Request) => string;
}

export interface RateLimitBackendState {
  ok: boolean;
  count: number;
  remaining: number;
  resetTime: number;
  error?: string;
}

export interface RateLimitResult {
  allowed: boolean;
  count: number;
  limit: number;
  remaining: number;
  resetTime: number;
  key: string;
  degraded: boolean;
  nearLimit: boolean;
  error?: string;
}
