#!/usr/bin/env node

import 'dotenv/config';
import { Command } from 'commander';
import { DEFAULT_CONCURRENCY } from './config.js';
import { processBook } from './pipeline.js';
import type { SortOrder } from './types.js';
import { toErrorMessage } from './utils/error.js';
import * as log from './utils/logger.js';

const program = new Command();

program
  .name('book-to-digital')
  .description('Convert photos of physical books into structured Word documents')
  .version('0.1.0')
  .argument('<input-folder>', 'Path to folder containing page photos')
  .option('-o, --output <path>', 'Output .docx file path', './output.docx')
  .option('-c, --concurrency <n>', 'Max concurrent Textract calls', String(DEFAULT_CONCURRENCY))
  .option('-r, --region <region>', 'AWS region', process.env.AWS_REGION ?? 'us-east-1')
  .option('-s, --sort <order>', 'Sort order: name or date', 'name')
  .option('-n, --max-pages <n>', 'Max number of pages to process (for testing)')
  .option('-t, --translate <language>', 'Translate to target language (e.g., en, English)')
  .option('-v, --verbose', 'Enable verbose logging', false)
  .action(async (inputDir: string, opts: Record<string, string | boolean | undefined>) => {
    try {
      await processBook({
        inputDir,
        outputPath: opts.output as string,
        concurrency: parseInt(opts.concurrency as string, 10),
        awsRegion: opts.region as string,
        sortOrder: (opts.sort as SortOrder) ?? 'name',
        maxPages: opts.maxPages ? parseInt(opts.maxPages as string, 10) : undefined,
        translateLanguage: opts.translate as string | undefined,
        verbose: opts.verbose as boolean,
      });
    } catch (err) {
      log.error(toErrorMessage(err));
      process.exit(1);
    }
  });

program.parse();
