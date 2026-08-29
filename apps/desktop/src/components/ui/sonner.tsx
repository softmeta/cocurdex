import {
  CircleCheckIcon,
  InfoIcon,
  Loader2Icon,
  OctagonXIcon,
  TriangleAlertIcon,
} from "lucide-react";
import type { CSSProperties } from "react";
import { Toaster as SonnerToaster, type ToasterProps } from "sonner";
import { useResolvedTheme } from "@/lib/react-hooks";

// App-wide toast layer. Follows the in-app resolved theme (data-theme on
// <html>) instead of the OS preference sonner would read on its own.
// Mirrors shadcn sonner (typed icons + tokenized surfaces) and enables
// richColors so success/error read as positive/negative feedback.
function Toaster(props: ToasterProps) {
  const resolvedTheme = useResolvedTheme();
  const theme: ToasterProps["theme"] =
    resolvedTheme === "light" ? "light" : "dark";

  return (
    <SonnerToaster
      className="toaster group"
      icons={{
        success: <CircleCheckIcon className="size-4" />,
        info: <InfoIcon className="size-4" />,
        warning: <TriangleAlertIcon className="size-4" />,
        error: <OctagonXIcon className="size-4" />,
        loading: <Loader2Icon className="size-4 animate-spin" />,
      }}
      position="bottom-right"
      richColors
      style={
        {
          "--normal-bg": "var(--popover)",
          "--normal-text": "var(--popover-foreground)",
          "--normal-border": "var(--border)",
          "--border-radius": "var(--radius)",
          // Map richColors success/error onto product status tokens so toasts
          // match the rest of the app instead of sonner's fixed HSL greens/reds.
          "--success-bg":
            "color-mix(in srgb, var(--status-success) 12%, var(--popover))",
          "--success-border":
            "color-mix(in srgb, var(--status-success) 28%, var(--border))",
          "--success-text": "var(--status-success)",
          "--error-bg":
            "color-mix(in srgb, var(--destructive) 12%, var(--popover))",
          "--error-border":
            "color-mix(in srgb, var(--destructive) 28%, var(--border))",
          "--error-text": "var(--destructive)",
        } as CSSProperties
      }
      theme={theme}
      toastOptions={{
        classNames: {
          toast: "cn-toast",
        },
      }}
      {...props}
    />
  );
}

export { Toaster };
