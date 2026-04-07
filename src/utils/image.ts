import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import { CROP_PADDING, JPEG_OUTPUT_QUALITY } from '../config.js';
import type { BoundingBox } from '../types.js';

export interface ImageData {
  buffer: Buffer;
  width: number;
  height: number;
}

export const readImage = async (filePath: string): Promise<ImageData> => {
  const rawBuffer = await fs.readFile(filePath);

  // Auto-rotate based on EXIF orientation, then strip EXIF to avoid double-rotation
  const rotated = sharp(rawBuffer).rotate();
  const buffer = await rotated.toBuffer();
  const metadata = await sharp(buffer).metadata();

  if (!metadata.width || !metadata.height) {
    throw new Error(`Could not read dimensions for ${filePath}`);
  }

  return { buffer, width: metadata.width, height: metadata.height };
};

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
  const right = Math.min(imageWidth, Math.round((box.left + box.width + padX) * imageWidth));
  const bottom = Math.min(imageHeight, Math.round((box.top + box.height + padY) * imageHeight));

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

const IMAGE_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.webp', '.tiff', '.tif']);

export const isImageFile = (filePath: string): boolean => {
  const ext = path.extname(filePath).toLowerCase();
  return IMAGE_EXTENSIONS.has(ext);
};
