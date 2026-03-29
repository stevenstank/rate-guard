import {
  getUpdatedRecordForRequest,
  shouldBlockRequest,
} from "../utils/rateLimitHelpers.js";
import type { RateLimitRecord } from "../store/rateLimitStore.js";

interface ScenarioResult {
  readonly name: string;
  readonly count: number;
  readonly windowStart: number;
  readonly blocked: boolean;
}

const assertScenario = (condition: boolean, message: string): void => {
  if (!condition) {
    throw new Error(`Scenario assertion failed: ${message}`);
  }
};

const printScenario = (result: Readonly<ScenarioResult>): void => {
  console.info(
    `[SCENARIO] ${result.name} | count=${result.count} | windowStart=${result.windowStart} | blocked=${result.blocked}`,
  );
};

const WINDOW_MS = 60_000;
const MAX_REQUESTS = 3;

const runScenarios = (): void => {
  const baseTime = 1_700_000_000_000;

  // Scenario 1: Multiple requests within a single window.
  let record: Readonly<RateLimitRecord> = { count: 0, windowStart: baseTime };
  record = getUpdatedRecordForRequest(record, baseTime + 1_000, WINDOW_MS);
  record = getUpdatedRecordForRequest(record, baseTime + 2_000, WINDOW_MS);
  record = getUpdatedRecordForRequest(record, baseTime + 3_000, WINDOW_MS);
  const scenario1: Readonly<ScenarioResult> = {
    name: "within-window",
    count: record.count,
    windowStart: record.windowStart,
    blocked: shouldBlockRequest(record.count, MAX_REQUESTS),
  };
  printScenario(scenario1);
  assertScenario(scenario1.count === 3, "within-window count should be 3");
  assertScenario(
    scenario1.windowStart === baseTime,
    "window start should remain stable within window",
  );
  assertScenario(!scenario1.blocked, "request at exact limit should be allowed");

  // Scenario 2: Request exactly at expiration boundary should reset.
  record = getUpdatedRecordForRequest(record, baseTime + WINDOW_MS, WINDOW_MS);
  const scenario2: Readonly<ScenarioResult> = {
    name: "boundary-reset",
    count: record.count,
    windowStart: record.windowStart,
    blocked: shouldBlockRequest(record.count, MAX_REQUESTS),
  };
  printScenario(scenario2);
  assertScenario(scenario2.count === 1, "count should reset to 1 at boundary");
  assertScenario(
    scenario2.windowStart === baseTime + WINDOW_MS,
    "windowStart should reset at boundary",
  );

  // Scenario 3: Exceeding the limit should consistently block.
  record = getUpdatedRecordForRequest(record, baseTime + WINDOW_MS + 1, WINDOW_MS);
  record = getUpdatedRecordForRequest(record, baseTime + WINDOW_MS + 2, WINDOW_MS);
  record = getUpdatedRecordForRequest(record, baseTime + WINDOW_MS + 3, WINDOW_MS);
  const scenario3: Readonly<ScenarioResult> = {
    name: "exceed-limit",
    count: record.count,
    windowStart: record.windowStart,
    blocked: shouldBlockRequest(record.count, MAX_REQUESTS),
  };
  printScenario(scenario3);
  assertScenario(scenario3.count === 4, "count should be 4 after burst");
  assertScenario(scenario3.blocked, "count above limit must block with 429");

  console.info("Rate limiter deterministic scenarios passed.");
};

runScenarios();
