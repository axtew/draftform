/** A promise settled from the test, to hold a request in flight. */
export interface Deferred {
  promise: Promise<void>;
  resolve: () => void;
  reject: (error: unknown) => void;
}

export function deferred(): Deferred {
  const settle: { resolve?: () => void; reject?: (error: unknown) => void } = {};
  const promise = new Promise<void>((resolve, reject) => {
    settle.resolve = resolve;
    settle.reject = reject;
  });

  return {
    promise,
    resolve: () => settle.resolve?.(),
    reject: (error) => settle.reject?.(error),
  };
}
