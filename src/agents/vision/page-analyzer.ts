import type { VisionAnalysis } from "../../types/vision.js";
import type { ImageData } from "../../types/image.js";
import { toVisionImageSource } from "../../utils/image.js";
import { detectPageNumber } from "./page-number.js";
import { detectFigures } from "./figures.js";

export const analyzePageVision = async (
  image: ImageData,
  apiKey: string,
): Promise<VisionAnalysis> => {
  const imageSource = toVisionImageSource(image);

  const [pageNumber, figures] = await Promise.all([
    detectPageNumber(imageSource, apiKey).catch(() => null),
    detectFigures(image, apiKey).catch(() => []),
  ]);

  return { pageNumber, figures };
};
