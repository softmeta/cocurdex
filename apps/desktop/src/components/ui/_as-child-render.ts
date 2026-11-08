import * as React from "react";

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
