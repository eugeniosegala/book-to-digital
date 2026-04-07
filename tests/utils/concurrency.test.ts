import { describe, it, expect, vi } from 'vitest';
import { processWithConcurrency } from '../../src/utils/concurrency.js';

describe('processWithConcurrency', () => {
  it('processes all items and returns results in order', async () => {
    const items = [1, 2, 3, 4, 5];
    const results = await processWithConcurrency(
      items,
      async (item) => item * 2,
      3,
    );
    expect(results).toEqual([2, 4, 6, 8, 10]);
  });

  it('respects concurrency limit', async () => {
    let running = 0;
    let maxRunning = 0;

    const items = Array.from({ length: 10 }, (_, i) => i);
    await processWithConcurrency(
      items,
      async () => {
        running++;
        maxRunning = Math.max(maxRunning, running);
        await new Promise((r) => setTimeout(r, 20));
        running--;
      },
      3,
    );

    expect(maxRunning).toBeLessThanOrEqual(3);
  });

  it('calls progress callback', async () => {
    const onProgress = vi.fn();
    const items = [1, 2, 3];

    await processWithConcurrency(items, async (item) => item, 2, onProgress);

    expect(onProgress).toHaveBeenCalledTimes(3);
    expect(onProgress).toHaveBeenLastCalledWith(3, 3);
  });

  it('handles empty input', async () => {
    const results = await processWithConcurrency([], async (item) => item, 3);
    expect(results).toEqual([]);
  });

  it('propagates errors', async () => {
    await expect(
      processWithConcurrency(
        [1, 2, 3],
        async (item) => {
          if (item === 2) throw new Error('fail');
          return item;
        },
        2,
      ),
    ).rejects.toThrow('fail');
  });
});
