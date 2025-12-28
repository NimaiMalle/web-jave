// Bresenham's line algorithm
export function* bresenhamLine(
  x0: number,
  y0: number,
  x1: number,
  y1: number
): Generator<{ x: number; y: number }> {
  const dx = Math.abs(x1 - x0);
  const dy = Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1;
  const sy = y0 < y1 ? 1 : -1;
  let err = dx - dy;

  let x = x0;
  let y = y0;

  while (true) {
    yield { x, y };

    if (x === x1 && y === y1) break;

    const e2 = 2 * err;
    if (e2 > -dy) {
      err -= dy;
      x += sx;
    }
    if (e2 < dx) {
      err += dx;
      y += sy;
    }
  }
}

// Draw line to ImageData (1px, grayscale)
export function drawLine(
  imageData: ImageData,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  color: number
): void {
  const { width, height, data } = imageData;

  for (const { x, y } of bresenhamLine(x0, y0, x1, y1)) {
    if (x >= 0 && x < width && y >= 0 && y < height) {
      const idx = (y * width + x) * 4;
      data[idx] = color;
      data[idx + 1] = color;
      data[idx + 2] = color;
      data[idx + 3] = 255;
    }
  }
}

// Rectangle outline (1px stroke)
export function* rectangleOutline(
  x0: number,
  y0: number,
  x1: number,
  y1: number
): Generator<{ x: number; y: number }> {
  const minX = Math.min(x0, x1);
  const maxX = Math.max(x0, x1);
  const minY = Math.min(y0, y1);
  const maxY = Math.max(y0, y1);

  // Top edge
  for (let x = minX; x <= maxX; x++) {
    yield { x, y: minY };
  }
  // Right edge (skip top corner)
  for (let y = minY + 1; y <= maxY; y++) {
    yield { x: maxX, y };
  }
  // Bottom edge (skip right corner)
  for (let x = maxX - 1; x >= minX; x--) {
    yield { x, y: maxY };
  }
  // Left edge (skip both corners)
  for (let y = maxY - 1; y > minY; y--) {
    yield { x: minX, y };
  }
}

// Draw rectangle outline to ImageData
export function drawRectangle(
  imageData: ImageData,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  color: number
): void {
  const { width, height, data } = imageData;

  for (const { x, y } of rectangleOutline(x0, y0, x1, y1)) {
    if (x >= 0 && x < width && y >= 0 && y < height) {
      const idx = (y * width + x) * 4;
      data[idx] = color;
      data[idx + 1] = color;
      data[idx + 2] = color;
      data[idx + 3] = 255;
    }
  }
}

// Midpoint ellipse algorithm with 4-quadrant symmetry
export function* ellipseOutline(
  x0: number,
  y0: number,
  x1: number,
  y1: number
): Generator<{ x: number; y: number }> {
  // Normalize coordinates
  let left = Math.min(x0, x1);
  let right = Math.max(x0, x1);
  let top = Math.min(y0, y1);
  let bottom = Math.max(y0, y1);

  let width = right - left;
  let height = bottom - top;

  // Snap odd dimensions to even for perfect symmetry
  if (width % 2 === 1) {
    right++;
    width++;
  }
  if (height % 2 === 1) {
    bottom++;
    height++;
  }

  if (width === 0 && height === 0) {
    yield { x: left, y: top };
    return;
  }

  if (width === 0) {
    for (let y = top; y <= bottom; y++) {
      yield { x: left, y };
    }
    return;
  }

  if (height === 0) {
    for (let x = left; x <= right; x++) {
      yield { x, y: top };
    }
    return;
  }

  // Integer center and radii (since dimensions are even)
  const cx = left + width / 2;
  const cy = top + height / 2;
  const rx = width / 2;
  const ry = height / 2;

  const yielded = new Set<string>();

  const yieldPoint = (x: number, y: number) => {
    const key = `${x},${y}`;
    if (!yielded.has(key)) {
      yielded.add(key);
      return { x, y };
    }
    return null;
  };

  // Plot 4 symmetric points around integer center
  const plot4 = (dx: number, dy: number) => {
    const points: Array<{ x: number; y: number }> = [];

    // With even dimensions, center is at half-pixel boundary
    // So cx + dx and cx - dx - 1 are symmetric pairs
    const x1p = Math.floor(cx + dx);
    const x2p = Math.floor(cx - dx - 1);
    const y1p = Math.floor(cy + dy);
    const y2p = Math.floor(cy - dy - 1);

    const p1 = yieldPoint(x1p, y1p);
    const p2 = yieldPoint(x2p, y1p);
    const p3 = yieldPoint(x1p, y2p);
    const p4 = yieldPoint(x2p, y2p);

    if (p1) points.push(p1);
    if (p2) points.push(p2);
    if (p3) points.push(p3);
    if (p4) points.push(p4);

    return points;
  };

  // Region 1: where |slope| < 1
  let dx = 0;
  let dy = ry;
  let d1 = ry * ry - rx * rx * ry + 0.25 * rx * rx;

  while (ry * ry * dx < rx * rx * dy) {
    for (const p of plot4(dx, dy)) yield p;

    if (d1 < 0) {
      dx++;
      d1 += 2 * ry * ry * dx + ry * ry;
    } else {
      dx++;
      dy--;
      d1 += 2 * ry * ry * dx - 2 * rx * rx * dy + ry * ry;
    }
  }

  // Region 2: where |slope| >= 1
  let d2 = ry * ry * (dx + 0.5) * (dx + 0.5) + rx * rx * (dy - 1) * (dy - 1) - rx * rx * ry * ry;

  while (dy >= 0) {
    for (const p of plot4(dx, dy)) yield p;

    if (d2 > 0) {
      dy--;
      d2 += -2 * rx * rx * dy + rx * rx;
    } else {
      dx++;
      dy--;
      d2 += 2 * ry * ry * dx - 2 * rx * rx * dy + rx * rx;
    }
  }
}

// Draw ellipse outline to ImageData
export function drawEllipse(
  imageData: ImageData,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  color: number
): void {
  const { width, height, data } = imageData;
  const drawnPixels = new Set<string>();

  for (const { x, y } of ellipseOutline(x0, y0, x1, y1)) {
    const key = `${x},${y}`;
    if (drawnPixels.has(key)) continue;
    drawnPixels.add(key);

    if (x >= 0 && x < width && y >= 0 && y < height) {
      const idx = (y * width + x) * 4;
      data[idx] = color;
      data[idx + 1] = color;
      data[idx + 2] = color;
      data[idx + 3] = 255;
    }
  }
}

// Set a single pixel
export function setPixel(
  imageData: ImageData,
  x: number,
  y: number,
  color: number
): void {
  const { width, height, data } = imageData;
  if (x >= 0 && x < width && y >= 0 && y < height) {
    const idx = (y * width + x) * 4;
    data[idx] = color;
    data[idx + 1] = color;
    data[idx + 2] = color;
    data[idx + 3] = 255;
  }
}

// Erase a 3x3 area
export function erase3x3(
  imageData: ImageData,
  cx: number,
  cy: number,
  bgColor: number
): void {
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      setPixel(imageData, cx + dx, cy + dy, bgColor);
    }
  }
}

// Erase an entire cell region
export function eraseCell(
  imageData: ImageData,
  cellX: number,
  cellY: number,
  tileWidth: number,
  tileHeight: number,
  bgColor: number
): void {
  const startX = cellX * tileWidth;
  const startY = cellY * tileHeight;

  for (let y = startY; y < startY + tileHeight; y++) {
    for (let x = startX; x < startX + tileWidth; x++) {
      setPixel(imageData, x, y, bgColor);
    }
  }
}

// Clone ImageData
export function cloneImageData(imageData: ImageData): ImageData {
  return new ImageData(
    new Uint8ClampedArray(imageData.data),
    imageData.width,
    imageData.height
  );
}

// Composite two ImageData (preview over base)
export function compositeImageData(
  base: ImageData,
  overlay: ImageData
): ImageData {
  const result = cloneImageData(base);
  const data = result.data;
  const overlayData = overlay.data;

  for (let i = 0; i < data.length; i += 4) {
    // Simple max composite for ink
    data[i] = Math.max(data[i]!, overlayData[i]!);
    data[i + 1] = Math.max(data[i + 1]!, overlayData[i + 1]!);
    data[i + 2] = Math.max(data[i + 2]!, overlayData[i + 2]!);
  }

  return result;
}
