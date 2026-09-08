import React from "react";
import { splitAuditLogHighlight } from "../lib/auditLogSearch";

export function AuditLogHighlight({ value, query, fallback = "-" }: { value: string | null | undefined; query: string; fallback?: string }) {
  const text = value || fallback;
  return <>{splitAuditLogHighlight(text, query).map((part, index) => part.matched ? <mark key={`${part.text}-${index}`} className="rounded bg-amber-200/80 px-0.5 text-foreground dark:bg-amber-400/30">{part.text}</mark> : <React.Fragment key={`${part.text}-${index}`}>{part.text}</React.Fragment>)}</>;
}
