import { error } from "../../utils/logger.js";
import { redisClient } from "./redisClient.js";

const parseRedisNumber = (value: string, key: string): number => {
  const parsedValue: number = Number(value);
  if (!Number.isFinite(parsedValue)) {
    throw new Error(`Invalid numeric value in Redis for key: ${key}`);
  }

  return parsedValue;
};

const validateTtlSeconds = (ttlSeconds: number): void => {
  const isValidTtl =
    Number.isInteger(ttlSeconds) && ttlSeconds > 0;

  if (!isValidTtl) {
    throw new Error("ttlSeconds must be a positive integer");
  }
};

export class RedisService {
  public async increment(key: string): Promise<number> {
    try {
      console.log("Redis INCR:", key);
      const nextValue: number = await redisClient.incr(key);
      return nextValue;
    } catch (redisError: unknown) {
      const message =
        redisError instanceof Error ? redisError.message : "Unknown Redis error";
      error(`RedisService.increment failed for key "${key}": ${message}`);
      throw new Error(`Failed to increment key: ${key}`);
    }
  }

  public async setExpiry(key: string, ttlSeconds: number): Promise<void> {
    validateTtlSeconds(ttlSeconds);

    try {
      await redisClient.expire(key, ttlSeconds);
    } catch (redisError: unknown) {
      const message =
        redisError instanceof Error ? redisError.message : "Unknown Redis error";
      error(`RedisService.setExpiry failed for key "${key}": ${message}`);
      throw new Error(`Failed to set expiry for key: ${key}`);
    }
  }

  public async get(key: string): Promise<number | null> {
    try {
      const value: string | null = await redisClient.get(key);
      if (value === null) {
        return null;
      }

      return parseRedisNumber(value, key);
    } catch (redisError: unknown) {
      const message =
        redisError instanceof Error ? redisError.message : "Unknown Redis error";
      error(`RedisService.get failed for key "${key}": ${message}`);
      throw new Error(`Failed to get key: ${key}`);
    }
  }

  public async getTtl(key: string): Promise<number | null> {
    try {
      const ttlSeconds: number = await redisClient.ttl(key);
      if (ttlSeconds < 0) {
        return null;
      }

      return ttlSeconds;
    } catch (redisError: unknown) {
      const message =
        redisError instanceof Error ? redisError.message : "Unknown Redis error";
      error(`RedisService.getTtl failed for key "${key}": ${message}`);
      throw new Error(`Failed to read TTL for key: ${key}`);
    }
  }

  public async delete(key: string): Promise<void> {
    try {
      await redisClient.del(key);
    } catch (redisError: unknown) {
      const message =
        redisError instanceof Error ? redisError.message : "Unknown Redis error";
      error(`RedisService.delete failed for key "${key}": ${message}`);
      throw new Error(`Failed to delete key: ${key}`);
    }
  }
}

export const redisService: RedisService = new RedisService();
