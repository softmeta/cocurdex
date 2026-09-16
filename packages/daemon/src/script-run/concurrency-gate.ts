export interface ConcurrencyGate {
  run<T>(task: () => Promise<T>): Promise<T>;
}

export function createConcurrencyGate(limit: number): ConcurrencyGate {
  let active = 0;
  const waiting: (() => void)[] = [];

  const acquire = async () => {
    if (active < limit) {
      active += 1;
      return;
    }
    await new Promise<void>((resolve) => waiting.push(resolve));
  };

  const release = () => {
    const next = waiting.shift();
    if (next) {
      next();
      return;
    }
    active -= 1;
  };

  return {
    async run(task) {
      await acquire();
      try {
        return await task();
      } finally {
        release();
      }
    },
  };
}
