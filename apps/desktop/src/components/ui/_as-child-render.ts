import * as React from "react";

/**
 * Adapter that translates the Radix-style `asChild` prop into the Base UI
 * `render` prop at our wrapper boundary. Lets call sites keep their existing
 * `<Trigger asChild><Button/></Trigger>` JSX after migrating off Radix.
 *
 * If `asChild` is true and `children` is a single React element, that element
 * is forwarded as `render`; otherwise `children` flows through unchanged.
 *
 * Returns a loosely-typed prop bag — callers should spread the result into the
 * Base UI primitive directly. We avoid threading the primitive's exact prop
 * generics through here because each Base UI part has its own render-function
 * state type, which is impractical to enumerate at the wrapper layer.
 */
export function asChildToRender({
  asChild,
  children,
  render,
  ...rest
}: {
  asChild?: boolean;
  children?: React.ReactNode;
  render?: unknown;
  [key: string]: unknown;
}): Record<string, unknown> {
  if (
    asChild &&
    !render &&
    React.isValidElement<Record<string, unknown>>(children)
  ) {
    return { ...rest, render: children };
  }
  return { ...rest, ...(render ? { render } : {}), children };
}
