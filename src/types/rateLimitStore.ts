export interface RateLimitStoreRecord {
  count: number;
  resetTime: number;
}

export interface RateLimitStore {
  increment(key: string, windowMs: number): RateLimitStoreRecord;
  get(key: string): RateLimitStoreRecord | null;
  reset(key: string): void;
}
