import fs from 'node:fs/promises';
import path from 'node:path';
import type { PipelineConfig, ProcessedPage, VisionAnalysis } from './types.js';
import { scanForImages } from './agents/scanner/file-scanner.js';
import { readImage } from './utils/image.js';
import { analyzePageImage } from './clients/textract.js';
import { parseLayoutBlocks } from './agents/ocr/layout-parser.js';
import { analyzePageVision } from './agents/vision/page-enrichment.js';
import { normalizePageOrientation } from './agents/vision/orientation.js';
import { reorderBlocks } from './agents/vision/reading-order.js';
import { processWithConcurrency } from './utils/concurrency.js';
import { writeDocument } from './agents/document/docx-builder.js';
import { translatePages, resolveLanguage } from './agents/translation/translator.js';
import { toErrorMessage } from './utils/error.js';
import * as log from './utils/logger.js';

const DEBUG_ORIGINAL_DIR = path.join('debug', 'original');
const DEBUG_TRANSLATED_DIR = path.join('debug', 'translated');

const debugFileName = (page: ProcessedPage) => {
  const baseName = path.basename(page.filePath, path.extname(page.filePath));
  return `page-${String(page.pageNumber).padStart(3, '0')}-${baseName}.json`;
};

const stripBuffers = (page: ProcessedPage) => ({
  filePath: page.filePath,
  bookPageNumber: page.bookPageNumber,
  contentBlocks: page.contentBlocks.map(({ imageBuffer, ...rest }) => rest),
});

const writeDebugPage = async (dir: string, page: ProcessedPage) => {
  await fs.mkdir(dir, { recursive: true });
  const debugPath = path.join(dir, debugFileName(page));
  await fs.writeFile(debugPath, JSON.stringify(stripBuffers(page), null, 2));
  log.debug(`Debug: ${debugPath}`);
};

const processPage = async (
  filePath: string,
  pageNumber: number,
  region: string,
  apiKey: string,
): Promise<ProcessedPage> => {
  const errors: string[] = [];

  try {
    const rawImage = await readImage(filePath);
    const { buffer, width, height } = await normalizePageOrientation(rawImage, filePath, apiKey);

    const label = `Page ${pageNumber}`;
    const orientationCorrected = buffer !== rawImage.buffer
      || width !== rawImage.width
      || height !== rawImage.height;
    if (orientationCorrected) {
      log.warn(`${label}: corrected page orientation via vision fallback`);
    }

    let contentBlocks: ProcessedPage['contentBlocks'];
    let bookPageNumber: string | undefined;
    try {
      // Run Textract and vision LLM in parallel
      log.debug(`${label}: Textract + Vision started`);
      const textractPromise = analyzePageImage(buffer, region);
      const visionPromise = analyzePageVision(buffer, apiKey).catch((err) => {
        log.warn(`${label}: Vision failed — ${toErrorMessage(err)}`);
        return { pageNumber: null, figures: [] } as VisionAnalysis;
      });

      const [textractResponse, visionResult] = await Promise.all([textractPromise, visionPromise]);
      log.debug(`${label}: Vision → bookPage=${visionResult.pageNumber}, figures=${visionResult.figures.length}`);

      const result = await parseLayoutBlocks(
        textractResponse, buffer, width, height, visionResult,
      );
      bookPageNumber = result.bookPageNumber;

      const base64 = buffer.toString('base64');
      contentBlocks = await reorderBlocks(base64, result.contentBlocks, apiKey).catch((err) => {
        log.warn(`${label}: Reading order failed — ${toErrorMessage(err)}`);
        return result.contentBlocks;
      });
      log.debug(`${label}: done (${contentBlocks.length} blocks)`);
    } catch (err) {
      errors.push(`OCR failed: ${toErrorMessage(err)}`);
      contentBlocks = [];
    }

    const page: ProcessedPage = { pageNumber, filePath, contentBlocks, bookPageNumber, errors };

    if (log.isVerbose()) {
      writeDebugPage(DEBUG_ORIGINAL_DIR, page).catch(() => {});
    }

    return page;
  } catch (err) {
    return {
      pageNumber,
      filePath,
      contentBlocks: [],
      errors: [`Failed to prepare image: ${toErrorMessage(err)}`],
    };
  }
};

export const processBook = async (config: PipelineConfig): Promise<void> => {
  log.setVerbose(config.verbose);

  // Ensure output directory exists
  const outputDir = path.dirname(path.resolve(config.outputPath));
  await fs.mkdir(outputDir, { recursive: true });

  const openRouterApiKey = process.env.OPENROUTER_API_KEY;
  if (!openRouterApiKey) {
    throw new Error('OPENROUTER_API_KEY is required — set it in .env or your environment');
  }

  // Scan for images
  log.info(`Scanning ${config.inputDir} for images (sort: ${config.sortOrder})...`);
  let imagePaths = await scanForImages(config.inputDir, config.sortOrder);
  log.info(`Found ${imagePaths.length} images`);

  // Limit pages if requested
  if (config.maxPages && config.maxPages < imagePaths.length) {
    imagePaths = imagePaths.slice(0, config.maxPages);
    log.info(`Limited to first ${config.maxPages} pages`);
  }

  // OCR + vision analysis for each page
  log.info(`Extracting text & figures (Textract + Vision LLM, ${config.concurrency} pages in parallel)...`);
  const pages = await processWithConcurrency(
    imagePaths,
    async (filePath, index) => processPage(filePath, index + 1, config.awsRegion, openRouterApiKey),
    config.concurrency,
    (completed, total) => log.progress(completed, total, 'OCR & layout'),
  );

  // Report errors
  const failed = pages.filter((p) => p.errors.length > 0);
  if (failed.length > 0) {
    log.warn(`${failed.length} page(s) had errors:`);
    for (const page of failed) {
      log.warn(`  Page ${page.pageNumber} (${path.basename(page.filePath)}): ${page.errors.join(', ')}`);
    }
  }

  // Build and write an original document
  log.info('Building Word document...');
  await writeDocument(pages, config.outputPath);
  log.info(`Output: ${path.resolve(config.outputPath)}`);

  // Translate and write the second document if requested
  if (config.translateLanguage) {
    log.info(`Translating to ${resolveLanguage(config.translateLanguage)} (${config.concurrency} pages in parallel)...`);
    const translatedPages = await translatePages(pages, {
      apiKey: openRouterApiKey,
      targetLanguage: config.translateLanguage,
      concurrency: config.concurrency,
    });

    const ext = path.extname(config.outputPath);
    const base = config.outputPath.slice(0, -ext.length);
    const translatedPath = `${base}.${config.translateLanguage}${ext}`;

    if (log.isVerbose()) {
      await Promise.all(
        translatedPages.map((p) => writeDebugPage(DEBUG_TRANSLATED_DIR, p).catch(() => {})),
      );
    }

    log.info('Building translated Word document...');
    await writeDocument(translatedPages, translatedPath);
    log.info(`Translated output: ${path.resolve(translatedPath)}`);
  }

  const successful = pages.length - failed.length;
  log.info(`Done! ${successful}/${pages.length} pages processed successfully`);
};
