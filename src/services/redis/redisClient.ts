import Redis, { type RedisOptions } from "ioredis";

import { error, info, warn } from "../../utils/logger.js";

const DEFAULT_REDIS_HOST = "127.0.0.1";
const DEFAULT_REDIS_PORT = 6379;

const parseRedisPort = (value: string | undefined): number => {
  if (!value) {
    return DEFAULT_REDIS_PORT;
  }

  const parsedPort = Number(value);
  const isValidPort =
    Number.isInteger(parsedPort) && parsedPort > 0 && parsedPort <= 65_535;

  return isValidPort ? parsedPort : DEFAULT_REDIS_PORT;
};

const redisHost: string = process.env.REDIS_HOST ?? DEFAULT_REDIS_HOST;
const redisPort: number = parseRedisPort(process.env.REDIS_PORT);
const redisPassword: string | undefined = process.env.REDIS_PASSWORD;

const redisOptions: RedisOptions = {
  host: redisHost,
  port: redisPort,
  ...(redisPassword ? { password: redisPassword } : {}),
};

export const redisClient: Redis = new Redis(redisOptions);

redisClient.on("connect", (): void => {
  info(`Redis connected at ${redisHost}:${redisPort}`);
});

redisClient.on("error", (redisError: Error): void => {
  error(`Redis error: ${redisError.message}`);
});

redisClient.on("reconnecting", (): void => {
  warn("Redis reconnecting...");
});
