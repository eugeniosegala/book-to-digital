import fs from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { CROP_PADDING, JPEG_OUTPUT_QUALITY } from "../config/image.js";
import type { BoundingBox } from "../types/content.js";
import type {
  ImageData,
  ImageMimeType,
  VisionImageSource,
} from "../types/image.js";

export type {
  ImageData,
  ImageDimensions,
  ImageMimeType,
  VisionImageSource,
} from "../types/image.js";

const SHARP_FORMAT_TO_MIME_TYPE: Partial<Record<string, ImageMimeType>> = {
  jpeg: "image/jpeg",
  jpg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  tif: "image/tiff",
  tiff: "image/tiff",
};

const toMimeType = (format?: string): ImageMimeType => {
  const resolved = format ? SHARP_FORMAT_TO_MIME_TYPE[format] : undefined;
  return resolved ?? "image/jpeg";
};

const toImageData = async (
  pipeline: sharp.Sharp,
  sourceLabel: string,
): Promise<ImageData> => {
  const { data, info } = await pipeline.toBuffer({ resolveWithObject: true });

  if (!info.width || !info.height) {
    throw new Error(`Could not read dimensions for ${sourceLabel}`);
  }

  return {
    buffer: data,
    width: info.width,
    height: info.height,
    mimeType: toMimeType(info.format),
  };
};

export const readImage = async (filePath: string): Promise<ImageData> => {
  const rawBuffer = await fs.readFile(filePath);

  // Auto-rotate based on EXIF orientation, then strip EXIF to avoid double-rotation
  return toImageData(sharp(rawBuffer).rotate(), filePath);
};

export const rotateImage = async (
  imageBuffer: Buffer,
  degrees: 0 | 90 | 180 | 270,
): Promise<ImageData> =>
  toImageData(sharp(imageBuffer).rotate(degrees), `rotation ${degrees}`);

export const cropRegion = async (
  imageBuffer: Buffer,
  imageWidth: number,
  imageHeight: number,
  box: BoundingBox,
): Promise<ImageData> => {
  // Add padding around the bounding box to avoid cutting off edges
  const padX = box.width * CROP_PADDING;
  const padY = box.height * CROP_PADDING;

  const left = Math.max(0, Math.round((box.left - padX) * imageWidth));
  const top = Math.max(0, Math.round((box.top - padY) * imageHeight));
  const right = Math.min(
    imageWidth,
    Math.round((box.left + box.width + padX) * imageWidth),
  );
  const bottom = Math.min(
    imageHeight,
    Math.round((box.top + box.height + padY) * imageHeight),
  );

  const width = right - left;
  const height = bottom - top;

  if (width <= 0 || height <= 0) {
    throw new Error(`Invalid crop region: ${JSON.stringify(box)}`);
  }

  return toImageData(
    sharp(imageBuffer)
      .extract({ left, top, width, height })
      .jpeg({ quality: JPEG_OUTPUT_QUALITY }),
    "crop region",
  );
};

export const cropImageCenter = async (
  image: Pick<ImageData, "buffer" | "width" | "height">,
  marginRatio: number,
): Promise<ImageData> => {
  const left = Math.round(image.width * marginRatio);
  const top = Math.round(image.height * marginRatio);
  const width = Math.round(image.width * (1 - 2 * marginRatio));
  const height = Math.round(image.height * (1 - 2 * marginRatio));

  return toImageData(
    sharp(image.buffer)
      .extract({ left, top, width, height })
      .jpeg({ quality: JPEG_OUTPUT_QUALITY }),
    "center crop",
  );
};

export const toVisionImageSource = (
  image: Pick<ImageData, "buffer" | "mimeType">,
): VisionImageSource => ({
  base64: image.buffer.toString("base64"),
  mimeType: image.mimeType,
});

const IMAGE_EXTENSIONS = new Set([
  ".jpg",
  ".jpeg",
  ".png",
  ".webp",
  ".tiff",
  ".tif",
]);

export const isImageFile = (filePath: string): boolean => {
  const ext = path.extname(filePath).toLowerCase();
  return IMAGE_EXTENSIONS.has(ext);
};
