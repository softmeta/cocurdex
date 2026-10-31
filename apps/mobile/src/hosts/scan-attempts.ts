import type { PairFailure } from "./hosts-store";

export type ScanFailure = PairFailure | "notPairingCode";

export interface ScanAttempt {
  data: string;
  failure: ScanFailure | null;
  at: number;
}

export const SCAN_RETRY_DELAY_MS = 3_000;

const RETRYABLE: ReadonlySet<ScanFailure> = new Set([
  "unreachable",
  "rateLimited",
]);

export function shouldPairScannedCode(
  previous: ScanAttempt | null,
  data: string,
  now: number,
) {
  if (!previous || previous.data !== data) return true;
  if (!previous.failure || !RETRYABLE.has(previous.failure)) return false;
  return now - previous.at >= SCAN_RETRY_DELAY_MS;
}

export function createScanGate() {
  let inFlight = false;
  let last: ScanAttempt | null = null;
  return {
    begin(data: string, now: number) {
      if (inFlight || !shouldPairScannedCode(last, data, now)) return false;
      inFlight = true;
      return true;
    },
    finish(data: string, failure: ScanFailure | null, now: number) {
      inFlight = false;
      last = { data, failure, at: now };
    },
  };
}
