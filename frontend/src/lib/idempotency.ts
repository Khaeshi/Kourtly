type IdempotentRequest<T> = (idempotencyKey: string) => Promise<T>;

export interface IdempotentAction<T> {
  run(): Promise<T>;
  retry(): Promise<T>;
  canRetry(): boolean;
}

function isNetworkFailure(error: unknown): boolean {
  const visited = new Set<object>();
  let current = error;
  while (typeof current === 'object' && current !== null && !visited.has(current)) {
    visited.add(current);
    if ('kind' in current && current.kind === 'network') return true;
    current = 'cause' in current ? current.cause : null;
  }
  return false;
}

export function createIdempotentAction<T>(
  request: IdempotentRequest<T>,
  createKey: () => string = () => crypto.randomUUID(),
): IdempotentAction<T> {
  let idempotencyKey: string | null = null;
  let hasRun = false;
  let canRetry = false;
  let pending: Promise<T> | null = null;

  const execute = (isRetry: boolean): Promise<T> => {
    if (pending) return pending;

    if (isRetry) {
      if (!idempotencyKey || !canRetry) {
        return Promise.reject(new Error('This action has no network retry available.'));
      }
      canRetry = false;
    } else {
      if (hasRun) {
        return Promise.reject(new Error('Create a new action for a new user request.'));
      }
      hasRun = true;
      idempotencyKey = createKey();
    }

    const requestKey = idempotencyKey;
    pending = Promise.resolve().then(() => request(requestKey));

    return pending.then(
      (result) => {
        idempotencyKey = null;
        canRetry = false;
        return result;
      },
      (error: unknown) => {
        canRetry = isNetworkFailure(error);
        if (!canRetry) idempotencyKey = null;
        throw error;
      },
    ).finally(() => {
      pending = null;
    });
  };

  return {
    run: () => execute(false),
    retry: () => execute(true),
    canRetry: () => canRetry && idempotencyKey !== null,
  };
}
