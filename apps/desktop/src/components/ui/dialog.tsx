import { Dialog as DialogPrimitive } from "@base-ui/react/dialog";
import { XIcon } from "lucide-react";
import type * as React from "react";
import { useTranslation } from "react-i18next";
import { asChildToRender } from "@/components/ui/_as-child-render";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const dialogContentSizeClassName = {
  compact: "sm:max-w-sm",
  default: "sm:max-w-lg",
  palette: "sm:max-w-2xl",
  wide: "sm:max-w-4xl",
} as const;

function Dialog({
  children,
  ...props
}: Omit<React.ComponentProps<typeof DialogPrimitive.Root>, "children"> & {
  children?: React.ReactNode;
}) {
  return <DialogPrimitive.Root {...props}>{children}</DialogPrimitive.Root>;
}

type DialogTriggerProps = React.ComponentProps<
  typeof DialogPrimitive.Trigger
> & {
  asChild?: boolean;
};

function DialogTrigger({ asChild, children, ...props }: DialogTriggerProps) {
  return (
    <DialogPrimitive.Trigger
      data-slot="dialog-trigger"
      // biome-ignore lint/suspicious/noExplicitAny: asChildToRender returns a generic prop bag; each Base UI Trigger has its own state-typed render fn that we don't enumerate here.
      {...(asChildToRender({ asChild, children, ...props }) as any)}
    />
  );
}

function DialogPortal({
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Portal>) {
  return <DialogPrimitive.Portal data-slot="dialog-portal" {...props} />;
}

type DialogCloseProps = React.ComponentProps<typeof DialogPrimitive.Close> & {
  asChild?: boolean;
};

function DialogClose({ asChild, children, ...props }: DialogCloseProps) {
  return (
    <DialogPrimitive.Close
      data-slot="dialog-close"
      // biome-ignore lint/suspicious/noExplicitAny: asChildToRender returns a generic prop bag; each Base UI Trigger has its own state-typed render fn that we don't enumerate here.
      {...(asChildToRender({ asChild, children, ...props }) as any)}
    />
  );
}

function DialogOverlay({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Backdrop>) {
  return (
    <DialogPrimitive.Backdrop
      data-slot="dialog-overlay"
      className={cn(
        "fixed inset-0 isolate z-50 bg-black/10 duration-100 supports-backdrop-filter:backdrop-blur-xs data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0",
        className,
      )}
      {...props}
    />
  );
}

function DialogContent({
  className,
  children,
  size = "default",
  showCloseButton = true,
  ...props
}: Omit<React.ComponentProps<typeof DialogPrimitive.Popup>, "children"> & {
  children?: React.ReactNode;
  size?: keyof typeof dialogContentSizeClassName;
  showCloseButton?: boolean;
}) {
  const { t } = useTranslation("common");
  return (
    <DialogPortal>
      <DialogOverlay />
      <DialogPrimitive.Popup
        data-slot="dialog-content"
        className={cn(
          "fixed top-1/2 start-1/2 z-50 grid w-full max-w-[calc(100%-2rem)] -translate-x-1/2 rtl:translate-x-1/2 -translate-y-1/2 gap-4 rounded-xl bg-popover p-4 text-sm text-popover-foreground ring-1 ring-foreground/10 duration-100 outline-none data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95",
          dialogContentSizeClassName[size],
          className,
        )}
        {...props}
      >
        {children}
        {showCloseButton && (
          <DialogClose asChild>
            <Button
              variant="ghost"
              className="absolute top-2 end-2"
              size="icon-sm"
            >
              <XIcon />
              <span className="sr-only">{t("actions.close")}</span>
            </Button>
          </DialogClose>
        )}
      </DialogPrimitive.Popup>
    </DialogPortal>
  );
}

function DialogHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="dialog-header"
      className={cn("flex flex-col gap-2", className)}
      {...props}
    />
  );
}

function DialogFooter({
  className,
  showCloseButton = false,
  children,
  ...props
}: React.ComponentProps<"div"> & {
  showCloseButton?: boolean;
}) {
  const { t } = useTranslation("common");
  return (
    <div
      data-slot="dialog-footer"
      className={cn(
        "-mx-4 -mb-4 flex flex-col-reverse gap-2 rounded-b-xl border-t bg-muted/50 p-4 sm:flex-row sm:justify-end",
        className,
      )}
      {...props}
    >
      {children}
      {showCloseButton && (
        <DialogClose asChild>
          <Button variant="outline">{t("actions.close")}</Button>
        </DialogClose>
      )}
    </div>
  );
}

function DialogTitle({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Title>) {
  return (
    <DialogPrimitive.Title
      data-slot="dialog-title"
      className={cn(
        "font-heading text-base leading-none font-medium",
        className,
      )}
      {...props}
    />
  );
}

function DialogDescription({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Description>) {
  return (
    <DialogPrimitive.Description
      data-slot="dialog-description"
      className={cn(
        "text-sm text-muted-foreground *:[a]:underline *:[a]:underline-offset-3 *:[a]:hover:text-foreground",
        className,
      )}
      {...props}
    />
  );
}

export {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogOverlay,
  DialogPortal,
  DialogTitle,
  DialogTrigger,
};
