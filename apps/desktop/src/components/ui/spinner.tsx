import { Loader2Icon } from "lucide-react";
import { cn } from "@/lib/utils";

const spinnerSizeClassName = {
  xs: "size-3",
  sm: "size-3.5",
  md: "size-4",
  lg: "size-5",
} as const;

type SpinnerProps = Omit<React.ComponentProps<"svg">, "size"> & {
  size?: keyof typeof spinnerSizeClassName;
};

function Spinner({ className, size = "md", ...props }: SpinnerProps) {
  return (
    <Loader2Icon
      role="status"
      aria-label="Loading"
      className={cn("animate-spin", spinnerSizeClassName[size], className)}
      {...props}
    />
  );
}

export { Spinner };
