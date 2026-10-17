import { AlertTriangle, CircleCheck, Info, OctagonAlert, FlaskConical } from "lucide-react";
import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/utils/cn";

export function Card({ className, ...props }: ComponentProps<"div">) {
  return <div className={cn("rounded-lg border border-line bg-paper-raised shadow-[var(--shadow-card)]", className)} {...props} />;
}

export function CardHeader({ title, description, action, className }: { title: ReactNode; description?: ReactNode; action?: ReactNode; className?: string }) {
  return (
    <div className={cn("flex items-start justify-between gap-4 border-b border-line px-5 py-4", className)}>
      <div className="min-w-0">
        <h2 className="text-lg font-semibold leading-tight text-ink">{title}</h2>
        {description && <p className="mt-1 text-sm text-muted">{description}</p>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}

const badgeTones = {
  neutral: "border-line bg-paper-sunken text-ink-soft",
  accent: "border-accent/20 bg-accent-soft text-accent",
  high: "border-high/20 bg-high-soft text-high",
  moderate: "border-moderate/20 bg-moderate-soft text-moderate",
  low: "border-low/20 bg-low-soft text-low",
  insufficient: "border-line bg-insufficient-soft text-insufficient",
  danger: "border-danger/20 bg-danger-soft text-danger",
  demo: "border-demo/20 bg-demo-soft text-demo",
} as const;

export type BadgeTone = keyof typeof badgeTones;

export function Badge({ tone = "neutral", className, ...props }: ComponentProps<"span"> & { tone?: BadgeTone }) {
  return (
    <span
      className={cn("inline-flex items-center gap-1 rounded-sm border px-1.5 py-0.5 text-[11.5px] font-medium leading-none tracking-wide", badgeTones[tone], className)}
      {...props}
    />
  );
}

const noticeTones = {
  info: { cls: "border-line bg-paper-sunken text-ink-soft", Icon: Info },
  success: { cls: "border-high/25 bg-high-soft text-ink", Icon: CircleCheck },
  warning: { cls: "border-moderate/25 bg-moderate-soft text-ink", Icon: AlertTriangle },
  danger: { cls: "border-danger/25 bg-danger-soft text-ink", Icon: OctagonAlert },
  demo: { cls: "border-demo/25 bg-demo-soft text-ink", Icon: FlaskConical },
} as const;

export function Notice({
  tone = "info",
  title,
  children,
  className,
  role,
}: {
  tone?: keyof typeof noticeTones;
  title?: ReactNode;
  children?: ReactNode;
  className?: string;
  role?: "alert" | "status";
}) {
  const { cls, Icon } = noticeTones[tone];
  return (
    <div role={role} className={cn("flex gap-3 rounded-md border px-4 py-3 text-sm", cls, className)}>
      <Icon className="mt-0.5 size-4 shrink-0" aria-hidden />
      <div className="min-w-0 space-y-1">
        {title && <p className="font-medium text-ink">{title}</p>}
        {children && <div className="text-ink-soft [&_a]:underline">{children}</div>}
      </div>
    </div>
  );
}

export function SectionHeading({ eyebrow, title, description, className }: { eyebrow?: string; title: ReactNode; description?: ReactNode; className?: string }) {
  return (
    <div className={cn("space-y-2", className)}>
      {eyebrow && <p className="text-xs font-medium uppercase tracking-[0.14em] text-muted">{eyebrow}</p>}
      <h2 className="text-2xl font-semibold leading-tight text-ink sm:text-[28px]">{title}</h2>
      {description && <p className="max-w-2xl text-[15px] text-muted">{description}</p>}
    </div>
  );
}

export function EmptyState({ title, children, action }: { title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="rounded-lg border border-dashed border-line-strong px-6 py-10 text-center">
      <p className="font-display text-lg text-ink">{title}</p>
      {children && <div className="mx-auto mt-2 max-w-md text-sm text-muted">{children}</div>}
      {action && <div className="mt-5 flex justify-center">{action}</div>}
    </div>
  );
}
