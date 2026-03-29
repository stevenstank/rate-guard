import { jest } from "@jest/globals";

type RedisScriptLoad = (script: string) => Promise<string>;
type RedisEvalSha = (
  sha: string,
  keys: readonly string[],
  args: readonly (string | number)[],
) => Promise<unknown[]>;

const redisServiceMock = {
  scriptLoad: jest.fn<RedisScriptLoad>(),
  evalSha: jest.fn<RedisEvalSha>(),
};

jest.unstable_mockModule("../services/redis.service.js", () => {
  return { redisService: redisServiceMock };
});

const { evaluateRedisTokenBucket } = await import(
  "../services/tokenBucketRedis.service.js"
);

interface BucketRecord {
  tokens: number;
  lastRefillMs: number;
}

describe("tokenBucketRedis.service - Redis integration (mocked)", () => {
  const bucketStore = new Map<string, BucketRecord>();

  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date("2026-01-01T00:00:00.000Z"));
    bucketStore.clear();

    redisServiceMock.scriptLoad.mockReset();
    redisServiceMock.evalSha.mockReset();
    redisServiceMock.scriptLoad.mockResolvedValue("sha-token-bucket");
    redisServiceMock.evalSha.mockImplementation(
      async (_sha: string, keys: readonly string[], args: readonly (string | number)[]) => {
        const key = keys[0] ?? "missing-key";
        const capacity = Number(args[0]);
        const refillPerMs = Number(args[1]);
        const nowMs = Number(args[2]);

        const current = bucketStore.get(key) ?? {
          tokens: capacity,
          lastRefillMs: nowMs,
        };

        const elapsedMs = Math.max(0, nowMs - current.lastRefillMs);
        const refilledTokens = Math.min(capacity, current.tokens + elapsedMs * refillPerMs);

        let allowed = 0;
        let tokensAfter = refilledTokens;
        if (tokensAfter >= 1) {
          allowed = 1;
          tokensAfter -= 1;
        }

        const updated: BucketRecord = {
          tokens: tokensAfter,
          lastRefillMs: nowMs,
        };
        bucketStore.set(key, updated);

        const missing = Math.max(0, 1 - tokensAfter);
        const resetTime = missing > 0 ? nowMs + Math.ceil(missing / refillPerMs) : nowMs;

        return [allowed, String(tokensAfter), String(resetTime)];
      },
    );
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("allows first request when key does not exist", async () => {
    const result = await evaluateRedisTokenBucket("client-1", {
      capacity: 5,
      refillRate: 1,
      keyPrefix: "rateguard:token_bucket",
    });

    expect(result.allowed).toBe(true);
    expect(result.remainingTokens).toBe(4);
    expect(result.degraded).toBe(false);
  });

  it("handles multiple rapid requests and blocks once exhausted", async () => {
    const config = {
      capacity: 3,
      refillRate: 0.1,
      keyPrefix: "rateguard:token_bucket",
    };

    const results = await Promise.all([
      evaluateRedisTokenBucket("rapid-client", config),
      evaluateRedisTokenBucket("rapid-client", config),
      evaluateRedisTokenBucket("rapid-client", config),
      evaluateRedisTokenBucket("rapid-client", config),
    ]);

    expect(results[0].allowed).toBe(true);
    expect(results[1].allowed).toBe(true);
    expect(results[2].allowed).toBe(true);
    expect(results[3].allowed).toBe(false);
  });

  it("refills tokens after time advances", async () => {
    const config = {
      capacity: 2,
      refillRate: 1,
      keyPrefix: "rateguard:token_bucket",
    };

    await evaluateRedisTokenBucket("refill-client", config);
    await evaluateRedisTokenBucket("refill-client", config);

    const blocked = await evaluateRedisTokenBucket("refill-client", config);
    expect(blocked.allowed).toBe(false);

    jest.setSystemTime(new Date("2026-01-01T00:00:02.000Z"));
    const afterRefill = await evaluateRedisTokenBucket("refill-client", config);
    expect(afterRefill.allowed).toBe(true);
  });

  it("supports deterministic parallel request simulation on same key", async () => {
    const config = {
      capacity: 5,
      refillRate: 0.01,
      keyPrefix: "rateguard:token_bucket",
    };

    const attempts = await Promise.all(
      Array.from({ length: 20 }, () => evaluateRedisTokenBucket("parallel", config)),
    );

    const allowedCount = attempts.filter((result) => result.allowed).length;
    const blockedCount = attempts.filter((result) => !result.allowed).length;

    expect(allowedCount).toBe(5);
    expect(blockedCount).toBe(15);
  });

  it("degrades with fail-closed when Redis execution fails", async () => {
    redisServiceMock.evalSha.mockRejectedValue(new Error("redis down"));

    const result = await evaluateRedisTokenBucket("degraded-client", {
      capacity: 2,
      refillRate: 1,
      onRedisError: "fail-closed",
    });

    expect(result.allowed).toBe(false);
    expect(result.degraded).toBe(true);
  });
});
