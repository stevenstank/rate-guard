export interface TokenBucketState {
  tokens: number;
  lastRefillTimestampMs: number;
}

export interface TokenBucketConfig {
  capacity: number;
  refillRate: number;
}

export interface TokenBucketConsumeResult {
  allowed: boolean;
  remainingTokens: number;
}
