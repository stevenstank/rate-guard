import type { RateLimitBackendState } from "../types/rateLimiter.types.js";

const MILLISECONDS_PER_SECOND = 1000;
const CLEANUP_INTERVAL_MS = 60_000;
const MAX_MEMORY_RECORDS = 100_000;

interface MemoryRateLimitRecord {
  count: number;
  resetTime: number;
}

export class MemoryRateLimiterService {
  private readonly store = new Map<string, MemoryRateLimitRecord>();

  private lastCleanupAt = 0;

  private cleanupExpiredEntries(now: number): void {
    for (const [key, record] of this.store.entries()) {
      if (now >= record.resetTime) {
        this.store.delete(key);
      }
    }
  }

  private trimOverflowIfNeeded(): void {
    if (this.store.size <= MAX_MEMORY_RECORDS) {
      return;
    }

    const overflowCount = this.store.size - MAX_MEMORY_RECORDS;
    const oldestFirst = Array.from(this.store.entries()).sort(
      (entryA, entryB): number => entryA[1].resetTime - entryB[1].resetTime,
    );

    for (const [key] of oldestFirst.slice(0, overflowCount)) {
      this.store.delete(key);
    }
  }

  private runMaintenance(now: number): void {
    const shouldCleanup = now - this.lastCleanupAt >= CLEANUP_INTERVAL_MS;
    if (shouldCleanup || this.store.size > MAX_MEMORY_RECORDS) {
      this.cleanupExpiredEntries(now);
      this.trimOverflowIfNeeded();
      this.lastCleanupAt = now;
    }
  }

  public evaluateFixedWindow(
    key: string,
    windowSizeInSeconds: number,
    maxRequests: number,
  ): RateLimitBackendState {
    const now = Date.now();
    const windowSizeMs = windowSizeInSeconds * MILLISECONDS_PER_SECOND;
    this.runMaintenance(now);

    const currentRecord = this.store.get(key);
    let nextRecord: MemoryRateLimitRecord;

    if (!currentRecord || now >= currentRecord.resetTime) {
      nextRecord = {
        count: 1,
        resetTime: now + windowSizeMs,
      };
    } else {
      nextRecord = {
        count: currentRecord.count + 1,
        resetTime: currentRecord.resetTime,
      };
    }

    this.store.set(key, nextRecord);

    return {
      ok: true,
      count: nextRecord.count,
      remaining: Math.max(0, maxRequests - nextRecord.count),
      resetTime: nextRecord.resetTime,
    };
  }
}

export const memoryRateLimiterService = new MemoryRateLimiterService();
