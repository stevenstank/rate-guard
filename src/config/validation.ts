import type {
  RateLimiterConfig,
  RateLimiterConfigOverrides,
  TokenBucketRuntimeConfig,
} from "../types/rateLimiter.types.js";

const DEFAULT_REDIS_HOST = "127.0.0.1";
const DEFAULT_REDIS_PORT = 6379;

const DEFAULT_TOKEN_BUCKET_CAPACITY = 10;
const DEFAULT_TOKEN_BUCKET_REFILL_RATE = 10 / 60;
const DEFAULT_TOKEN_BUCKET_REDIS_PREFIX = "rateguard:token_bucket";
const DEFAULT_RATE_LIMIT_ERROR_MESSAGE = "Too many requests";

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

const resolveTokenBucketConfig = (
  name: string,
  input: Readonly<Partial<TokenBucketRuntimeConfig>>,
  base: Readonly<TokenBucketRuntimeConfig>,
): TokenBucketRuntimeConfig => {
  const capacity = input.capacity ?? base.capacity;
  const refillRate = input.refillRate ?? base.refillRate;
  const redisKeyPrefix = (input.redisKeyPrefix ?? base.redisKeyPrefix).trim();
  const ttlSeconds = input.ttlSeconds ?? base.ttlSeconds;

  ensurePositiveNumber(`${name}.tokenBucket.capacity`, capacity);
  ensurePositiveNumber(`${name}.tokenBucket.refillRate`, refillRate);

  if (redisKeyPrefix.length === 0) {
    throw new Error(`[config] "${name}.tokenBucket.redisKeyPrefix" cannot be empty.`);
  }

  if (ttlSeconds !== undefined) {
    ensurePositiveNumber(`${name}.tokenBucket.ttlSeconds`, ttlSeconds);
  }

  return Object.freeze({
    capacity,
    refillRate,
    redisKeyPrefix,
    ...(ttlSeconds ? { ttlSeconds } : {}),
  });
};

const ensureValidKeyGenerator = (
  name: string,
  keyGenerator: RateLimiterConfig["keyGenerator"],
): void => {
  if (keyGenerator !== undefined && typeof keyGenerator !== "function") {
    throw new Error(`[config] "${name}.keyGenerator" must be a function when provided.`);
  }
};

export interface RedisRuntimeConfig {
  host: string;
  port: number;
  password?: string;
}

export const DEFAULT_RATE_LIMITER_CONFIG: Readonly<RateLimiterConfig> = Object.freeze({
  tokenBucket: Object.freeze({
    capacity: DEFAULT_TOKEN_BUCKET_CAPACITY,
    refillRate: DEFAULT_TOKEN_BUCKET_REFILL_RATE,
    redisKeyPrefix: DEFAULT_TOKEN_BUCKET_REDIS_PREFIX,
  }),
  errorMessage: DEFAULT_RATE_LIMIT_ERROR_MESSAGE,
  enableLogging: true,
  onRedisError: "fail-open",
});

export const resolveRateLimiterConfig = (
  configName: string,
  overrides: Readonly<RateLimiterConfigOverrides> = {},
  baseConfig: Readonly<RateLimiterConfig> = DEFAULT_RATE_LIMITER_CONFIG,
): Readonly<RateLimiterConfig> => {
  ensureValidKeyGenerator(configName, overrides.keyGenerator);

  const resolvedTokenBucket = resolveTokenBucketConfig(
    configName,
    overrides.tokenBucket ?? {},
    baseConfig.tokenBucket,
  );

  const errorMessage = (overrides.errorMessage ?? baseConfig.errorMessage ?? "").trim();
  if (errorMessage.length === 0) {
    throw new Error(`[config] "${configName}.errorMessage" cannot be empty.`);
  }

  const resolved: RateLimiterConfig = {
    tokenBucket: resolvedTokenBucket,
    errorMessage,
    enableLogging: overrides.enableLogging ?? baseConfig.enableLogging ?? true,
    onRedisError: overrides.onRedisError ?? baseConfig.onRedisError ?? "fail-open",
    keyGenerator: overrides.keyGenerator ?? baseConfig.keyGenerator,
  };

  return Object.freeze(resolved);
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
