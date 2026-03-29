export interface RateLimitRecord {
  readonly count: number;
  readonly windowStart: number;
}

export type RateLimitStore = Map<string, Readonly<RateLimitRecord>>;

export const rateLimitStore: RateLimitStore = new Map<
  string,
  Readonly<RateLimitRecord>
>();

export const getRateLimitRecord = (
  identifier: string,
): Readonly<RateLimitRecord> | undefined => {
  return rateLimitStore.get(identifier);
};

export const setRateLimitRecord = (
  identifier: string,
  record: Readonly<RateLimitRecord>,
): void => {
  // Store an immutable copy so external references cannot mutate in-place.
  const immutableRecord: Readonly<RateLimitRecord> = Object.freeze({
    count: record.count,
    windowStart: record.windowStart,
  });

  rateLimitStore.set(identifier, immutableRecord);
};

export interface StoreMaintenanceOptions {
  windowMs: number;
  cleanupIntervalMs: number;
  maxStoreSize: number;
}

let lastCleanupAtMs = 0;

export const cleanupExpiredRateLimitRecords = (
  now: number,
  windowMs: number,
): number => {
  const identifiersToDelete: string[] = [];

  for (const [identifier, record] of rateLimitStore.entries()) {
    const isExpired = now - record.windowStart >= windowMs;
    if (isExpired) {
      identifiersToDelete.push(identifier);
    }
  }

  for (const identifier of identifiersToDelete) {
    rateLimitStore.delete(identifier);
  }

  return identifiersToDelete.length;
};

export const enforceMaxStoreSize = (maxStoreSize: number): number => {
  if (rateLimitStore.size <= maxStoreSize) {
    return 0;
  }

  const overflowCount = rateLimitStore.size - maxStoreSize;
  const entriesByOldestWindow = Array.from(rateLimitStore.entries()).sort(
    (entryA, entryB) => entryA[1].windowStart - entryB[1].windowStart,
  );
  const identifiersToDelete = entriesByOldestWindow
    .slice(0, overflowCount)
    .map(([identifier]) => identifier);

  for (const identifier of identifiersToDelete) {
    rateLimitStore.delete(identifier);
  }

  return identifiersToDelete.length;
};

export const runStoreMaintenance = (
  now: number,
  options: Readonly<StoreMaintenanceOptions>,
): void => {
  const shouldRunCleanup = now - lastCleanupAtMs >= options.cleanupIntervalMs;
  if (shouldRunCleanup) {
    cleanupExpiredRateLimitRecords(now, options.windowMs);
    lastCleanupAtMs = now;
  }

  enforceMaxStoreSize(options.maxStoreSize);
};
