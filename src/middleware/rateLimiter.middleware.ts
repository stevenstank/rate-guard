import type { NextFunction, Request, RequestHandler, Response } from "express";

import { evaluateRateLimit } from "../services/rateLimiter.service.js";
import { info, warn } from "../utils/logger.js";
import type {
  RateLimitResult,
  RateLimiterConfig,
} from "../types/rateLimiter.types.js";

const RATE_LIMITER_UNAVAILABLE_MESSAGE = "Rate limiter temporarily unavailable";

interface TooManyRequestsResponse {
  error: string;
  retryAfter: number;
}

interface ServiceUnavailableResponse {
  error: string;
}

interface RateLimitLogPayload {
  event: "rate_limit_exceeded" | "rate_limit_near_limit";
  ip: string;
  endpoint: string;
  method: string;
  limit: number;
  remaining: number;
  timestamp: string;
}

const applyRateLimitHeaders = (
  res: Response,
  limit: number,
  remaining: number,
  resetTime: number,
): void => {
  res.setHeader("X-RateLimit-Limit", String(limit));
  res.setHeader("X-RateLimit-Remaining", String(remaining));
  res.setHeader("X-RateLimit-Reset", String(resetTime));
};

const calculateRetryAfterSeconds = (resetTime: number): number => {
  const millisecondsUntilReset = Math.max(0, resetTime - Date.now());
  return Math.ceil(millisecondsUntilReset / 1_000);
};

const sendTooManyRequestsResponse = (
  res: Response,
  resetTime: number,
  errorMessage: string,
): void => {
  const responseBody: TooManyRequestsResponse = {
    error: errorMessage,
    retryAfter: calculateRetryAfterSeconds(resetTime),
  };
  res.status(429).json(responseBody);
};

const sendServiceUnavailableResponse = (res: Response): void => {
  const responseBody: ServiceUnavailableResponse = {
    error: RATE_LIMITER_UNAVAILABLE_MESSAGE,
  };
  res.status(503).json(responseBody);
};

const logRateLimitEvent = (
  enabled: boolean,
  payload: Readonly<RateLimitLogPayload>,
): void => {
  if (!enabled) {
    return;
  }

  if (payload.event === "rate_limit_exceeded") {
    warn(payload);
    return;
  }

  info(payload);
};

const extractIdentifierFromKey = (key: string): string => {
  const keyParts = key.split(":");
  return keyParts.length >= 3 ? keyParts[1] : "unknown";
};

export function createRateLimiter(config: RateLimiterConfig): RequestHandler {
  const redisErrorStrategy = config.onRedisError ?? "fail-open";
  const enableLogging = config.enableLogging ?? true;
  const rateLimitErrorMessage = config.errorMessage ?? "Too many requests";

  return async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    let result: RateLimitResult;
    try {
      result = await evaluateRateLimit(req, config);
    } catch (rateLimitError: unknown) {
      const message =
        rateLimitError instanceof Error
          ? rateLimitError.message
          : "Unknown rate limiter evaluation error";
      warn({ event: "rate_limit_evaluation_failed", message, path: req.path });
      if (redisErrorStrategy === "fail-closed") {
        sendServiceUnavailableResponse(res);
        return;
      }
      next();
      return;
    }

    applyRateLimitHeaders(res, result.limit, result.remaining, result.resetTime);

    if (result.degraded) {
      warn({
        event: "rate_limit_degraded",
        key: result.key,
        error: result.error ?? "unknown",
      });
      if (redisErrorStrategy === "fail-closed") {
        sendServiceUnavailableResponse(res);
        return;
      }
      next();
      return;
    }

    const eventBase: Omit<RateLimitLogPayload, "event"> = {
      ip: extractIdentifierFromKey(result.key),
      endpoint: req.path,
      method: req.method,
      limit: result.limit,
      remaining: result.remaining,
      timestamp: new Date().toISOString(),
    };

    if (!result.allowed) {
      logRateLimitEvent(enableLogging, {
        event: "rate_limit_exceeded",
        ...eventBase,
      });
      sendTooManyRequestsResponse(res, result.resetTime, rateLimitErrorMessage);
      return;
    }

    if (result.nearLimit) {
      logRateLimitEvent(enableLogging, {
        event: "rate_limit_near_limit",
        ...eventBase,
      });
    }

    next();
  };
}
