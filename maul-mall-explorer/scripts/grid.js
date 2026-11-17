// MAUL Mall Explorer: pure grid maths (no Foundry globals, so it can be unit-tested in node).

/** Props that hang overhead or sit on a wall: drawn, but never block movement. */
const OVERHEAD_PROPS = new Set(["crystal-chandelier", "crystal-string", "crystal-sconce", "banner", "balloon", "bunting", "neon-sign", "prayer-flags", "stained-glass", "tapestry", "spotlight"]);

/** Tile chars a token can stand on (SPEC legend). Every other char, including unknown ones, blocks. */
export const WALKABLE = new Set([".", ",", ":", "\"", "c", "+", "^", "v", "o"]);

/** Tile chars that block movement (SPEC legend), listed for reference / validation. */
export const BLOCKING = new Set([" ", "#", "w", "~", "T", "p", "r", "=", "S", "t", "b", "f", "k", "x", "D", "H", "E", "_"]);

/** Horizontal gap between floors, in tiles. */
export const FLOOR_GAP = 4;

export function isBlockingChar(ch) {
  return !WALKABLE.has(ch);
}

/**
 * Compute a scene layout the same way the renderer does: floors left to right in mall order,
 * FLOOR_GAP tiles between them, all top-aligned at row 0.
 * @param {object} mall     Mall JSON ({id, floors:[{id, grid}]})
 * @param {number} gridPx   Foundry grid size
 */
export function computeLayout(mall, gridPx = 64) {
  const floors = {};
  let ox = 0;
  let H = 0;
  for ( const f of mall.floors ?? [] ) {
    const grid = f.grid ?? [];
    const h = grid.length;
    const w = grid.reduce((m, row) => Math.max(m, row.length), 0);
    floors[f.id] = {ox, oy: 0, w, h};
    ox += w + FLOOR_GAP;
    H = Math.max(H, h);
  }
  const W = Math.max(1, ox - FLOOR_GAP);
  return {mall: mall.id, tilePx: 16, scale: gridPx / 16, gridPx, widthTiles: W, heightTiles: Math.max(1, H), floors, computed: true};
}

/**
 * Build a scene-wide blocking mask (1 = blocks, 0 = walkable). Cells outside every floor are void (blocking).
 * @returns {{mask: Uint8Array, W: number, H: number}}
 */
export function buildBlockMask(mall, layout) {
  const W = layout.widthTiles;
  const H = layout.heightTiles;
  const mask = new Uint8Array(W * H).fill(1);
  for ( const f of mall.floors ?? [] ) {
    const L = layout.floors?.[f.id];
    if ( !L ) continue;
    const grid = f.grid ?? [];
    for ( let y = 0; y < grid.length; y++ ) {
      const row = grid[y];
      const sy = L.oy + y;
      if ( sy < 0 || sy >= H ) continue;
      for ( let x = 0; x < row.length; x++ ) {
        const sx = L.ox + x;
        if ( sx < 0 || sx >= W ) continue;
        mask[sy * W + sx] = isBlockingChar(row[x]) ? 1 : 0;
      }
    }
  }
  // Decor props (mall JSON `props`) are solid furniture: their cells always block, whatever floor char is under them.
  // Overhead and wall-mounted pieces (chandeliers, light strings, sconces, banners, balloons) don't.
  for ( const p of mall.props ?? [] ) {
    if ( OVERHEAD_PROPS.has(String(p?.sprite ?? "").replace(/^obj:/, "")) ) continue;
    const L = layout.floors?.[p?.floor];
    if ( !L || !Number.isFinite(p.x) || !Number.isFinite(p.y) ) continue;
    const sx = L.ox + p.x;
    const sy = L.oy + p.y;
    if ( sx >= 0 && sy >= 0 && sx < W && sy < H ) mask[sy * W + sx] = 1;
  }
  return {mask, W, H};
}

/**
 * Turn a blocking mask into merged wall segments along cell edges.
 * An edge becomes wall wherever a blocking cell meets a walkable one (outside the scene counts as blocking).
 * Consecutive collinear edges are merged into one segment.
 * @returns {number[][]} segments in tile units: [x1, y1, x2, y2]
 */
export function mergeWalls(mask, W, H) {
  const blk = (x, y) => (x < 0 || y < 0 || x >= W || y >= H) ? 1 : mask[y * W + x];
  const segs = [];
  // Horizontal edges: the line at row boundary y separates cell (x, y-1) and (x, y)
  for ( let y = 0; y <= H; y++ ) {
    let start = -1;
    for ( let x = 0; x <= W; x++ ) {
      const edge = (x < W) && (blk(x, y - 1) !== blk(x, y));
      if ( edge && start < 0 ) start = x;
      else if ( !edge && start >= 0 ) {
        segs.push([start, y, x, y]);
        start = -1;
      }
    }
  }
  // Vertical edges: the line at column boundary x separates cell (x-1, y) and (x, y)
  for ( let x = 0; x <= W; x++ ) {
    let start = -1;
    for ( let y = 0; y <= H; y++ ) {
      const edge = (y < H) && (blk(x - 1, y) !== blk(x, y));
      if ( edge && start < 0 ) start = y;
      else if ( !edge && start >= 0 ) {
        segs.push([x, start, x, y]);
        start = -1;
      }
    }
  }
  return segs;
}

/** Floor-local tile -> scene tile. Returns null if the floor is unknown. */
export function toSceneTile(layout, floor, x, y) {
  const L = layout.floors?.[floor];
  if ( !L ) return null;
  return {x: L.ox + x, y: L.oy + y};
}

/** Chebyshev distance (diagonals count as 1). */
export function chebyshev(ax, ay, bx, by) {
  return Math.max(Math.abs(ax - bx), Math.abs(ay - by));
}

/** Which floor (id + floor-local tile) a scene tile is on, or null. */
export function floorAt(layout, sx, sy) {
  for ( const [id, L] of Object.entries(layout?.floors ?? {}) ) {
    if ( sx >= L.ox && sy >= L.oy && sx < L.ox + (L.w ?? 0) && sy < L.oy + (L.h ?? 0) ) return {floor: id, x: sx - L.ox, y: sy - L.oy};
  }
  return null;
}
