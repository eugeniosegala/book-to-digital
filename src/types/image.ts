export type ImageMimeType =
  | "image/jpeg"
  | "image/png"
  | "image/webp"
  | "image/tiff";

export interface ImageDimensions {
  width: number;
  height: number;
}

export interface ImageData extends ImageDimensions {
  buffer: Buffer;
  mimeType: ImageMimeType;
}

export interface VisionImageSource {
  base64: string;
  mimeType: ImageMimeType;
}
