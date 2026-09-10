/** Trace a Tile's image into Region polygon shapes, off core's cached texture alpha map (loader.mjs:105). */

/** @type {number} Contour samples below this length are dropped as noise. */
const MIN_CONTOUR_POINTS = 8;

/** @type {number} Douglas-Peucker tolerance, in downscaled texture pixels. */
const SIMPLIFY_TOLERANCE = 1.5;

/** @type {number} Alpha map resolution, as a fraction of the texture's own size. */
const TRACE_RESOLUTION = 0.25;

/** @type {number} Shapes past this vertex count are discarded in favour of the bounding rectangle. */
const MAX_POINTS = 400;

/** @type {Record<number, [string, string][]>} Marching-squares case -> directed midpoint edges, inside on the left. */
const CASES = {
  1: [['L', 'B']],
  2: [['B', 'R']],
  3: [['L', 'R']],
  4: [['R', 'T']],
  5: [
    ['L', 'T'],
    ['R', 'B']
  ],
  6: [['B', 'T']],
  7: [['L', 'T']],
  8: [['T', 'L']],
  9: [['T', 'B']],
  10: [
    ['T', 'L'],
    ['B', 'R']
  ],
  11: [['T', 'R']],
  12: [['R', 'L']],
  13: [['R', 'B']],
  14: [['B', 'L']]
};

/**
 * The midpoint of one edge of cell `(i, j)`, in sample-grid coordinates.
 * @param {number} i The cell's column.
 * @param {number} j The cell's row.
 * @param {string} edge One of "T", "R", "B", "L".
 * @returns {{x: number, y: number}}
 */
function midpoint(i, j, edge) {
  if (edge === 'T') return { x: i + 0.5, y: j };
  if (edge === 'R') return { x: i + 1, y: j + 0.5 };
  if (edge === 'B') return { x: i + 0.5, y: j + 1 };
  return { x: i, y: j + 0.5 };
}

/**
 * Walk the alpha map with marching squares, chaining every closed contour it finds.
 * @param {(x: number, y: number) => boolean} filled Whether the sample at `(x, y)` is opaque.
 * @param {number} width The sample grid's width.
 * @param {number} height The sample grid's height.
 * @returns {{x: number, y: number}[][]} Closed contours, in sample-grid coordinates.
 */
function traceContours(filled, width, height) {
  const edges = new Map();
  const key = (p) => `${p.x},${p.y}`;
  for (let j = -1; j < height; j++) {
    for (let i = -1; i < width; i++) {
      const code = (filled(i, j) ? 8 : 0) + (filled(i + 1, j) ? 4 : 0) + (filled(i + 1, j + 1) ? 2 : 0) + (filled(i, j + 1) ? 1 : 0);
      for (const [from, to] of CASES[code] ?? []) edges.set(key(midpoint(i, j, from)), midpoint(i, j, to));
    }
  }
  const contours = [];
  while (edges.size) {
    const [startKey] = edges.keys();
    const contour = [];
    let current = startKey;
    while (edges.has(current)) {
      const next = edges.get(current);
      edges.delete(current);
      contour.push(next);
      current = key(next);
    }
    if (contour.length >= MIN_CONTOUR_POINTS) contours.push(contour);
  }
  return contours;
}

/**
 * The perpendicular distance from `p` to the line through `a` and `b`.
 * @param {{x: number, y: number}} p The point.
 * @param {{x: number, y: number}} a The line's start.
 * @param {{x: number, y: number}} b The line's end.
 * @returns {number}
 */
function perpendicular(p, a, b) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const length = Math.hypot(dx, dy);
  return length === 0 ? Math.hypot(p.x - a.x, p.y - a.y) : Math.abs(dy * p.x - dx * p.y + b.x * a.y - b.y * a.x) / length;
}

/**
 * Reduce a contour to its significant vertices.
 * @param {{x: number, y: number}[]} points The contour.
 * @param {number} tolerance The maximum deviation to discard.
 * @returns {{x: number, y: number}[]}
 */
function simplify(points, tolerance) {
  if (points.length < 3) return points;
  let worst = 0;
  let index = 0;
  for (let i = 1; i < points.length - 1; i++) {
    const distance = perpendicular(points[i], points[0], points.at(-1));
    if (distance > worst) {
      worst = distance;
      index = i;
    }
  }
  if (worst <= tolerance) return [points[0], points.at(-1)];
  const left = simplify(points.slice(0, index + 1), tolerance);
  const right = simplify(points.slice(index), tolerance);
  return [...left.slice(0, -1), ...right];
}

/**
 * Twice the signed area of a closed contour: positive for an outline, negative for a hole.
 * @param {{x: number, y: number}[]} points The contour.
 * @returns {number}
 */
function signedArea(points) {
  let total = 0;
  for (let i = 0; i < points.length; i++) {
    const a = points[i];
    const b = points[(i + 1) % points.length];
    total += a.x * b.y - b.x * a.y;
  }
  return total;
}

/**
 * Whether a Tile's texture is unscaled, unoffset, and stretched to its frame, so a trace lines up.
 * @param {TileDocument} tile The Tile.
 * @returns {boolean}
 */
function tracesCleanly(tile) {
  const { scaleX, scaleY, offsetX, offsetY, fit } = tile.texture;
  return scaleX === 1 && scaleY === 1 && !offsetX && !offsetY && fit === 'fill';
}

/**
 * Trace a Tile's opaque pixels into Region polygon shapes.
 * @param {TileDocument} tile The Tile to trace.
 * @returns {object[]|null} Polygon `RegionShape` data, or null when the Tile can't be traced.
 */
export function alphaShapesFromTile(tile) {
  if (!tile.texture?.src || !tracesCleanly(tile)) return null;
  const texture = tile.object?.mesh?.texture ?? foundry.canvas.getTexture(tile.texture.src);
  const alpha = foundry.canvas.TextureLoader.getTextureAlphaData(texture, TRACE_RESOLUTION);
  if (!alpha?.data.length) return null;

  const threshold = Math.max(1, Math.round((tile.texture.alphaThreshold ?? 0.75) * 255));
  const mapWidth = alpha.maxX - alpha.minX;
  const mapHeight = alpha.maxY - alpha.minY;
  const filled = (x, y) => x >= 0 && y >= 0 && x < mapWidth && y < mapHeight && alpha.data[y * mapWidth + x] >= threshold;

  const contours = traceContours(filled, mapWidth, mapHeight).map((contour) => simplify(contour, SIMPLIFY_TOLERANCE));
  if (!contours.length || contours.reduce((sum, c) => sum + c.length, 0) > MAX_POINTS) return null;

  const scaleX = tile.width / alpha.width;
  const scaleY = tile.height / alpha.height;
  const cos = Math.cos(Math.toRadians(tile.rotation));
  const sin = Math.sin(Math.toRadians(tile.rotation));
  const pivotX = tile.x + tile.width * tile.texture.anchorX;
  const pivotY = tile.y + tile.height * tile.texture.anchorY;

  return contours.map((contour) => {
    const points = [];
    for (const point of contour) {
      const localX = tile.x + (alpha.minX + point.x) * scaleX - pivotX;
      const localY = tile.y + (alpha.minY + point.y) * scaleY - pivotY;
      points.push(pivotX + localX * cos - localY * sin, pivotY + localX * sin + localY * cos);
    }
    return { type: 'polygon', points, hole: signedArea(contour) < 0 };
  });
}
