import type { Request } from "express";

export interface RateLimitConfig {
  /**
   * Duration of the fixed window in seconds.
   */
  windowSizeInSeconds: number;
  /**
   * Maximum number of allowed requests within a single window.
   */
  maxRequests: number;
  /**
   * Optional key prefix to namespace rate-limiter keys.
   */
  prefix?: string;
  /**
   * Enables Redis-backed counters when true. Falls back to memory when false.
   */
  enableRedis?: boolean;
  /**
   * Determines behavior when Redis is unavailable.
   * - "open": allow requests to continue.
   * - "closed": reject requests with service-unavailable response.
   */
  onError?: "open" | "closed";
  /**
   * Optional key generator used to derive a unique client identifier.
   * Falls back to IP-based resolution when omitted.
   */
  keyGenerator?: (req: Request) => string;
}
