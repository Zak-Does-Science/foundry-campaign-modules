// MAUL Mall Explorer: client-side PIXI containers on the canvas.
// "Map" containers go in the primary canvas group (above the background map, below tiles/tokens), using the same
// elevation / sortLayer keys Foundry v12 sorts primary objects by. If that fails, they fall back to canvas.interface.

const made = new Set();

/**
 * A container drawn above the map art.
 * @param {string} name
 * @param {number} sortLayer  Primary sort layer: background ~0, tiles 500, tokens 700 (PrimaryCanvasGroup.SORT_LAYERS)
 */
export function mapContainer(name, sortLayer) {
  const c = new PIXI.Container();
  c.name = name;
  c.eventMode = "none";
  c.elevation = 0;
  c.sortLayer = sortLayer;
  c.sort = 0;
  c.zIndex = 0;
  try {
    const primary = canvas.primary;
    if ( !primary ) throw new Error("no primary group");
    primary.addChild(c);
    primary.sortDirty = true;
  } catch(err) {
    console.warn("maul-mall-explorer | primary canvas group unavailable; drawing overlays on the interface layer", err);
    canvas.interface.addChild(c);
  }
  made.add(c);
  return c;
}

/** A container above tokens (hints, markers, sparkles, tags). */
export function uiContainer(name) {
  const c = new PIXI.Container();
  c.name = name;
  c.eventMode = "none";
  canvas.interface.addChild(c);
  made.add(c);
  return c;
}

export function destroyContainer(c) {
  if ( !c ) return;
  made.delete(c);
  if ( !c.destroyed ) c.destroy({children: true});
}

/** Texture with nearest-neighbour scaling, or null if it can't be loaded. */
export async function pixelTexture(src) {
  try {
    const tex = await foundry.canvas.loadTexture(src, {fallback: null});
    if ( !tex?.baseTexture ) return null;
    tex.baseTexture.scaleMode = PIXI.SCALE_MODES.NEAREST;
    tex.baseTexture.update?.();
    return tex;
  } catch(err) {
    return null;
  }
}
