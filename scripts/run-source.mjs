/**
 * Glyph's canonical run source.
 * @typedef {object} RunSource
 * @property {RegionDocument} region The Region the trigger fired on.
 * @property {Scene} scene The Scene containing that Region.
 * @property {object} event The triggering event.
 * @property {string} event.name The `CONST.REGION_EVENTS` name.
 * @property {object} event.data Event-specific payload.
 * @property {User} event.user The User that triggered the event.
 */

/**
 * Normalize a core RegionEvent into a RunSource.
 * @param {object} regionEvent A core RegionEvent.
 * @returns {RunSource} The normalized run source.
 */
export function normalizeRunSource({ name, data, region, user }) {
  return { region, scene: region.parent, event: { name, data, user } };
}
