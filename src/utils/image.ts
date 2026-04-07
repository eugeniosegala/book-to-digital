import fs from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { CROP_PADDING, JPEG_OUTPUT_QUALITY } from "../config.js";
import type { BoundingBox } from "../types.js";

export interface ImageData {
  buffer: Buffer;
  width: number;
  height: number;
}

const toImageData = async (
  pipeline: sharp.Sharp,
  sourceLabel: string,
): Promise<ImageData> => {
  const { data, info } = await pipeline.toBuffer({ resolveWithObject: true });

  if (!info.width || !info.height) {
    throw new Error(`Could not read dimensions for ${sourceLabel}`);
  }

  return { buffer: data, width: info.width, height: info.height };
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

  const cropped = await sharp(imageBuffer)
    .extract({ left, top, width, height })
    .jpeg({ quality: JPEG_OUTPUT_QUALITY })
    .toBuffer();

  return { buffer: cropped, width, height };
};

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
