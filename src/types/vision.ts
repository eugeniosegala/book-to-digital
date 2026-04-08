import type { BoundingBox } from "./content.js";

export type FigureType = "full_page" | "illustration" | "inline";
export type RotationDegrees = 0 | 90 | 180 | 270;

export interface FigureInfo {
  boundingBox: BoundingBox;
  caption: string | null;
  type: FigureType;
}

export interface VisionAnalysis {
  pageNumber: string | null;
  figures: FigureInfo[];
}
