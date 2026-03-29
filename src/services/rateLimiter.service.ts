import type { Request } from "express";

import { evaluateRedisTokenBucket } from "./tokenBucketRedis.service.js";
import type { RateLimitResult, RateLimiterConfig } from "../types/rateLimiter.types.js";
import { getClientIp } from "../utils/ip.js";

const NEAR_LIMIT_THRESHOLD_RATIO = 0.1;
const DEFAULT_KEY_PREFIX = "rate_limit";

const validateConfig = (config: Readonly<RateLimiterConfig>): void => {
  if (config.tokenBucket.capacity <= 0) {
    throw new Error("rateLimiter config error: tokenBucket.capacity must be greater than 0");
  }

  if (config.tokenBucket.refillRate <= 0) {
    throw new Error("rateLimiter config error: tokenBucket.refillRate must be greater than 0");
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

export const evaluateRateLimit = async (
  req: Request,
  config: Readonly<RateLimiterConfig>,
): Promise<RateLimitResult> => {
  validateConfig(config);

  const identifier = resolveIdentifier(req, config.keyGenerator);
  const prefix =
    config.tokenBucket.redisKeyPrefix.trim() || DEFAULT_KEY_PREFIX;
  const redisIdentifier = `${identifier}:${req.path}`;
  const key = buildRateLimitKey(identifier, req.path, prefix);
  const tokenBucketResult = await evaluateRedisTokenBucket(redisIdentifier, {
    capacity: config.tokenBucket.capacity,
    refillRate: config.tokenBucket.refillRate,
    keyPrefix: prefix,
    ttlSeconds: config.tokenBucket.ttlSeconds,
    onRedisError:
      config.onRedisError === "fail-closed" ? "fail-closed" : "fail-open",
  });

  const remainingWholeTokens = Math.max(
    0,
    Math.floor(tokenBucketResult.remainingTokens),
  );

  return {
    key,
    count: Math.max(0, tokenBucketResult.totalCapacity - remainingWholeTokens),
    limit: tokenBucketResult.totalCapacity,
    remaining: remainingWholeTokens,
    resetTime: tokenBucketResult.resetTime,
    degraded: tokenBucketResult.degraded,
    allowed: tokenBucketResult.allowed,
    nearLimit: isNearLimit(
      tokenBucketResult.remainingTokens,
      tokenBucketResult.totalCapacity,
    ),
    error: tokenBucketResult.error,
  };
};
