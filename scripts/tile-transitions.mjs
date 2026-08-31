/**
 * Apply a tile image swap, optionally animated via core's own `CanvasAnimation` on the tile's real PIXI mesh.
 * @param {TileDocument} tile The tile whose image is changing.
 * @param {string} src The new image path.
 * @param {string} transition One of "none"/"fade"/"slide-<direction>"/"bump-<direction>".
 * @param {number} duration Total transition time in milliseconds.
 * @returns {Promise<void>}
 */
export async function applyTileTransition(tile, src, transition, duration) {
  const mesh = tile.object?.mesh;
  if (transition === 'none' || !mesh) {
    await tile.update({ 'texture.src': src });
    return;
  }
  const half = Math.max(duration, 50) / 2;
  if (transition === 'fade') {
    await foundry.canvas.animation.CanvasAnimation.animate([{ parent: mesh, attribute: 'alpha', to: 0 }], { duration: half });
    await tile.update({ 'texture.src': src });
    const entering = tile.object?.mesh;
    if (entering) {
      entering.alpha = 0;
      await foundry.canvas.animation.CanvasAnimation.animate([{ parent: entering, attribute: 'alpha', from: 0, to: 1 }], { duration: half });
    }
    return;
  }
  const isSlide = transition.startsWith('slide');
  const isBump = transition.startsWith('bump');
  if (!isSlide && !isBump) {
    await tile.update({ 'texture.src': src });
    return;
  }
  let direction = transition.split('-')[1];
  if (direction === 'random') direction = ['left', 'up', 'right', 'down'][Math.floor(Math.random() * 4)];
  const distance = isSlide ? Math.max(tile.width, tile.height) : Math.min(tile.width, tile.height) * 0.15;
  const dx = direction === 'left' ? -distance : direction === 'right' ? distance : 0;
  const dy = direction === 'up' ? -distance : direction === 'down' ? distance : 0;
  const baseX = mesh.position.x;
  const baseY = mesh.position.y;
  await foundry.canvas.animation.CanvasAnimation.animate(
    [
      { parent: mesh.position, attribute: 'x', to: baseX + dx },
      { parent: mesh.position, attribute: 'y', to: baseY + dy }
    ],
    { duration: half }
  );
  await tile.update({ 'texture.src': src });
  const entering = tile.object?.mesh;
  if (entering) {
    entering.position.set(isSlide ? baseX - dx : baseX + dx, isSlide ? baseY - dy : baseY + dy);
    await foundry.canvas.animation.CanvasAnimation.animate(
      [
        { parent: entering.position, attribute: 'x', to: baseX },
        { parent: entering.position, attribute: 'y', to: baseY }
      ],
      { duration: half }
    );
  }
}
