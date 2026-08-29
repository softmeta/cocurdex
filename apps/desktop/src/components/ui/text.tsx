import { cva, type VariantProps } from "class-variance-authority";
import type * as React from "react";

import { cn } from "@/lib";

/*
 * Typography primitive.
 *
 * Use this for semantic body / label / heading text instead of authoring
 * ad-hoc font-size + color combinations. The `size` variant maps to the
 * project's named text scale defined in theme-tailwind.css. The `tone`
 * variant covers the most common foreground tokens.
 *
 *   <Text size="meta" tone="muted">Last edited 5m ago</Text>
 *   <Text size="title" weight="semibold" as="h2">Settings</Text>
 *
 * Reach for raw className only when a one-off color or layout truly does not
 * fit the scale — keep those rare so the typography stays coherent.
 */
const textVariants = cva("", {
  variants: {
    size: {
      "2xs": "text-2xs",
      meta: "text-meta",
      xs: "text-xs",
      body: "text-body",
      sm: "text-sm",
      display: "text-display",
      base: "text-base",
      lg: "text-lg",
      title: "text-title",
    },
    weight: {
      normal: "font-normal",
      medium: "font-medium",
      semibold: "font-semibold",
      bold: "font-bold",
    },
    tone: {
      default: "",
      muted: "text-muted-foreground",
      subtle: "text-foreground/70",
      destructive: "text-destructive",
      success: "text-status-success",
      primary: "text-foreground",
    },
    truncate: {
      true: "truncate",
      false: "",
    },
  },
  defaultVariants: {
    size: "body",
    weight: "normal",
    tone: "default",
    truncate: false,
  },
});

type TextOwnProps = VariantProps<typeof textVariants> & {
  className?: string;
  children?: React.ReactNode;
};

type TextProps<E extends React.ElementType = "span"> = TextOwnProps & {
  as?: E;
} & Omit<React.ComponentPropsWithoutRef<E>, keyof TextOwnProps | "as">;

export function Text<E extends React.ElementType = "span">({
  as,
  size,
  weight,
  tone,
  truncate,
  className,
  ...props
}: TextProps<E>) {
  const Component = (as ?? "span") as React.ElementType;
  return (
    <Component
      className={cn(textVariants({ size, weight, tone, truncate }), className)}
      {...props}
    />
  );
}

export { textVariants };
