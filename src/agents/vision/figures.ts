import sharp from "sharp";
import { FIGURE_CROP_MARGIN, JPEG_OUTPUT_QUALITY } from "../../config.js";
import type { FigureInfo } from "../../types.js";
import { callVisionLLM } from "../../clients/vision-llm.js";

const FIGURES_PROMPT = `You are analyzing a photographed book page. Your ONLY task is to identify images, illustrations, photographs, and drawings on the page.

Rules:
- Identify every visual figure on the page: photographs, illustrations, drawings, paintings, diagrams, maps, engravings, sketches.
- Do NOT include: text blocks, decorative borders, page ornaments, or the page itself.
- For each figure provide:
  - "boundingBox": normalized coordinates (0-1) relative to the full photo dimensions. "top" and "left" mark the upper-left corner. The box must tightly but completely contain the entire figure with minimal extra whitespace. Do NOT cut off any part of the figure.
  - "caption": the caption text associated with this figure, usually printed directly below or beside it (often starting with "Abb.", "Fig.", "Tafel", "Bild"). Set to null if no caption is found.
  - "type": use "full_page" if the figure fills most of the page, "illustration" for significant standalone images, "inline" for small images embedded within text.
- If there are no figures on the page, return an empty array.`;

const FIGURES_SCHEMA = {
  type: "object",
  properties: {
    figures: {
      type: "array",
      items: {
        type: "object",
        properties: {
          boundingBox: {
            type: "object",
            properties: {
              top: { type: "number" },
              left: { type: "number" },
              width: { type: "number" },
              height: { type: "number" },
            },
            required: ["top", "left", "width", "height"],
          },
          caption: { type: ["string", "null"] },
          type: {
            type: "string",
            enum: ["full_page", "illustration", "inline"],
          },
        },
        required: ["boundingBox", "caption", "type"],
      },
    },
  },
  required: ["figures"],
};

// --- Bounding box helpers ---

const hasInvalidBox = (fig: FigureInfo): boolean =>
  fig.boundingBox.width <= 0 || fig.boundingBox.height <= 0;

const clampBoxes = (figures: FigureInfo[]): void => {
  for (const fig of figures) {
    const box = fig.boundingBox;
    box.top = Math.max(0, Math.min(1, box.top));
    box.left = Math.max(0, Math.min(1, box.left));
    box.width = Math.max(0, Math.min(1 - box.left, box.width));
    box.height = Math.max(0, Math.min(1 - box.top, box.height));
  }
};

const mapBoxToFullImage = (fig: FigureInfo): void => {
  const box = fig.boundingBox;
  const scale = 1 - 2 * FIGURE_CROP_MARGIN;
  box.left = FIGURE_CROP_MARGIN + box.left * scale;
  box.top = FIGURE_CROP_MARGIN + box.top * scale;
  box.width = box.width * scale;
  box.height = box.height * scale;
};

const cropImageCenter = async (imageBuffer: Buffer): Promise<Buffer> => {
  const meta = await sharp(imageBuffer).metadata();
  const w = meta.width!;
  const h = meta.height!;
  const left = Math.round(w * FIGURE_CROP_MARGIN);
  const top = Math.round(h * FIGURE_CROP_MARGIN);
  const width = Math.round(w * (1 - 2 * FIGURE_CROP_MARGIN));
  const height = Math.round(h * (1 - 2 * FIGURE_CROP_MARGIN));
  return sharp(imageBuffer)
    .extract({ left, top, width, height })
    .jpeg({ quality: JPEG_OUTPUT_QUALITY })
    .toBuffer();
};

// --- Public API ---

export const detectFigures = async (
  base64Image: string,
  imageBuffer: Buffer,
  apiKey: string,
): Promise<FigureInfo[]> => {
  const result = await callVisionLLM<{ figures: FigureInfo[] }>(
    base64Image,
    apiKey,
    FIGURES_PROMPT,
    "Identify all figures on this book page.",
    "page_figures",
    FIGURES_SCHEMA,
  );

  clampBoxes(result.figures);

  // If any figures have degenerate boxes, retry with a 10%-cropped image to reduce noise
  if (result.figures.length > 0 && result.figures.some(hasInvalidBox)) {
    const croppedBuffer = await cropImageCenter(imageBuffer);
    const croppedBase64 = croppedBuffer.toString("base64");
    const retryResult = await callVisionLLM<{ figures: FigureInfo[] }>(
      croppedBase64,
      apiKey,
      FIGURES_PROMPT,
      "Identify all figures on this book page.",
      "page_figures",
      FIGURES_SCHEMA,
    );
    clampBoxes(retryResult.figures);

    if (
      retryResult.figures.length > 0 &&
      !retryResult.figures.some(hasInvalidBox)
    ) {
      retryResult.figures.forEach(mapBoxToFullImage);
      return retryResult.figures;
    }
  }

  return result.figures;
};
