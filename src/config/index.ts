export interface AppConfig {
  port: number;
  nodeEnv: string;
}

const DEFAULT_PORT = 3000;

const parsePort = (value: string | undefined): number => {
  if (!value) {
    return DEFAULT_PORT;
  }

  const parsedPort = Number(value);

  if (!Number.isInteger(parsedPort) || parsedPort <= 0) {
    return DEFAULT_PORT;
  }

  return parsedPort;
};

export const config: Readonly<AppConfig> = {
  port: parsePort(process.env.PORT),
  nodeEnv: process.env.NODE_ENV ?? "development",
};

export {
  API_RATE_LIMIT_CONFIG,
  DEFAULT_RATE_LIMIT_CONFIG,
  LOGIN_RATE_LIMIT_CONFIG,
  RL_TEST_RATE_LIMIT_CONFIG,
} from "./rateLimit.config.js";
