import type { Request } from "express";

import { memoryRateLimiterService } from "./memoryRateLimiter.service.js";
import { redisService } from "./redis.service.js";
import type {
  RateLimitBackendState,
  RateLimitResult,
  RateLimiterConfig,
} from "../types/rateLimiter.types.js";
import { getClientIp } from "../utils/ip.js";

const NEAR_LIMIT_THRESHOLD_RATIO = 0.1;
const DEFAULT_KEY_PREFIX = "rate_limit";

const validateConfig = (config: Readonly<RateLimiterConfig>): void => {
  if (config.windowSizeInSeconds <= 0) {
    throw new Error("rateLimiter config error: windowSizeInSeconds must be greater than 0");
  }

  if (config.maxRequests <= 0) {
    throw new Error("rateLimiter config error: maxRequests must be greater than 0");
  }
};

const resolveIdentifier = (
  req: Request,
  keyGenerator: RateLimiterConfig["keyGenerator"],
): string => {
  const generatedIdentifier = keyGenerator ? keyGenerator(req) : getClientIp(req);
  const normalizedIdentifier = generatedIdentifier.trim();
  if (normalizedIdentifier.length > 0) {
    return normalizedIdentifier;
  }

  return getClientIp(req);
};

const buildRateLimitKey = (
  identifier: string,
  endpoint: string,
  prefix: string,
): string => {
  return `${prefix}:${identifier}:${endpoint}`;
};

const isNearLimit = (remaining: number, limit: number): boolean => {
  return remaining > 0 && remaining / limit < NEAR_LIMIT_THRESHOLD_RATIO;
};

const toRateLimitResult = (
  key: string,
  limit: number,
  backendState: Readonly<RateLimitBackendState>,
): RateLimitResult => {
  return {
    key,
    count: backendState.count,
    limit,
    remaining: backendState.remaining,
    resetTime: backendState.resetTime,
    degraded: !backendState.ok,
    allowed: backendState.ok ? backendState.count <= limit : true,
    nearLimit: backendState.ok ? isNearLimit(backendState.remaining, limit) : false,
    error: backendState.error,
  };
};

export const evaluateRateLimit = async (
  req: Request,
  config: Readonly<RateLimiterConfig>,
): Promise<RateLimitResult> => {
  validateConfig(config);

  const identifier = resolveIdentifier(req, config.keyGenerator);
  const prefix = (config.prefix ?? DEFAULT_KEY_PREFIX).trim() || DEFAULT_KEY_PREFIX;
  const key = buildRateLimitKey(identifier, req.path, prefix);
  const redisResult = await redisService.evaluateFixedWindow(
    key,
    config.windowSizeInSeconds,
    config.maxRequests,
  );

  if (!redisResult.ok && (config.enableFallback ?? true)) {
    const memoryResult = memoryRateLimiterService.evaluateFixedWindow(
      key,
      config.windowSizeInSeconds,
      config.maxRequests,
    );
    return toRateLimitResult(key, config.maxRequests, memoryResult);
  }

  return toRateLimitResult(key, config.maxRequests, redisResult);
};
