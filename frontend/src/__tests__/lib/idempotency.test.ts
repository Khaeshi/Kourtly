import { createIdempotentAction } from '@/lib/idempotency';

describe('createIdempotentAction', () => {
  test('reuses the key only when retrying a network failure', async () => {
    const request = jest.fn()
      .mockRejectedValueOnce(Object.assign(new Error('Network unavailable'), { kind: 'network' }))
      .mockResolvedValueOnce('completed');
    const action = createIdempotentAction(request, () => 'action-key');

    await expect(action.run()).rejects.toMatchObject({ kind: 'network' });
    await expect(action.retry()).resolves.toBe('completed');

    expect(request.mock.calls.map(([key]) => key)).toEqual(['action-key', 'action-key']);
  });

  test('creates a new key for each new action', async () => {
    const request = jest.fn().mockResolvedValue('charged');
    const createKey = jest.fn()
      .mockReturnValueOnce('first-click')
      .mockReturnValueOnce('second-click');

    await createIdempotentAction(request, createKey).run();
    await createIdempotentAction(request, createKey).run();

    expect(request.mock.calls.map(([key]) => key)).toEqual(['first-click', 'second-click']);
  });

  test('does not make HTTP failures retryable', async () => {
    const request = jest.fn().mockRejectedValue(Object.assign(new Error('Conflict'), { kind: 'http' }));
    const action = createIdempotentAction(request, () => 'action-key');

    await expect(action.run()).rejects.toMatchObject({ kind: 'http' });
    await expect(action.retry()).rejects.toThrow('This action has no network retry available.');
    expect(request).toHaveBeenCalledTimes(1);
  });
});
