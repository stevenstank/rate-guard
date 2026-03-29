import type { NextFunction, Request, RequestHandler, Response } from "express";

import { info } from "../utils/logger.js";
import { MemoryStore } from "../store/memoryStore.js";
import type { RateLimitConfig } from "../types/rateLimit.js";
import type {
  RateLimitStore,
  RateLimitStoreRecord,
} from "../types/rateLimitStore.js";

const UNKNOWN_IDENTIFIER = "unknown";
const TOO_MANY_REQUESTS_MESSAGE = "Too many requests";

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
  if (config.windowMs <= 0) {
    throw new Error("rateLimiter config error: windowMs must be greater than 0");
  }

  if (config.maxRequests <= 0) {
    throw new Error(
      "rateLimiter config error: maxRequests must be greater than 0",
    );
  }
};

export function createRateLimiter(config: RateLimitConfig): RequestHandler {
  validateConfig(config);

  const { windowMs, maxRequests, keyGenerator } = config;
  const generateKey: (req: Request) => string = resolveKeyGenerator(keyGenerator);

  const store: RateLimitStore = new MemoryStore();

  return (req: Request, res: Response, next: NextFunction): void => {
    const key: string = getRequestKey(req, generateKey);
    const result: RateLimitStoreRecord = store.increment(key, windowMs);
    const resetTime: number = result.resetTime;
    const count: number = result.count;
    const remainingRequests: number = Math.max(0, maxRequests - count);

    applyRateLimitHeaders(res, maxRequests, remainingRequests, resetTime);

    info(
      `IP: ${key} | METHOD: ${req.method} | PATH: ${req.path} | WINDOW_MS: ${windowMs} | MAX_REQUESTS: ${maxRequests} | RESET_TIME: ${resetTime} | CURRENT_COUNT: ${count}`,
    );

    if (count > maxRequests) {
      sendTooManyRequestsResponse(res);
      return;
    }

    next();
  };
}
