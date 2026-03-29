export interface RateLimitCheckInput {
  identifier: string;
}

export interface RateLimitCheckResult {
  allowed: boolean;
  remaining: number;
  resetAt: Date;
}

export const evaluateRateLimit = (
  _input: RateLimitCheckInput,
): RateLimitCheckResult => {
  return {
    allowed: true,
    remaining: 100,
    resetAt: new Date(Date.now() + 60_000),
  };
};
