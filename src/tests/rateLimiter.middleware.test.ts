import type { NextFunction, Request, Response } from "express";
import { jest } from "@jest/globals";

import type {
  RateLimitResult,
  RateLimiterConfig,
} from "../types/rateLimiter.types.js";

type EvaluateRateLimitFn = (
  req: Request,
  config: Readonly<RateLimiterConfig>,
) => Promise<RateLimitResult>;

const mockedEvaluateRateLimit: jest.MockedFunction<EvaluateRateLimitFn> = jest.fn();

jest.unstable_mockModule("../services/rateLimiter.service.js", () => {
  return { evaluateRateLimit: mockedEvaluateRateLimit };
});

const { createRateLimiter } = await import("../middleware/rateLimiter.middleware.js");

type MockResponse = Response & {
  setHeader: jest.Mock;
  status: jest.Mock;
  json: jest.Mock;
};

const createMockResponse = (): MockResponse => {
  const response = {
    setHeader: jest.fn(),
    status: jest.fn().mockReturnThis(),
    json: jest.fn(),
  };

  return response as unknown as MockResponse;
};

const baseConfig = {
  tokenBucket: {
    capacity: 5,
    refillRate: 1,
    redisKeyPrefix: "rateguard:token_bucket",
  },
  errorMessage: "Too many requests",
  onRedisError: "fail-open" as const,
  enableLogging: false,
};

describe("rateLimiter.middleware", () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date("2026-01-01T00:00:00.000Z"));
    mockedEvaluateRateLimit.mockReset();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("sets rate-limit headers and calls next when allowed", async () => {
    const middleware = createRateLimiter(baseConfig);

    mockedEvaluateRateLimit.mockResolvedValue({
      allowed: true,
      count: 1,
      limit: 5,
      remaining: 4,
      resetTime: 1_800_000_000_000,
      key: "rateguard:token_bucket:ip:/health",
      degraded: false,
      nearLimit: false,
    });

    const req = {
      path: "/health",
      method: "GET",
    } as Request;
    const res = createMockResponse();
    const next = jest.fn() as NextFunction;

    await middleware(req, res, next);

    expect(res.setHeader).toHaveBeenCalledWith("X-RateLimit-Limit", "5");
    expect(res.setHeader).toHaveBeenCalledWith("X-RateLimit-Remaining", "4");
    expect(res.setHeader).toHaveBeenCalledWith("X-RateLimit-Reset", "1800000000000");
    expect(next).toHaveBeenCalledTimes(1);
    expect(res.status).not.toHaveBeenCalled();
  });

  it("returns 429 with standardized body and headers when blocked", async () => {
    const middleware = createRateLimiter(baseConfig);

    mockedEvaluateRateLimit.mockResolvedValue({
      allowed: false,
      count: 6,
      limit: 5,
      remaining: 0,
      resetTime: Date.now() + 120_000,
      key: "rateguard:token_bucket:ip:/health",
      degraded: false,
      nearLimit: false,
    });

    const req = {
      path: "/health",
      method: "GET",
    } as Request;
    const res = createMockResponse();
    const next = jest.fn() as NextFunction;

    await middleware(req, res, next);

    expect(res.setHeader).toHaveBeenCalledWith("X-RateLimit-Limit", "5");
    expect(res.setHeader).toHaveBeenCalledWith("X-RateLimit-Remaining", "0");
    expect(res.status).toHaveBeenCalledWith(429);
    expect(res.json).toHaveBeenCalledWith({
      error: "Too many requests",
      retryAfter: 120,
    });
    expect(next).not.toHaveBeenCalled();
  });

  it("supports fail-closed behavior on degraded backend", async () => {
    const middleware = createRateLimiter({
      ...baseConfig,
      onRedisError: "fail-closed",
    });

    mockedEvaluateRateLimit.mockResolvedValue({
      allowed: true,
      count: 0,
      limit: 5,
      remaining: 5,
      resetTime: Date.now() + 5_000,
      key: "rateguard:token_bucket:ip:/health",
      degraded: true,
      nearLimit: false,
      error: "redis unavailable",
    });

    const req = {
      path: "/health",
      method: "GET",
    } as Request;
    const res = createMockResponse();
    const next = jest.fn() as NextFunction;

    await middleware(req, res, next);

    expect(res.status).toHaveBeenCalledWith(503);
    expect(next).not.toHaveBeenCalled();
  });
});
