import type { VisionAnalysis } from '../../types.js';
import { detectPageNumber } from './page-number.js';
import { detectFigures } from './figures.js';

export const analyzePageVision = async (
  imageBuffer: Buffer,
  apiKey: string,
): Promise<VisionAnalysis> => {
  const base64 = imageBuffer.toString('base64');

  const [pageNumber, figures] = await Promise.all([
    detectPageNumber(base64, apiKey).catch(() => null),
    detectFigures(base64, imageBuffer, apiKey).catch(() => []),
  ]);

  return { pageNumber, figures };
};
