/** @type {Map<string, string[]>} Wildcard patterns already expanded. */
const wildcardCache = new Map();

/**
 * Expand any "*" wildcard entries in a list of file paths.
 * @param {string[]} paths The configured paths.
 * @returns {Promise<string[]>} The concrete file paths.
 */
export async function expandWildcardPaths(paths) {
  if (!paths.some((path) => path.includes('*'))) return paths;
  const expanded = [];
  for (const path of paths) {
    if (!path.includes('*')) {
      expanded.push(path);
      continue;
    }
    if (!wildcardCache.has(path)) {
      const source = CONFIG.ux.FilePicker.matchS3URL(path) ? 's3' : 'data';
      const result = await CONFIG.ux.FilePicker.browse(source, path, { wildcard: true }).catch(() => null);
      wildcardCache.set(path, result?.files ?? []);
    }
    expanded.push(...wildcardCache.get(path));
  }
  return expanded;
}
