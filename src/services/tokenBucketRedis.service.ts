import { redisService } from "./redis.service.js";
import type { TokenBucketConfig } from "../types/tokenBucket.types.js";
import { warn } from "../utils/logger.js";

const REDIS_KEY_PREFIX = "rateguard:token_bucket";
const MILLISECONDS_PER_SECOND = 1000;

/**
 * We pass `nowMs` from Node.js to avoid an extra Redis TIME call.
 * This keeps per-request Redis work to one script execution and improves throughput.
 */
const TOKEN_BUCKET_LUA_SCRIPT = `
local key = KEYS[1]
local capacity = tonumber(ARGV[1])
local refillPerMs = tonumber(ARGV[2])
local nowMs = tonumber(ARGV[3])
local ttlSeconds = tonumber(ARGV[4])

local values = redis.call('HMGET', key, 'tokens', 'last_refill_ms')
local tokens = tonumber(values[1])
local lastRefillMs = tonumber(values[2])

if tokens == nil then
  tokens = capacity
end

if lastRefillMs == nil then
  lastRefillMs = nowMs
end

local elapsedMs = nowMs - lastRefillMs
if elapsedMs < 0 then
  elapsedMs = 0
end

tokens = math.min(capacity, tokens + (elapsedMs * refillPerMs))

local allowed = 0
if tokens >= 1 then
  allowed = 1
  tokens = tokens - 1
end

redis.call('HSET', key, 'tokens', tokens, 'last_refill_ms', nowMs)
if ttlSeconds > 0 then
  redis.call('EXPIRE', key, ttlSeconds)
end

local missingTokens = 1 - tokens
local resetMs = nowMs
if missingTokens > 0 then
  resetMs = nowMs + math.ceil(missingTokens / refillPerMs)
end

return {allowed, tostring(tokens), tostring(resetMs)}
`;

let cachedTokenBucketScriptSha: string | null = null;
let loadingScriptPromise: Promise<string> | null = null;

export interface TokenBucketRedisConfig extends TokenBucketConfig {
  keyPrefix?: string;
  ttlSeconds?: number;
  onRedisError?: "fail-open" | "fail-closed";
}

export interface TokenBucketRedisResult {
  allowed: boolean;
  remainingTokens: number;
  resetTime: number;
  totalCapacity: number;
  degraded: boolean;
  error?: string;
}

interface ParsedScriptResult {
  allowed: boolean;
  remainingTokens: number;
  resetTime: number;
}

const resolveTtlSeconds = (config: Readonly<TokenBucketRedisConfig>): number => {
  if (config.ttlSeconds && config.ttlSeconds > 0) {
    return config.ttlSeconds;
  }

  const secondsToRefillFull = Math.ceil(config.capacity / config.refillRate);
  return Math.max(1, secondsToRefillFull * 2);
};

const parseScriptResult = (rawResult: readonly unknown[]): ParsedScriptResult => {
  if (rawResult.length < 3) {
    throw new Error("Token bucket Lua script returned an invalid payload.");
  }

  const allowedRaw = Number(rawResult[0]);
  const remainingTokensRaw = Number(rawResult[1]);
  const resetTimeRaw = Number(rawResult[2]);

  if (
    !Number.isFinite(allowedRaw) ||
    !Number.isFinite(remainingTokensRaw) ||
    !Number.isFinite(resetTimeRaw)
  ) {
    throw new Error("Token bucket Lua script returned non-numeric values.");
  }

  return {
    allowed: allowedRaw === 1,
    remainingTokens: Math.max(0, remainingTokensRaw),
    resetTime: Math.max(0, resetTimeRaw),
  };
};

const ensureScriptLoaded = async (): Promise<string> => {
  if (cachedTokenBucketScriptSha) {
    return cachedTokenBucketScriptSha;
  }

  if (!loadingScriptPromise) {
    loadingScriptPromise = redisService
      .scriptLoad(TOKEN_BUCKET_LUA_SCRIPT)
      .then((sha): string => {
        cachedTokenBucketScriptSha = sha;
        return sha;
      })
      .finally((): void => {
        loadingScriptPromise = null;
      });
  }

  return loadingScriptPromise;
};

const executeTokenBucketScript = async (
  key: string,
  capacity: number,
  refillPerMs: number,
  nowMs: number,
  ttlSeconds: number,
): Promise<ParsedScriptResult> => {
  const scriptSha = await ensureScriptLoaded();
  const scriptArgs = [capacity, refillPerMs, nowMs, ttlSeconds];

  try {
    const result = await redisService.evalSha(scriptSha, [key], scriptArgs);
    return parseScriptResult(result);
  } catch {
    // Redis can lose scripts after restart; reload once and retry atomically.
    cachedTokenBucketScriptSha = null;
    const reloadedSha = await ensureScriptLoaded();
    const retryResult = await redisService.evalSha(reloadedSha, [key], scriptArgs);
    return parseScriptResult(retryResult);
  }
};

export const evaluateRedisTokenBucket = async (
  identifier: string,
  config: Readonly<TokenBucketRedisConfig>,
): Promise<TokenBucketRedisResult> => {
  const nowMs = Date.now();
  const keyPrefix = config.keyPrefix?.trim() || REDIS_KEY_PREFIX;
  const key = `${keyPrefix}:${identifier}`;
  const fallbackStrategy = config.onRedisError ?? "fail-open";
  const fallbackResetTime = nowMs + Math.ceil(MILLISECONDS_PER_SECOND / config.refillRate);
  const refillPerMs = config.refillRate / MILLISECONDS_PER_SECOND;
  const ttlSeconds = resolveTtlSeconds(config);

  try {
    const decision = await executeTokenBucketScript(
      key,
      config.capacity,
      refillPerMs,
      nowMs,
      ttlSeconds,
    );

    return {
      allowed: decision.allowed,
      remainingTokens: decision.remainingTokens,
      resetTime: decision.resetTime,
      totalCapacity: config.capacity,
      degraded: false,
    };
  } catch (redisError: unknown) {
    const message =
      redisError instanceof Error ? redisError.message : "Unknown Redis error";
    warn({
      event: "token_bucket_redis_error",
      key,
      strategy: fallbackStrategy,
      message,
    });

    if (fallbackStrategy === "fail-closed") {
      return {
        allowed: false,
        remainingTokens: 0,
        resetTime: fallbackResetTime,
        totalCapacity: config.capacity,
        degraded: true,
        error: message,
      };
    }

    return {
      allowed: true,
      remainingTokens: config.capacity,
      resetTime: fallbackResetTime,
      totalCapacity: config.capacity,
      degraded: true,
      error: message,
    };
  }
};
