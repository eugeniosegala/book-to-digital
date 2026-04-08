export type SortOrder = "name" | "date";

export interface PipelineConfig {
  inputDir: string;
  outputPath: string;
  concurrency: number;
  awsRegion: string;
  sortOrder: SortOrder;
  maxPages?: number;
  translateLanguage?: string;
  verbose: boolean;
}
