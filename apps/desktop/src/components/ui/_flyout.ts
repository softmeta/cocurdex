export const FLYOUT_GAP = 4;

const FLYOUT_SURFACE_SELECTOR =
  '[data-slot$="-content"], [data-slot="command"]';

export interface FlyoutAnchor {
  contextElement: Element;
  getBoundingClientRect(): DOMRect;
}

export function flyoutAnchor(row: Element): FlyoutAnchor {
  return {
    contextElement: row,
    getBoundingClientRect() {
      const rowRect = row.getBoundingClientRect();
      const surface = row.closest(FLYOUT_SURFACE_SELECTOR);
      const edges = surface?.getBoundingClientRect() ?? rowRect;
      return new DOMRect(edges.left, rowRect.top, edges.width, rowRect.height);
    },
  };
}
