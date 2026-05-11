"use client";

import * as React from "react";

import { Loader2 } from "lucide-react";
import { cn } from "@/lib/cn";

type AsyncButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  loading?: boolean;
  variant?: "primary" | "outline" | "green" | "danger";
  size?: "sm" | "md";
};

export function AsyncButton({
  loading = false,
  variant = "primary",
  size = "md",
  className,
  disabled,
  children,
  ...props
}: AsyncButtonProps) {
  return (
    <button
      className={cn(
        "btn",
        variant === "primary" && "btn-primary",
        variant === "outline" && "btn-outline",
        variant === "green" && "btn-green",
        variant === "danger" && "btn-red-outline",
        size === "sm" && "btn-sm",
        className,
      )}
      disabled={disabled || loading}
      {...props}
    >
      {loading ? <Loader2 size={14} className="spin" /> : null}
      {children}
    </button>
  );
}
