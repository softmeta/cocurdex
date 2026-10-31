export interface FixedWindowRateLimiter {
  take(key: string, now: number): boolean;
}

export function createFixedWindowRateLimiter(options: {
  limit: number;
  windowMs: number;
}): FixedWindowRateLimiter {
  const windows = new Map<string, { startedAt: number; count: number }>();
  return {
    take(key, now) {
      for (const [candidate, window] of windows) {
        if (now - window.startedAt >= options.windowMs) {
          windows.delete(candidate);
        }
      }
      const window = windows.get(key) ?? { startedAt: now, count: 0 };
      if (window.count >= options.limit) {
        windows.set(key, window);
        return false;
      }
      windows.set(key, { ...window, count: window.count + 1 });
      return true;
    },
  };
}
