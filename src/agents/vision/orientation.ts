import { ORIENTATION_LLM_MIN_CONFIDENCE } from '../../config.js';
import { callVisionLLM } from '../../clients/vision-llm.js';
import { rotateImage, type ImageData } from '../../utils/image.js';

const ORIENTATION_PROMPT = `You are analyzing a photographed book page. Your ONLY task is to choose the rotation needed to make the page upright for reading.

Rules:
- Allowed rotations are exactly: 0, 90, 180, or 270 degrees clockwise.
- Prefer 0 if the page is already upright.
- The final page should be readable in portrait orientation whenever possible.
- Use higher confidence only when the page direction is visually clear from text, layout, or figure captions.
- If the page is ambiguous, still choose the best rotation but lower the confidence.`;

const ORIENTATION_SCHEMA = {
  type: 'object',
  properties: {
    rotationDegrees: { type: 'integer', enum: [0, 90, 180, 270] },
    confidence: { type: 'number' },
  },
  required: ['rotationDegrees', 'confidence'],
};

export const normalizePageOrientation = async (
  image: ImageData,
  filePath: string,
  apiKey: string,
): Promise<ImageData> => {
  const isPortrait = image.height > image.width;

  const result = await callVisionLLM<{ rotationDegrees: 0 | 90 | 180 | 270; confidence: number }>(
    image.buffer.toString('base64'),
    apiKey,
    ORIENTATION_PROMPT,
    'Choose the clockwise rotation needed to make this photographed book page upright. Return only 0, 90, 180, or 270.',
    'page_orientation',
    ORIENTATION_SCHEMA,
  );

  if (isPortrait) {
    if (result.confidence < ORIENTATION_LLM_MIN_CONFIDENCE || result.rotationDegrees !== 180) {
      return image;
    }

    return rotateImage(image.buffer, 180);
  }

  if (result.confidence < ORIENTATION_LLM_MIN_CONFIDENCE) {
    throw new Error(
      `Vision orientation confidence too low for ${filePath}: ${result.confidence.toFixed(2)}`,
    );
  }

  const rotated = await rotateImage(image.buffer, result.rotationDegrees);

  if (rotated.height <= rotated.width) {
    throw new Error(
      `Vision orientation fallback did not recover a portrait image for ${filePath} (rotation ${result.rotationDegrees})`,
    );
  }

  return rotated;
};
