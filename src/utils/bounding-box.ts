import type { BoundingBox } from "../types/content.js";

export const clampBoundingBox = (box: BoundingBox): BoundingBox => {
  const top = Math.max(0, Math.min(1, box.top));
  const left = Math.max(0, Math.min(1, box.left));
  const width = Math.max(0, Math.min(1 - left, box.width));
  const height = Math.max(0, Math.min(1 - top, box.height));

  return { top, left, width, height };
};

export const hasDegenerateBoundingBox = (box: BoundingBox): boolean =>
  box.width <= 0 || box.height <= 0;

export const mapBoundingBoxFromCenteredCrop = (
  box: BoundingBox,
  marginRatio: number,
): BoundingBox => {
  const scale = 1 - 2 * marginRatio;

  return {
    left: marginRatio + box.left * scale,
    top: marginRatio + box.top * scale,
    width: box.width * scale,
    height: box.height * scale,
  };
};

export const boxRight = (box: BoundingBox): number => box.left + box.width;
export const boxBottom = (box: BoundingBox): number => box.top + box.height;

export const boxCenter = (box: BoundingBox) => ({
  x: box.left + box.width / 2,
  y: box.top + box.height / 2,
});

export const boxDistance = (a: BoundingBox, b: BoundingBox): number => {
  const centerA = boxCenter(a);
  const centerB = boxCenter(b);
  return Math.hypot(centerA.x - centerB.x, centerA.y - centerB.y);
};

export const mergeBoundingBoxes = (
  a: BoundingBox,
  b: BoundingBox,
): BoundingBox => {
  const left = Math.min(a.left, b.left);
  const top = Math.min(a.top, b.top);
  const right = Math.max(boxRight(a), boxRight(b));
  const bottom = Math.max(boxBottom(a), boxBottom(b));

  return {
    left,
    top,
    width: right - left,
    height: bottom - top,
  };
};

export const horizontalOverlapRatio = (
  a: BoundingBox,
  b: BoundingBox,
): number => {
  const overlap = Math.max(
    0,
    Math.min(boxRight(a), boxRight(b)) - Math.max(a.left, b.left),
  );
  const minWidth = Math.min(a.width, b.width);
  return minWidth > 0 ? overlap / minWidth : 0;
};
