import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/components/ui/utils";

const badgeVariants = cva(
  "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-medium leading-5 tracking-wide",
  {
    variants: {
      variant: {
        neutral: "border-hairline bg-ink-900 text-ink-400",
        accent: "border-accent-line bg-accent-soft text-accent",
        ok: "border-hairline bg-ink-900 text-ok",
        danger: "border-hairline bg-ink-900 text-danger",
      },
    },
    defaultVariants: { variant: "neutral" },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

export function Badge({ className, variant, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}
