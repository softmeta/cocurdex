export interface BackoffPolicy {
  baseMs: number;
  maxMs: number;
  random(): number;
}

export const DEFAULT_BACKOFF: BackoffPolicy = {
  baseMs: 500,
  maxMs: 5 * 60_000,
  random: Math.random,
};

export function backoffDelay(failures: number, policy: BackoffPolicy) {
  const exponent = Math.max(0, failures - 1);
  const ceiling = Math.min(policy.baseMs * 2 ** exponent, policy.maxMs);
  const half = ceiling / 2;
  return Math.round(half + half * policy.random());
}
