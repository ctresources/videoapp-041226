import { cn } from "@/lib/utils/cn";
import { HTMLAttributes } from "react";

type BadgeVariant = "default" | "success" | "warning" | "error" | "info" | "purple";

interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  variant?: BadgeVariant;
}

export function Badge({ variant = "default", className, children, ...props }: BadgeProps) {
  // Neutral and brand variants move onto the warm palette. Success, warning and
  // error stay recognisably semantic — a green or red badge carries meaning a
  // reader already knows how to read, and repainting those in brand colours
  // would cost more than the consistency gains.
  const variants: Record<BadgeVariant, string> = {
    default: "bg-spark-rule-soft text-spark-ink-muted",
    success: "bg-emerald-50 text-emerald-700",
    warning: "bg-amber-50 text-amber-700",
    error: "bg-red-50 text-red-600",
    info: "bg-spark-blue/10 text-spark-blue",
    purple: "bg-spark-amber-tint text-spark-amber",
  };

  return (
    <span
      className={cn(
        "inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium",
        variants[variant],
        className
      )}
      {...props}
    >
      {children}
    </span>
  );
}
