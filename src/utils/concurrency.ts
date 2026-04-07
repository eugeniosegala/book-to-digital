import pLimit from 'p-limit';

export const processWithConcurrency = async <T, R>(
  items: T[],
  processor: (item: T, index: number) => Promise<R>,
  concurrency: number,
  onProgress?: (completed: number, total: number) => void,
): Promise<R[]> => {
  const limit = pLimit(concurrency);
  let completed = 0;

  const promises = items.map((item, index) =>
    limit(async () => {
      const result = await processor(item, index);
      completed++;
      onProgress?.(completed, items.length);
      return result;
    }),
  );

  return Promise.all(promises);
};
