import type { ReactNode } from "react";
import { SectionLabel } from "@/components/ui/panel";

/** Title block for every page except the trade home. */
export function PageHeader({
  eyebrow,
  title,
  description,
  action,
}: {
  eyebrow: string;
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="animate-rise flex flex-col gap-4 border-b border-line pb-6 sm:flex-row sm:items-end sm:justify-between">
      <div className="max-w-2xl">
        <SectionLabel tone="lime">{eyebrow}</SectionLabel>
        <h1 className="font-display mt-2 text-4xl leading-[1.05] sm:text-5xl">{title}</h1>
        {description ? <p className="mt-3 text-sm leading-6 text-muted">{description}</p> : null}
      </div>
      {action ? <div className="flex shrink-0 flex-wrap gap-2">{action}</div> : null}
    </div>
  );
}
