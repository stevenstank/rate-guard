import type {
  RateLimitStore,
  RateLimitStoreRecord,
} from "../types/rateLimitStore.js";

type MemoryStoreRecord = RateLimitStoreRecord;
type MemoryStoreMap = Map<string, MemoryStoreRecord>;

export class MemoryStore implements RateLimitStore {
  private readonly store: MemoryStoreMap = new Map<string, MemoryStoreRecord>();

  public increment(key: string, windowMs: number): RateLimitStoreRecord {
    const now = Date.now();
    const current = this.store.get(key);

    if (!current) {
      const nextRecord: MemoryStoreRecord = {
        count: 1,
        resetTime: now + windowMs,
      };
      this.store.set(key, nextRecord);
      return { count: nextRecord.count, resetTime: nextRecord.resetTime };
    }

    if (now > current.resetTime) {
      const resetRecord: MemoryStoreRecord = {
        count: 1,
        resetTime: now + windowMs,
      };
      this.store.set(key, resetRecord);
      return { count: resetRecord.count, resetTime: resetRecord.resetTime };
    }

    const updatedRecord: MemoryStoreRecord = {
      count: current.count + 1,
      resetTime: current.resetTime,
    };
    this.store.set(key, updatedRecord);
    return { count: updatedRecord.count, resetTime: updatedRecord.resetTime };
  }

  public get(key: string): RateLimitStoreRecord | null {
    const record = this.store.get(key);
    if (!record) {
      return null;
    }

    return { count: record.count, resetTime: record.resetTime };
  }

  public reset(key: string): void {
    this.store.delete(key);
  }
}
