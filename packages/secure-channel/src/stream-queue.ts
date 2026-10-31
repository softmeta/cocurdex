type Waiter = {
  resolve(result: IteratorResult<Uint8Array>): void;
  reject(error: Error): void;
};

export interface StreamQueue {
  push(chunk: Uint8Array): void;
  finish(): void;
  fail(error: Error): void;
  iterate(
    onConsumed: (bytes: number) => void,
  ): AsyncIterableIterator<Uint8Array>;
}

export function createStreamQueue(): StreamQueue {
  const chunks: Uint8Array[] = [];
  const waiters: Waiter[] = [];
  let finished = false;
  let failure: Error | null = null;

  const settleWaiters = () => {
    while (waiters.length > 0) {
      const waiter = waiters.shift() as Waiter;
      if (failure) waiter.reject(failure);
      else waiter.resolve({ value: undefined, done: true });
    }
  };

  return {
    push(chunk) {
      if (finished || failure) return;
      const waiter = waiters.shift();
      if (waiter) waiter.resolve({ value: chunk, done: false });
      else chunks.push(chunk);
    },
    finish() {
      if (finished || failure) return;
      finished = true;
      if (chunks.length === 0) settleWaiters();
    },
    fail(error) {
      if (failure) return;
      failure = error;
      chunks.length = 0;
      settleWaiters();
    },
    iterate(onConsumed) {
      const iterator: AsyncIterableIterator<Uint8Array> = {
        next() {
          const chunk = chunks.shift();
          if (chunk) {
            onConsumed(chunk.length);
            return Promise.resolve({ value: chunk, done: false });
          }
          if (failure) return Promise.reject(failure);
          if (finished)
            return Promise.resolve({ value: undefined, done: true });
          return new Promise<IteratorResult<Uint8Array>>((resolve, reject) => {
            waiters.push({
              resolve(result) {
                if (!result.done) onConsumed(result.value.length);
                resolve(result);
              },
              reject,
            });
          });
        },
        [Symbol.asyncIterator]() {
          return iterator;
        },
      };
      return iterator;
    },
  };
}
