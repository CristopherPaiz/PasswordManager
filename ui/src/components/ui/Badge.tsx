import { HTMLAttributes, ReactNode } from "react";

type BadgeVariant = "primary" | "success" | "danger" | "warning" | "neutral";

const VARIANTS: Record<BadgeVariant, string> = {
  primary: "bg-primary-50 text-primary-600 dark:bg-primary-500/10 dark:text-primary-400",
  success: "bg-green-50 text-green-700 dark:bg-green-500/10 dark:text-green-400",
  danger: "bg-red-50 text-red-600 dark:bg-red-500/10 dark:text-red-400",
  warning: "bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-400",
  neutral: "bg-bg-base text-text-muted border border-border-base",
};

interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  variant?: BadgeVariant;
  children: ReactNode;
}

export const Badge = ({ variant = "neutral", className = "", children, ...props }: BadgeProps) => {
  return (
    <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold ${VARIANTS[variant]} ${className}`} {...props}>
      {children}
    </span>
  );
};
