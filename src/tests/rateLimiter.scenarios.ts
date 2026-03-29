import { RL_TEST_RATE_LIMIT_CONFIG } from "../config/rateLimit.config.js";
import { MemoryStore } from "../store/memoryStore.js";
import type { RateLimitStoreRecord } from "../types/rateLimitStore.js";

interface ScenarioResult {
  readonly name: string;
  readonly count: number;
  readonly resetTime: number;
  readonly blocked: boolean;
}

const assertScenario = (condition: boolean, message: string): void => {
  if (!condition) {
    throw new Error(`Scenario assertion failed: ${message}`);
  }
};

const printScenario = (result: Readonly<ScenarioResult>): void => {
  console.info(
    `[SCENARIO] ${result.name} | count=${result.count} | resetTime=${result.resetTime} | blocked=${result.blocked}`,
  );
};

const withMockedTime = (timestamps: readonly number[], run: () => void): void => {
  const originalNow = Date.now;
  let index = 0;

  Date.now = (): number => {
    const safeIndex = Math.min(index, timestamps.length - 1);
    const value = timestamps[safeIndex];
    index += 1;
    return value;
  };

  try {
    run();
  } finally {
    Date.now = originalNow;
  }
};

  const runScenarios = (): void => {
  const windowMs =
    RL_TEST_RATE_LIMIT_CONFIG.windowSizeInSeconds * 1_000;
  const maxRequests = RL_TEST_RATE_LIMIT_CONFIG.maxRequests;
  const baseTime = 1_700_000_000_000;
  const store = new MemoryStore();
  const key = "127.0.0.1";

  // Scenario 1: Multiple requests within a single window.
  withMockedTime([baseTime, baseTime + 1_000, baseTime + 2_000], (): void => {
    store.increment(key, windowMs);
    store.increment(key, windowMs);
    const withinWindow: RateLimitStoreRecord = store.increment(key, windowMs);
    const scenario1: Readonly<ScenarioResult> = {
      name: "within-window",
      count: withinWindow.count,
      resetTime: withinWindow.resetTime,
      blocked: withinWindow.count > maxRequests,
    };
    printScenario(scenario1);
    assertScenario(withinWindow.count === 3, "count should be 3 in same window");
    assertScenario(!scenario1.blocked, "request at exact limit should be allowed");
  });

  // Scenario 2: Request after expiration should reset to count=1.
  withMockedTime([baseTime + windowMs + 1], (): void => {
    const afterReset: RateLimitStoreRecord = store.increment(key, windowMs);
    const scenario2: Readonly<ScenarioResult> = {
      name: "after-window-reset",
      count: afterReset.count,
      resetTime: afterReset.resetTime,
      blocked: afterReset.count > maxRequests,
    };
    printScenario(scenario2);
    assertScenario(afterReset.count === 1, "count should reset after expiration");
  });

  // Scenario 3: Exceeding limit returns blocked condition consistently.
  withMockedTime([baseTime + windowMs + 2, baseTime + windowMs + 3, baseTime + windowMs + 4, baseTime + windowMs + 5], (): void => {
    store.increment(key, windowMs);
    store.increment(key, windowMs);
    store.increment(key, windowMs);
    const exceeded: RateLimitStoreRecord = store.increment(key, windowMs);
    const scenario3: Readonly<ScenarioResult> = {
      name: "exceed-limit",
      count: exceeded.count,
      resetTime: exceeded.resetTime,
      blocked: exceeded.count > maxRequests,
    };
    printScenario(scenario3);
    assertScenario(exceeded.count === 5, "count should increment on burst requests");
    assertScenario(scenario3.blocked, "count above maxRequests should block");
  });

  console.info("Rate limiter deterministic scenarios passed.");
};

runScenarios();
