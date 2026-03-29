import type { NextFunction, Request, RequestHandler, Response } from "express";

import { info } from "../utils/logger.js";
import {
  runStoreMaintenance,
  setRateLimitRecord,
  type RateLimitRecord,
} from "../store/rateLimitStore.js";
import {
  getOrCreateRecord,
  getUpdatedRecordForRequest,
  resolveIdentifier,
  shouldBlockRequest,
} from "../utils/rateLimitHelpers.js";

export interface RateLimitOptions {
  windowMs: number;
  maxRequests: number;
  cleanupIntervalMs: number;
  maxStoreSize: number;
}

export const defaultRateLimitOptions: Readonly<RateLimitOptions> = Object.freeze(
  {
    windowMs: 60_000,
    maxRequests: 10,
    cleanupIntervalMs: 60_000,
    maxStoreSize: 50_000,
  },
);

const validateRateLimitOptions = (options: Readonly<RateLimitOptions>): void => {
  if (options.windowMs <= 0) {
    throw new Error("rateLimiter config error: windowMs must be greater than 0");
  }

  if (options.maxRequests <= 0) {
    throw new Error(
      "rateLimiter config error: maxRequests must be greater than 0",
    );
  }

  if (options.cleanupIntervalMs <= 0) {
    throw new Error(
      "rateLimiter config error: cleanupIntervalMs must be greater than 0",
    );
  }

  if (options.maxStoreSize <= 0) {
    throw new Error(
      "rateLimiter config error: maxStoreSize must be greater than 0",
    );
  }
};

export function rateLimiter(
  optionsInput?: Readonly<Partial<RateLimitOptions>>,
): RequestHandler {
  const options: Readonly<RateLimitOptions> = {
    windowMs: optionsInput?.windowMs ?? defaultRateLimitOptions.windowMs,
    maxRequests: optionsInput?.maxRequests ?? defaultRateLimitOptions.maxRequests,
    cleanupIntervalMs:
      optionsInput?.cleanupIntervalMs ??
      defaultRateLimitOptions.cleanupIntervalMs,
    maxStoreSize: optionsInput?.maxStoreSize ?? defaultRateLimitOptions.maxStoreSize,
  };

  validateRateLimitOptions(options);

  return (req: Request, res: Response, next: NextFunction): void => {
    const identifier = resolveIdentifier(req.ip || req.socket.remoteAddress);
    const now = Date.now();
    runStoreMaintenance(now, {
      windowMs: options.windowMs,
      cleanupIntervalMs: options.cleanupIntervalMs,
      maxStoreSize: options.maxStoreSize,
    });

    const currentRecord = getOrCreateRecord(identifier, now);
    const updatedRecord: Readonly<RateLimitRecord> = getUpdatedRecordForRequest(
      currentRecord,
      now,
      options.windowMs,
    );

    setRateLimitRecord(identifier, updatedRecord);
    const method = req.method;
    const path = req.path;
    const resetTimestamp = updatedRecord.windowStart + options.windowMs;
    const remainingRequests = Math.max(
      0,
      options.maxRequests - updatedRecord.count,
    );

    res.setHeader("X-RateLimit-Limit", String(options.maxRequests));
    res.setHeader("X-RateLimit-Remaining", String(remainingRequests));
    res.setHeader("X-RateLimit-Reset", String(resetTimestamp));

    // Future enhancement: support trusted proxy headers via `trust proxy`.
    info(
      `IP: ${identifier} | METHOD: ${method} | PATH: ${path} | WINDOW_MS: ${options.windowMs} | MAX_REQUESTS: ${options.maxRequests} | WINDOW_START: ${updatedRecord.windowStart} | CURRENT_COUNT: ${updatedRecord.count}`,
    );

    if (shouldBlockRequest(updatedRecord.count, options.maxRequests)) {
      res.status(429).json({ error: "Too many requests" });
      return;
    }

    next();
  };
}

export const rateLimiterMiddleware: RequestHandler = rateLimiter();
