import React, { useMemo, useState } from "react";
import { Clock3, SlidersHorizontal } from "lucide-react";
import { getVirtualRange } from "../lib/virtualListUtils";
import { AuditLogHighlight } from "./AuditLogHighlight";

export type AdminAuditLogRow = {
  id: number;
  userId: number;
  userName: string | null;
  userEmail: string | null;
  userRole: "admin" | "lender" | "borrower";
  action: string;
  changedFields: string;
  createdAt: Date | string;
};

const actionLabels: Record<string, string> = {
  read: "เปิดดูการตั้งค่า",
  updated: "แก้ไขการตั้งค่า",
  reset: "รีเซ็ตการตั้งค่า",
  line_connected: "เชื่อมต่อ LINE Notify",
  line_disconnected: "ยกเลิก LINE Notify",
};

const roleLabels: Record<AdminAuditLogRow["userRole"], string> = { admin: "ผู้ดูแลระบบ", lender: "ผู้ให้กู้", borrower: "ผู้กู้" };
const ROW_HEIGHT = 94;
const VIEWPORT_HEIGHT = 520;

export function AdminAuditVirtualList({ rows, onSelect, highlightQuery = "" }: { rows: AdminAuditLogRow[]; onSelect?: (row: AdminAuditLogRow) => void; highlightQuery?: string }) {
  const [scrollTop, setScrollTop] = useState(0);
  const range = useMemo(() => getVirtualRange({ scrollTop, rowHeight: ROW_HEIGHT, viewportHeight: VIEWPORT_HEIGHT, itemCount: rows.length }), [scrollTop, rows.length]);
  const visibleRows = rows.slice(range.start, range.end);

  if (!rows.length) {
    return <div className="flex min-h-48 flex-col items-center justify-center rounded-xl border border-dashed border-border/80 p-8 text-center"><SlidersHorizontal className="h-8 w-8 text-muted-foreground/60" /><p className="mt-3 font-medium">ไม่พบ Audit Log ที่ตรงกับตัวกรอง</p><p className="mt-1 text-sm text-muted-foreground">ลองเปลี่ยนช่วงวันที่หรือประเภทการกระทำ</p></div>;
  }

  return <div className="overflow-hidden rounded-xl border border-border/70"><div className="flex items-center justify-between border-b border-border/70 bg-muted/30 px-4 py-3 text-xs text-muted-foreground"><span>แสดงแบบ virtualized เพื่อรองรับข้อมูลจำนวนมาก</span><span>{rows.length.toLocaleString("th-TH")} รายการ</span></div><div className="overflow-y-auto" style={{ height: VIEWPORT_HEIGHT }} onScroll={(event) => setScrollTop(event.currentTarget.scrollTop)} role="region" aria-label="รายการ Audit Logs" tabIndex={0}><div style={{ height: range.totalHeight, position: "relative" }}><ol className="absolute inset-x-0" style={{ transform: `translateY(${range.offsetTop}px)` }}>{visibleRows.map((row) => <li key={row.id} className="border-b border-border/60"><button type="button" className="flex min-h-[94px] w-full gap-3 px-4 py-3 text-left transition-colors hover:bg-primary/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary disabled:cursor-default" onClick={() => onSelect?.(row)} disabled={!onSelect} aria-label={`ดูรายละเอียด ${actionLabels[row.action] || row.action} ของ ${row.userName || "ผู้ใช้"}`}><Clock3 className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" /><div className="min-w-0 flex-1"><div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between"><p className="font-medium">{actionLabels[row.action] || row.action}</p><time className="text-xs text-muted-foreground">{new Date(row.createdAt).toLocaleString("th-TH")}</time></div><p className="mt-1 text-sm text-muted-foreground"><span className="font-medium text-foreground"><AuditLogHighlight value={row.userName} query={highlightQuery} fallback="ไม่ระบุชื่อ" /></span>{row.userEmail ? <> · <AuditLogHighlight value={row.userEmail} query={highlightQuery} /></> : ""} <span className="ml-1 rounded-full bg-primary/10 px-2 py-0.5 text-xs text-primary">{roleLabels[row.userRole]}</span></p><p className="mt-1 break-words text-xs text-muted-foreground">{row.changedFields ? `ฟิลด์: ${row.changedFields.split(",").join(", ")}` : "ไม่มีการบันทึกค่าลับ"}</p></div></button></li>)}</ol></div></div></div>;
}
