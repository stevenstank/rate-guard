import type { NextFunction, Request, RequestHandler, Response } from "express";

import { info, warn } from "../utils/logger.js";
import { redisService } from "../services/redis/redisService.js";
import type { RateLimitConfig } from "../types/rateLimit.types.js";

const UNKNOWN_IDENTIFIER = "unknown";
const TOO_MANY_REQUESTS_MESSAGE = "Too many requests";
const MILLISECONDS_PER_SECOND = 1000;
const RATE_LIMIT_KEY_PREFIX = "rate_limit";

interface TooManyRequestsResponse {
  error: string;
}

const normalizeIpAddress = (ipAddress: string): string => {
  if (ipAddress.startsWith("::ffff:")) {
    return ipAddress.slice("::ffff:".length);
  }

  return ipAddress;
};

const resolveIpIdentifier = (req: Request): string => {
  const rawIp = req.ip ?? req.socket.remoteAddress ?? UNKNOWN_IDENTIFIER;
  const normalizedIp = normalizeIpAddress(rawIp.trim());

  return normalizedIp.length > 0 ? normalizedIp : UNKNOWN_IDENTIFIER;
};

const resolveKeyGenerator = (
  keyGenerator: RateLimitConfig["keyGenerator"],
): ((req: Request) => string) => {
  if (keyGenerator) {
    return keyGenerator;
  }

  return (req: Request): string => {
    return req.ip ?? UNKNOWN_IDENTIFIER;
  };
};

const getRequestKey = (
  req: Request,
  keyGenerator: (req: Request) => string,
): string => {
  const generatedKey: string = keyGenerator(req);
  const normalizedKey: string = normalizeIpAddress(generatedKey.trim());

  if (normalizedKey.length > 0) {
    return normalizedKey;
  }

  return resolveIpIdentifier(req);
};

const applyRateLimitHeaders = (
  res: Response,
  maxRequests: number,
  remainingRequests: number,
  resetTime: number,
): void => {
  res.setHeader("X-RateLimit-Limit", String(maxRequests));
  res.setHeader("X-RateLimit-Remaining", String(remainingRequests));
  res.setHeader("X-RateLimit-Reset", String(resetTime));
};

const sendTooManyRequestsResponse = (res: Response): void => {
  const responseBody: TooManyRequestsResponse = {
    error: TOO_MANY_REQUESTS_MESSAGE,
  };
  res.status(429).json(responseBody);
};

const validateConfig = (config: Readonly<RateLimitConfig>): void => {
  if (config.windowSizeInSeconds <= 0) {
    throw new Error(
      "rateLimiter config error: windowSizeInSeconds must be greater than 0",
    );
  }

  if (config.maxRequests <= 0) {
    throw new Error(
      "rateLimiter config error: maxRequests must be greater than 0",
    );
  }
};

export function createRateLimiter(config: RateLimitConfig): RequestHandler {
  validateConfig(config);

  const { windowSizeInSeconds, maxRequests, keyGenerator } = config;
  const windowTtlSeconds: number = Math.max(1, windowSizeInSeconds);
  const generateKey: (req: Request) => string = resolveKeyGenerator(keyGenerator);

  return async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const identifier: string = getRequestKey(req, generateKey);
      const key = `${RATE_LIMIT_KEY_PREFIX}:${identifier}:${req.path}`;
      console.log("RateLimiter hit:", key);

      const count: number = await redisService.increment(key);

      if (count === 1) {
        await redisService.setExpiry(key, windowTtlSeconds);
      }
      let ttlSeconds: number | null = await redisService.getTtl(key);
      if (ttlSeconds === null) {
        await redisService.setExpiry(key, windowTtlSeconds);
        ttlSeconds = windowTtlSeconds;
      }
      const resetTime: number = Date.now() + ttlSeconds * MILLISECONDS_PER_SECOND;

      const remainingRequests: number = Math.max(0, maxRequests - count);

      applyRateLimitHeaders(res, maxRequests, remainingRequests, resetTime);

      info(
        `KEY: ${key} | METHOD: ${req.method} | PATH: ${req.path} | WINDOW_SECONDS: ${windowTtlSeconds} | MAX_REQUESTS: ${maxRequests} | RESET_TIME: ${resetTime} | CURRENT_COUNT: ${count}`,
      );

      if (count > maxRequests) {
        sendTooManyRequestsResponse(res);
        return;
      }

      next();
    } catch (rateLimitError: unknown) {
      const message =
        rateLimitError instanceof Error
          ? rateLimitError.message
          : "Unknown rate limiter error";
      warn(`Rate limiter error for path ${req.path}: ${message}`);
      // Fail open: allow request flow on Redis errors.
      next();
    }
  };
}
