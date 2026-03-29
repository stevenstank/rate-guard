import Redis, { type RedisOptions } from "ioredis";

import { getValidatedRedisConfig } from "../config/validation.js";
import { error, info, warn } from "../utils/logger.js";
import type { RateLimitBackendState } from "../types/rateLimiter.types.js";

const REDIS_COMMAND_TIMEOUT_MS = 2000;
const MILLISECONDS_PER_SECOND = 1000;

type RedisCommand<T> = () => Promise<T>;
type RedisScriptArgument = string | number;

const parseRedisNumber = (value: string, key: string): number => {
  const parsedValue = Number(value);
  if (!Number.isFinite(parsedValue)) {
    throw new Error(`Invalid numeric value in Redis for key: ${key}`);
  }

  return parsedValue;
};

const validateTtlSeconds = (ttlSeconds: number): void => {
  if (!Number.isInteger(ttlSeconds) || ttlSeconds <= 0) {
    throw new Error("ttlSeconds must be a positive integer");
  }
};

const withTimeout = async <T>(
  command: Promise<T>,
  timeoutMs: number,
): Promise<T> => {
  let timeoutHandle: NodeJS.Timeout | undefined;

  const timeoutPromise = new Promise<never>((_, reject): void => {
    timeoutHandle = setTimeout((): void => {
      reject(new Error(`Redis command timed out after ${timeoutMs}ms`));
    }, timeoutMs);
  });

  try {
    return await Promise.race([command, timeoutPromise]);
  } finally {
    if (timeoutHandle) {
      clearTimeout(timeoutHandle);
    }
  }
};

const redisRuntimeConfig = getValidatedRedisConfig();

const redisOptions: RedisOptions = {
  host: redisRuntimeConfig.host,
  port: redisRuntimeConfig.port,
  ...(redisRuntimeConfig.password
    ? { password: redisRuntimeConfig.password }
    : {}),
};

const redisClient: Redis = new Redis(redisOptions);

redisClient.on("connect", (): void => {
  info({
    event: "redis_connected",
    host: redisRuntimeConfig.host,
    port: redisRuntimeConfig.port,
  });
});

redisClient.on("error", (redisError: Error): void => {
  error({ event: "redis_error", message: redisError.message });
});

redisClient.on("reconnecting", (): void => {
  warn({ event: "redis_reconnecting" });
});

export class RedisService {
  private isClientReady(): boolean {
    const status = redisClient.status;
    return status === "ready" || status === "connect";
  }

  private async execute<T>(
    operation: string,
    key: string,
    command: RedisCommand<T>,
  ): Promise<T> {
    if (!this.isClientReady()) {
      throw new Error(`Redis not ready (status: ${redisClient.status})`);
    }

    try {
      return await withTimeout(command(), REDIS_COMMAND_TIMEOUT_MS);
    } catch (redisError: unknown) {
      const message =
        redisError instanceof Error ? redisError.message : "Unknown Redis error";
      error({
        event: "redis_command_failed",
        operation,
        key,
        message,
      });
      throw new Error(`Redis operation failed (${operation}) for key: ${key}`);
    }
  }

  public async increment(key: string): Promise<number> {
    return this.execute("increment", key, (): Promise<number> => redisClient.incr(key));
  }

  public async setExpiry(key: string, ttlSeconds: number): Promise<void> {
    validateTtlSeconds(ttlSeconds);
    await this.execute("set_expiry", key, async (): Promise<void> => {
      await redisClient.expire(key, ttlSeconds);
    });
  }

  public async get(key: string): Promise<number | null> {
    return this.execute("get", key, async (): Promise<number | null> => {
      const value = await redisClient.get(key);
      if (value === null) {
        return null;
      }

      return parseRedisNumber(value, key);
    });
  }

  public async getTtl(key: string): Promise<number | null> {
    return this.execute("get_ttl", key, async (): Promise<number | null> => {
      const ttlSeconds = await redisClient.ttl(key);
      if (ttlSeconds < 0) {
        return null;
      }

      return ttlSeconds;
    });
  }

  public async delete(key: string): Promise<void> {
    await this.execute("delete", key, async (): Promise<void> => {
      await redisClient.del(key);
    });
  }

  public async scriptLoad(script: string): Promise<string> {
    return this.execute("script_load", "global", async (): Promise<string> => {
      const result = await redisClient.script("LOAD", script);
      if (typeof result !== "string") {
        throw new Error("SCRIPT LOAD returned a non-string SHA value.");
      }

      return result;
    });
  }

  public async evalSha(
    sha: string,
    keys: readonly string[],
    args: readonly RedisScriptArgument[],
  ): Promise<unknown[]> {
    return this.execute("evalsha", keys[0] ?? "global", async (): Promise<unknown[]> => {
      const result = await redisClient.evalsha(sha, keys.length, ...keys, ...args);
      if (!Array.isArray(result)) {
        throw new Error("EVALSHA returned a non-array result.");
      }

      return result;
    });
  }

  public async eval(
    script: string,
    keys: readonly string[],
    args: readonly RedisScriptArgument[],
  ): Promise<unknown[]> {
    return this.execute("eval", keys[0] ?? "global", async (): Promise<unknown[]> => {
      const result = await redisClient.eval(script, keys.length, ...keys, ...args);
      if (!Array.isArray(result)) {
        throw new Error("EVAL returned a non-array result.");
      }

      return result;
    });
  }

  public async getHash(
    key: string,
    fields: readonly string[],
  ): Promise<Record<string, string> | null> {
    return this.execute("get_hash", key, async (): Promise<Record<string, string> | null> => {
      if (fields.length === 0) {
        return {};
      }

      const values = await redisClient.hmget(key, ...fields);
      const result: Record<string, string> = {};

      fields.forEach((field, index): void => {
        const value = values[index];
        if (value !== null) {
          result[field] = value;
        }
      });

      return Object.keys(result).length > 0 ? result : null;
    });
  }

  public async setHash(
    key: string,
    values: Readonly<Record<string, string>>,
  ): Promise<void> {
    await this.execute("set_hash", key, async (): Promise<void> => {
      const flattenedEntries = Object.entries(values).flatMap(
        ([field, value]): string[] => [field, value],
      );
      if (flattenedEntries.length === 0) {
        return;
      }

      await redisClient.hset(key, ...flattenedEntries);
    });
  }

  public async evaluateFixedWindow(
    key: string,
    windowSizeInSeconds: number,
    maxRequests: number,
  ): Promise<RateLimitBackendState> {
    const fallbackResetTime = Date.now() + windowSizeInSeconds * MILLISECONDS_PER_SECOND;

    try {
      const count = await this.increment(key);
      if (count === 1) {
        await this.setExpiry(key, windowSizeInSeconds);
      }

      let ttlSeconds = await this.getTtl(key);
      if (ttlSeconds === null) {
        await this.setExpiry(key, windowSizeInSeconds);
        ttlSeconds = windowSizeInSeconds;
      }

      return {
        ok: true,
        count,
        remaining: Math.max(0, maxRequests - count),
        resetTime: Date.now() + ttlSeconds * MILLISECONDS_PER_SECOND,
      };
    } catch (redisError: unknown) {
      const message =
        redisError instanceof Error ? redisError.message : "Unknown Redis error";
      warn({ event: "redis_rate_limit_degraded", key, message });
      return {
        ok: false,
        count: 0,
        remaining: maxRequests,
        resetTime: fallbackResetTime,
        error: message,
      };
    }
  }
}

export const redisService: RedisService = new RedisService();
