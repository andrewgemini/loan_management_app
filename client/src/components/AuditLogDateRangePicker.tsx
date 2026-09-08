import React, { useMemo } from "react";
import type { DateRange } from "react-day-picker";
import { CalendarDays, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { getAuditLogDatePresetRange, type AuditLogDatePreset } from "@/lib/auditLogDatePresets";

function parseDate(value: string) { return value ? new Date(`${value}T12:00:00`) : undefined; }
function toDateInput(value: Date | undefined) { return value ? `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}` : ""; }
function formatDate(value: Date | undefined) { return value ? value.toLocaleDateString("th-TH", { year: "numeric", month: "short", day: "numeric" }) : ""; }
const presets: Array<{ value: AuditLogDatePreset; label: string }> = [{ value: "today", label: "วันนี้" }, { value: "thisWeek", label: "สัปดาห์นี้" }, { value: "thisMonth", label: "เดือนนี้" }];

export function AuditLogDateRangePicker({ startDate, endDate, onRangeChange }: { startDate: string; endDate: string; onRangeChange: (range: { startDate: string; endDate: string }) => void }) {
  const selected = useMemo<DateRange | undefined>(() => ({ from: parseDate(startDate), to: parseDate(endDate) }), [startDate, endDate]);
  const label = startDate ? endDate ? `${formatDate(selected?.from)} – ${formatDate(selected?.to)}` : `${formatDate(selected?.from)} – เลือกวันสิ้นสุด` : "เลือกช่วงวันที่";
  return <div className="space-y-2"><span className="text-sm font-medium">ช่วงวันที่</span><div className="flex gap-2"><Popover><PopoverTrigger asChild><Button type="button" variant="outline" className="h-10 flex-1 justify-start gap-2 truncate font-normal"><CalendarDays className="h-4 w-4 shrink-0 text-primary" /><span className="truncate">{label}</span></Button></PopoverTrigger><PopoverContent className="w-auto p-0" align="start"><Calendar mode="range" selected={selected} onSelect={(range) => onRangeChange({ startDate: toDateInput(range?.from), endDate: toDateInput(range?.to) })} numberOfMonths={1} initialFocus /></PopoverContent></Popover>{startDate && <Button type="button" variant="ghost" size="icon" aria-label="ล้างช่วงวันที่" onClick={() => onRangeChange({ startDate: "", endDate: "" })}><X className="h-4 w-4" /></Button>}</div><div className="flex flex-wrap gap-1.5" aria-label="เลือกช่วงวันที่ด่วน">{presets.map((preset) => <Button type="button" key={preset.value} size="sm" variant="secondary" className="h-7 px-2 text-xs" onClick={() => onRangeChange(getAuditLogDatePresetRange(preset.value))}>{preset.label}</Button>)}</div></div>;
}
