export function isMenuRowSidecarEventTarget(target: EventTarget | null) {
  let element: Element | null = null;
  if (target instanceof Element) {
    element = target;
  } else if (target instanceof Node) {
    element = target.parentElement;
  }
  return Boolean(element?.closest("[data-menu-row-sidecar]"));
}
