/** @type {string} Handle name prefix for a polygon vertex, followed by its x index in `points`. */
const VERTEX = 'vertex.';

/** @type {string} Handle name prefix for an edge midpoint, followed by the x index the new vertex takes. */
const INSERT = 'insert.';

/** @type {WeakSet<object>} Drag shapes that already received the vertex their insert handle adds. */
const inserted = new WeakSet();

/**
 * Vertex and edge-midpoint handles for a Region polygon.
 * @param {number[]} points The polygon's flat point list.
 * @returns {object} Control handle descriptors keyed by handle name.
 */
function vertexHandles(points) {
  const handles = {};
  for (let i = 0; i < points.length; i += 2) handles[`${VERTEX}${i}`] = { position: { x: points[i], y: points[i + 1] }, rotation: 0, visible: true };
  for (let i = 0; i < points.length; i += 2) {
    const next = (i + 2) % points.length;
    const position = { x: (points[i] + points[next]) / 2, y: (points[i + 1] + points[next + 1]) / 2 };
    handles[`${INSERT}${i + 2}`] = { position, rotation: 0, visible: true };
  }
  return handles;
}

/** Let the GM drag each vertex of a polygon Region shape, drag an edge midpoint to add one, and right-click a vertex to remove it. */
export function registerRegionVertexHandles() {
  const { PolygonShapeData } = foundry.data;
  const { ShapeControlsHandle } = foundry.canvas.containers;

  Hooks.on('updateRegion', (region, changed) => {
    if ('shapes' in changed) region.object?._redrawShapeControls();
  });

  const createControlHandles = PolygonShapeData.prototype._createControlHandles;
  PolygonShapeData.prototype._createControlHandles = function () {
    const handles = createControlHandles.call(this);
    if (!(this.parent instanceof RegionDocument)) return handles;
    return { ...vertexHandles(this.points), ...handles };
  };

  const moveControlHandle = PolygonShapeData.prototype.moveControlHandle;
  PolygonShapeData.prototype.moveControlHandle = function (name, destination, options = {}) {
    const isInsert = name.startsWith(INSERT);
    if (!isInsert && !name.startsWith(VERTEX)) return moveControlHandle.call(this, name, destination, options);
    const index = Number(name.slice(name.indexOf('.') + 1));
    const point = options.snap ? this._getSnappedPoint(destination) : destination;
    const points = this.points.slice();
    if (isInsert && !inserted.has(this)) {
      points.splice(index, 0, point.x, point.y);
      inserted.add(this);
    }
    points[index] = point.x;
    points[index + 1] = point.y;
    this.updateSource({ points });
  };

  const drawHandle = ShapeControlsHandle.prototype.draw;
  ShapeControlsHandle.prototype.draw = async function (style) {
    const isVertex = this.name.startsWith(VERTEX);
    if (!isVertex && !this.name.startsWith(INSERT)) return drawHandle.call(this, style);
    const radius = (style.size + style.outlineThickness) / 2;
    this.clear();
    this.beginFill(0xffffff, isVertex ? 1 : 0.5);
    this.lineStyle(style.outlineThickness, 0x000000);
    this.drawCircle(0, 0, isVertex ? radius * 0.75 : radius * 0.5);
    this.endFill();
    if (isVertex && !this.listeners('rightdown').includes(deleteVertex)) this.on('rightdown', deleteVertex);
  };
}

/**
 * Remove the right-clicked vertex from its Region polygon, keeping at least a triangle.
 * @this {foundry.canvas.containers.ShapeControlsHandle}
 * @param {PIXI.FederatedEvent} event The pointer event.
 */
function deleteVertex(event) {
  event.stopPropagation();
  const { shape, document } = this.controls;
  if (!this.controls.editable) return;
  if (shape.points.length <= 6) return ui.notifications.warn('GLYPH.NOTIFICATIONS.RegionVertexMinimum', { localize: true });
  const shapes = document.toObject().shapes;
  shapes[shape._index].points.splice(Number(this.name.slice(VERTEX.length)), 2);
  document.update({ shapes });
}
