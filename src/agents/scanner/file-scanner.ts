import fs from 'node:fs/promises';
import path from 'node:path';
import { orderBy } from 'natural-orderby';
import { isImageFile } from '../../utils/image.js';
import type { SortOrder } from '../../types.js';

const sortByName = (files: string[]): string[] => orderBy(files);

const sortByDate = async (dirPath: string, files: string[]): Promise<string[]> => {
  const withStats = await Promise.all(
    files.map(async (file) => {
      const stat = await fs.stat(path.join(dirPath, file));
      return { file, mtime: stat.mtimeMs };
    }),
  );
  withStats.sort((a, b) => a.mtime - b.mtime);
  return withStats.map((s) => s.file);
};

export const scanForImages = async (
  dirPath: string,
  sort: SortOrder = 'name',
): Promise<string[]> => {
  const stat = await fs.stat(dirPath);
  if (!stat.isDirectory()) {
    throw new Error(`Not a directory: ${dirPath}`);
  }

  const entries = await fs.readdir(dirPath);
  const imageFiles = entries.filter((entry) => isImageFile(entry));

  if (imageFiles.length === 0) {
    throw new Error(`No image files found in ${dirPath}`);
  }

  const sorted = sort === 'date' ? await sortByDate(dirPath, imageFiles) : sortByName(imageFiles);
  return sorted.map((file) => path.join(dirPath, file));
};
