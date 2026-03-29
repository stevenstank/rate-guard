import Redis, { type RedisOptions } from "ioredis";

import { getValidatedRedisConfig } from "../config/validation.js";
import { error, info, warn } from "../utils/logger.js";
import type { RateLimitBackendState } from "../types/rateLimiter.types.js";

const REDIS_COMMAND_TIMEOUT_MS = 2000;
const MILLISECONDS_PER_SECOND = 1000;

type RedisCommand<T> = () => Promise<T>;

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
