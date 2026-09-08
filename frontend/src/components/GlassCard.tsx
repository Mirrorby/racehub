import type { HTMLAttributes, ReactNode } from "react";
export function GlassCard({ children, className = "", ...props }: HTMLAttributes<HTMLDivElement> & { children: ReactNode }) {
  return <div className={`pp-glass ${className}`} {...props}>{children}</div>;
}
