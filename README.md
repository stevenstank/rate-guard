# RateGuard

Type-safe rate-limiting middleware built with Node.js, Express, and TypeScript.
It uses a Redis-backed token bucket strategy for accurate request control and burst handling.

## Features

- TypeScript-first implementation (strict typing)
- Express middleware integration
- Token bucket rate limiting
- Redis-backed counters for scalability
- Configurable per-route limits
- Pluggable key generation for per-user/IP control
- Fail-open or fail-closed behavior on Redis errors

## Project Structure

```text
src/
  app.ts                 # Express app and route-level limiter usage
  server.ts              # Server entrypoint
  middleware/            # createRateLimiter middleware
  services/              # token bucket + Redis logic
  config/                # rate limit and app config
  utils/                 # logger and helpers
  tests/                 # unit/integration tests
```

## Installation

```bash
git clone https://github.com/stevenstank/rate-guard.git
cd rate-guard
npm install
```

## Run

```bash
npm run dev
```

Build and run production:

```bash
npm run build
npm start
```

Run tests:

```bash
npm test
```

## Example Usage

```ts
import express from "express";
import { createRateLimiter } from "./middleware/index.js";

const app = express();

app.use(
  "/api",
  createRateLimiter({
    tokenBucket: {
      capacity: 100,
      refillRate: 100 / 60,
      redisKeyPrefix: "rateguard:token_bucket",
    },
    errorMessage: "Too many requests",
    enableLogging: true,
    onRedisError: "fail-open",
  }),
);
```

## Redis Configuration

RateGuard reads Redis settings from environment variables:

- `REDIS_HOST` (default: `127.0.0.1`)
- `REDIS_PORT` (default: `6379`)
- `REDIS_PASSWORD` (optional)
- `REDIS_REQUIRED` (`true` to fail fast if host/port are missing)

Example:

```bash
REDIS_HOST=127.0.0.1
REDIS_PORT=6379
REDIS_REQUIRED=false
```

## Included Route Presets

In `src/app.ts`, the project applies separate configs for:

- `/login`
- `/api`
- `/health`

These are defined in `src/config/rateLimit.config.ts`.

## License

ISC
