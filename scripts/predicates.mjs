/**
 * Grid distance between two points, in scene distance units.
 * @param {Point} a The first point.
 * @param {Point} b The second point.
 * @returns {number} The measured distance.
 */
export function distanceTo(a, b) {
  return canvas.grid.measurePath([a, b]).distance;
}

/**
 * Whether `actor` has the given status effect.
 * @param {Actor} actor The actor to check.
 * @param {string} statusId The status id.
 * @returns {boolean}
 */
export function hasCondition(actor, statusId) {
  return actor?.statuses.has(statusId) ?? false;
}

/**
 * Whether a ray between two points is unobstructed by a sight-blocking wall.
 * @param {Point} a The origin point.
 * @param {Point} b The destination point.
 * @returns {boolean}
 */
export function canSee(a, b) {
  if (!a || !b) return false;
  return !CONFIG.Canvas.polygonBackends.sight.testCollision(a, b, { type: 'sight', mode: 'any' });
}
