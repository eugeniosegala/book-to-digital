import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { scanForImages } from '../../../src/agents/scanner/file-scanner.js';

let tmpDir: string;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'scanner-test-'));
});

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true });
});

const touch = (name: string) => fs.writeFile(path.join(tmpDir, name), '');

describe('scanForImages', () => {
  it('finds and sorts image files naturally', async () => {
    await Promise.all([
      touch('page_10.jpg'),
      touch('page_2.jpg'),
      touch('page_1.jpg'),
    ]);

    const results = await scanForImages(tmpDir);
    expect(results.map((r) => path.basename(r))).toEqual([
      'page_1.jpg',
      'page_2.jpg',
      'page_10.jpg',
    ]);
  });

  it('filters out non-image files', async () => {
    await Promise.all([
      touch('photo.jpg'),
      touch('notes.txt'),
      touch('document.pdf'),
      touch('image.png'),
    ]);

    const results = await scanForImages(tmpDir);
    const names = results.map((r) => path.basename(r));
    expect(names).toContain('photo.jpg');
    expect(names).toContain('image.png');
    expect(names).not.toContain('notes.txt');
    expect(names).not.toContain('document.pdf');
  });

  it('handles timestamp-based filenames', async () => {
    await Promise.all([
      touch('20260330_150424.jpg'),
      touch('20260330_150157.jpg'),
      touch('20260330_150205.jpg'),
    ]);

    const results = await scanForImages(tmpDir);
    expect(results.map((r) => path.basename(r))).toEqual([
      '20260330_150157.jpg',
      '20260330_150205.jpg',
      '20260330_150424.jpg',
    ]);
  });

  it('handles case-insensitive extensions', async () => {
    await Promise.all([touch('photo.JPG'), touch('image.Png')]);

    const results = await scanForImages(tmpDir);
    expect(results).toHaveLength(2);
  });

  it('throws for empty directory', async () => {
    await expect(scanForImages(tmpDir)).rejects.toThrow('No image files found');
  });

  it('throws for non-existent path', async () => {
    await expect(scanForImages('/nonexistent/path')).rejects.toThrow();
  });

  it('throws for file path instead of directory', async () => {
    const filePath = path.join(tmpDir, 'file.txt');
    await touch('file.txt');
    await expect(scanForImages(filePath)).rejects.toThrow('Not a directory');
  });

  it('sorts by modification date when sort=date', async () => {
    // Create files with staggered mtimes
    await fs.writeFile(path.join(tmpDir, 'c.jpg'), '');
    const past1 = new Date(Date.now() - 2000);
    await fs.utimes(path.join(tmpDir, 'c.jpg'), past1, past1);

    await fs.writeFile(path.join(tmpDir, 'a.jpg'), '');
    const past2 = new Date(Date.now() - 1000);
    await fs.utimes(path.join(tmpDir, 'a.jpg'), past2, past2);

    await fs.writeFile(path.join(tmpDir, 'b.jpg'), '');
    // b.jpg keeps the most recent mtime

    const results = await scanForImages(tmpDir, 'date');
    expect(results.map((r) => path.basename(r))).toEqual(['c.jpg', 'a.jpg', 'b.jpg']);
  });

  it('defaults to name sort', async () => {
    await Promise.all([touch('b.jpg'), touch('a.jpg')]);
    const results = await scanForImages(tmpDir);
    expect(results.map((r) => path.basename(r))).toEqual(['a.jpg', 'b.jpg']);
  });
});
