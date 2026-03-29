import type { Request } from "express";

export interface RateLimitConfig {
  /**
   * Duration of the fixed window in milliseconds.
   */
  windowMs: number;
  /**
   * Maximum number of allowed requests within a single window.
   */
  maxRequests: number;
  /**
   * Optional key generator used to derive a unique client identifier.
   * Falls back to IP-based resolution when omitted.
   */
  keyGenerator?: (req: Request) => string;
}
