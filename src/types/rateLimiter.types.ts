import type { Request } from "express";

export interface RateLimiterConfig {
  windowSizeInSeconds: number;
  maxRequests: number;
  enableLogging?: boolean;
  enableFallback?: boolean;
  prefix?: string;
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
