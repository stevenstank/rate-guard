import type { RateLimiterConfig } from "../types/rateLimiter.types.js";

const DEFAULT_RATE_LIMIT_PREFIX = "rate_limit";
const DEFAULT_REDIS_HOST = "127.0.0.1";
const DEFAULT_REDIS_PORT = 6379;

export interface ValidatedRateLimiterConfig extends RateLimiterConfig {
  enableLogging: boolean;
  enableFallback: boolean;
  prefix: string;
  onRedisError: "fail-open" | "fail-closed";
}

export interface RedisRuntimeConfig {
  host: string;
  port: number;
  password?: string;
}

const ensurePositiveNumber = (name: string, value: number): void => {
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`[config] "${name}" must be a positive number. Received: ${value}`);
  }
};

const parseRedisPort = (value: string | undefined): number => {
  if (!value) {
    return DEFAULT_REDIS_PORT;
  }

  const parsedPort = Number(value);
  if (!Number.isInteger(parsedPort) || parsedPort <= 0 || parsedPort > 65_535) {
    throw new Error(
      `[config] "REDIS_PORT" must be an integer between 1 and 65535. Received: ${value}`,
    );
  }

  return parsedPort;
};

export const validateRateLimiterConfig = (
  configName: string,
  input: Readonly<RateLimiterConfig>,
): Readonly<ValidatedRateLimiterConfig> => {
  ensurePositiveNumber(`${configName}.windowSizeInSeconds`, input.windowSizeInSeconds);
  ensurePositiveNumber(`${configName}.maxRequests`, input.maxRequests);

  const windowMs = input.windowSizeInSeconds * 1_000;
  ensurePositiveNumber(`${configName}.windowMs`, windowMs);

  const resolvedConfig: ValidatedRateLimiterConfig = {
    ...input,
    enableLogging: input.enableLogging ?? true,
    enableFallback: input.enableFallback ?? true,
    prefix: input.prefix?.trim() || DEFAULT_RATE_LIMIT_PREFIX,
    onRedisError: input.onRedisError ?? "fail-open",
  };

  return Object.freeze(resolvedConfig);
};

export const getValidatedRedisConfig = (): Readonly<RedisRuntimeConfig> => {
  const redisRequired = process.env.REDIS_REQUIRED === "true";
  if (redisRequired) {
    const missingHost = !process.env.REDIS_HOST || process.env.REDIS_HOST.trim().length === 0;
    const missingPort = !process.env.REDIS_PORT || process.env.REDIS_PORT.trim().length === 0;
    if (missingHost || missingPort) {
      throw new Error(
        '[config] Redis is required (REDIS_REQUIRED=true), but REDIS_HOST/REDIS_PORT are missing.',
      );
    }
  }

  const host = process.env.REDIS_HOST?.trim() || DEFAULT_REDIS_HOST;
  if (host.length === 0) {
    throw new Error('[config] "REDIS_HOST" cannot be empty.');
  }

  const port = parseRedisPort(process.env.REDIS_PORT);
  const password = process.env.REDIS_PASSWORD;

  const config: RedisRuntimeConfig = {
    host,
    port,
    ...(password ? { password } : {}),
  };

  return Object.freeze(config);
};
