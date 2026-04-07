import { describe, it, expect } from 'vitest';
import path from 'node:path';
import sharp from 'sharp';
import { readImage, cropRegion, isImageFile, rotateImage } from '../../src/utils/image.js';

const createTestImage = async (
  width: number,
  height: number,
  orientation?: number,
): Promise<Buffer> => {
  let image = sharp({
    create: { width, height, channels: 3, background: { r: 255, g: 0, b: 0 } },
  }).jpeg();

  if (orientation) {
    image = image.withMetadata({ orientation });
  }

  return image.toBuffer();
};

describe('isImageFile', () => {
  it('accepts common image extensions', () => {
    expect(isImageFile('photo.jpg')).toBe(true);
    expect(isImageFile('photo.jpeg')).toBe(true);
    expect(isImageFile('photo.png')).toBe(true);
    expect(isImageFile('photo.webp')).toBe(true);
    expect(isImageFile('photo.tiff')).toBe(true);
    expect(isImageFile('photo.tif')).toBe(true);
  });

  it('is case-insensitive', () => {
    expect(isImageFile('photo.JPG')).toBe(true);
    expect(isImageFile('photo.Png')).toBe(true);
  });

  it('rejects non-image files', () => {
    expect(isImageFile('doc.txt')).toBe(false);
    expect(isImageFile('doc.pdf')).toBe(false);
    expect(isImageFile('doc.docx')).toBe(false);
  });
});

describe('readImage', () => {
  it('reads image buffer and dimensions', async () => {
    const tmpPath = path.join(import.meta.dirname, '../fixtures/test-image.jpg');
    const imgBuffer = await createTestImage(200, 300);
    const fs = await import('node:fs/promises');
    await fs.writeFile(tmpPath, imgBuffer);

    const result = await readImage(tmpPath);
    expect(result.width).toBe(200);
    expect(result.height).toBe(300);
    expect(result.buffer.length).toBeGreaterThan(0);

    await fs.unlink(tmpPath);
  });

  it('applies EXIF auto-rotation before returning dimensions', async () => {
    const tmpPath = path.join(import.meta.dirname, '../fixtures/test-image-exif.jpg');
    const imgBuffer = await createTestImage(300, 200, 6);
    const fs = await import('node:fs/promises');
    await fs.writeFile(tmpPath, imgBuffer);

    const result = await readImage(tmpPath);
    expect(result.width).toBe(200);
    expect(result.height).toBe(300);

    await fs.unlink(tmpPath);
  });

  it('throws for non-existent file', async () => {
    await expect(readImage('/nonexistent/file.jpg')).rejects.toThrow();
  });
});

describe('rotateImage', () => {
  it('rotates image dimensions by 90 degrees', async () => {
    const imgBuffer = await createTestImage(300, 200);
    const rotated = await rotateImage(imgBuffer, 90);

    expect(rotated.width).toBe(200);
    expect(rotated.height).toBe(300);
    expect(rotated.buffer.length).toBeGreaterThan(0);
  });
});

describe('cropRegion', () => {
  it('crops a region from an image with padding', async () => {
    const imgBuffer = await createTestImage(400, 600);
    const cropped = await cropRegion(imgBuffer, 400, 600, {
      top: 0.25,
      left: 0.25,
      width: 0.5,
      height: 0.5,
    });

    // 5% padding on each side: width = (0.5 + 0.05) * 400 = 220, height = (0.5 + 0.05) * 600 = 330
    expect(cropped.width).toBe(220);
    expect(cropped.height).toBe(330);
    expect(cropped.buffer.length).toBeGreaterThan(0);
  });

  it('clamps padded crop to image bounds', async () => {
    const imgBuffer = await createTestImage(400, 600);
    const cropped = await cropRegion(imgBuffer, 400, 600, {
      top: 0.8,
      left: 0.8,
      width: 0.5,
      height: 0.5,
    });

    // Clamped to image edge: right = min(400, round((0.8+0.5+0.025)*400)) = 400, left = round((0.8-0.025)*400) = 310
    expect(cropped.width).toBe(90);
    expect(cropped.height).toBe(135);
  });

  it('throws for zero-size crop', async () => {
    const imgBuffer = await createTestImage(400, 600);
    await expect(
      cropRegion(imgBuffer, 400, 600, { top: 0, left: 0, width: 0, height: 0 }),
    ).rejects.toThrow('Invalid crop region');
  });
});
