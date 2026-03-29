import {
  getRateLimitRecord,
  type RateLimitRecord,
} from "../store/rateLimitStore.js";

const UNKNOWN_IDENTIFIER = "unknown";

export const normalizeIpAddress = (ipAddress: string): string => {
  if (ipAddress.startsWith("::ffff:")) {
    return ipAddress.slice("::ffff:".length);
  }

  return ipAddress;
};

export const resolveIdentifier = (
  ipAddress: string | undefined | null,
): string => {
  if (!ipAddress) {
    return UNKNOWN_IDENTIFIER;
  }

  const normalizedIp = normalizeIpAddress(ipAddress.trim());
  if (normalizedIp.length === 0) {
    return UNKNOWN_IDENTIFIER;
  }

  return normalizedIp;
};

export const getOrCreateRecord = (
  identifier: string,
  now: number,
): Readonly<RateLimitRecord> => {
  const existingRecord = getRateLimitRecord(identifier);
  if (existingRecord) {
    return existingRecord;
  }

  return Object.freeze({
    count: 0,
    windowStart: now,
  });
};

export const isWindowExpired = (
  record: Readonly<RateLimitRecord>,
  now: number,
  windowMs: number,
): boolean => {
  return now - record.windowStart >= windowMs;
};

export const resetRecord = (now: number): Readonly<RateLimitRecord> => {
  return Object.freeze({
    count: 1,
    windowStart: now,
  });
};

export const getUpdatedRecordForRequest = (
  currentRecord: Readonly<RateLimitRecord>,
  now: number,
  windowMs: number,
): Readonly<RateLimitRecord> => {
  if (isWindowExpired(currentRecord, now, windowMs)) {
    return resetRecord(now);
  }

  return Object.freeze({
    count: currentRecord.count + 1,
    windowStart: currentRecord.windowStart,
  });
};

export const shouldBlockRequest = (
  count: number,
  maxRequests: number,
): boolean => {
  return count > maxRequests;
};
