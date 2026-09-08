import React from "react";
import { SlidersHorizontal, X } from "lucide-react";
import { Button } from "@/components/ui/button";

const actionLabels: Record<string, string> = { read: "เปิดดูการตั้งค่า", updated: "แก้ไขการตั้งค่า", reset: "รีเซ็ตการตั้งค่า", line_connected: "เชื่อมต่อ LINE Notify", line_disconnected: "ยกเลิก LINE Notify" };

type Props = {
  startDate: string; endDate: string; action: string; search: string; sortBy: "createdAt" | "action"; sortDirection: "asc" | "desc";
  onClearDate: () => void; onClearAction: () => void; onClearSearch: () => void; onResetSort: () => void; onClearAll: () => void;
};

export function AuditLogFilterChips({ startDate, endDate, action, search, sortBy, sortDirection, onClearDate, onClearAction, onClearSearch, onResetSort, onClearAll }: Props) {
  const chips = [
    startDate || endDate ? { id: "date", label: `วันที่: ${startDate || "เริ่มต้น"} – ${endDate || "ปัจจุบัน"}`, remove: onClearDate } : null,
    action ? { id: "action", label: `ประเภท: ${actionLabels[action] || action}`, remove: onClearAction } : null,
    search.trim() ? { id: "search", label: `ค้นหา: ${search.trim()}`, remove: onClearSearch } : null,
    sortBy !== "createdAt" || sortDirection !== "desc" ? { id: "sort", label: `เรียง: ${sortBy === "action" ? "ประเภท" : "วันที่"} ${sortDirection === "asc" ? "น้อยไปมาก" : "มากไปน้อย"}`, remove: onResetSort } : null,
  ].filter(Boolean) as Array<{ id: string; label: string; remove: () => void }>;
  if (!chips.length) return null;
  return <div className="flex flex-wrap items-center gap-2" aria-label="ตัวกรองที่กำลังใช้งาน"><span className="inline-flex items-center gap-1 text-sm font-medium text-muted-foreground"><SlidersHorizontal className="h-4 w-4" />ตัวกรองที่ใช้งาน</span>{chips.map((chip) => <span key={chip.id} className="inline-flex max-w-full items-center gap-1 rounded-full border border-primary/20 bg-primary/5 py-1 pl-3 pr-1 text-sm text-primary"><span className="truncate">{chip.label}</span><Button type="button" variant="ghost" size="icon" className="h-6 w-6 rounded-full" aria-label={`ลบตัวกรอง ${chip.label}`} onClick={chip.remove}><X className="h-3.5 w-3.5" /></Button></span>)}<Button type="button" variant="link" size="sm" className="h-8 px-1" onClick={onClearAll}>ล้างทั้งหมด</Button></div>;
}
