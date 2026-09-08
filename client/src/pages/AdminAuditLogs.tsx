import { useMemo, useState } from "react";
import { ArrowDownAZ, CalendarDays, ClipboardList, Download, FileSearch, FileText, RotateCcw, Search, ShieldAlert } from "lucide-react";
import { useAuth } from "@/_core/hooks/useAuth";
import DashboardLayout from "@/components/DashboardLayout";
import { AdminAuditVirtualList, type AdminAuditLogRow } from "@/components/AdminAuditVirtualList";
import { AuditLogDateRangePicker } from "@/components/AuditLogDateRangePicker";
import { AuditLogFilterChips } from "@/components/AuditLogFilterChips";
import { AuditLogHighlight } from "@/components/AuditLogHighlight";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { trpc } from "@/lib/trpc";
import { canAccessAdminDashboard } from "@/lib/adminDashboardUtils";
import { createAdminAuditLogExportOptions, downloadAdminAuditLogPDF } from "@/lib/adminAuditLogExport";
import { downloadHistoryCSV } from "@/lib/historyExport";
import { AUDIT_LOG_SEARCH_DEBOUNCE_MS } from "@/lib/auditLogSearch";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { toast } from "sonner";

const actionOptions = [["", "ทุกประเภท"], ["read", "เปิดดูการตั้งค่า"], ["updated", "แก้ไขการตั้งค่า"], ["reset", "รีเซ็ตการตั้งค่า"], ["line_connected", "เชื่อมต่อ LINE Notify"], ["line_disconnected", "ยกเลิก LINE Notify"], ["pdf_exported", "ส่งออก PDF Audit Logs"]] as const;
const actionLabels: Record<string, string> = { read: "เปิดดูการตั้งค่า", updated: "แก้ไขการตั้งค่า", reset: "รีเซ็ตการตั้งค่า", line_connected: "เชื่อมต่อ LINE Notify", line_disconnected: "ยกเลิก LINE Notify", pdf_exported: "ส่งออก PDF Audit Logs" };
const roleLabels: Record<AdminAuditLogRow["userRole"], string> = { admin: "ผู้ดูแลระบบ", lender: "ผู้ให้กู้", borrower: "ผู้กู้" };

export default function AdminAuditLogs() {
  const { user } = useAuth();
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [action, setAction] = useState("");
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState<"createdAt" | "action">("createdAt");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("desc");
  const [selectedLog, setSelectedLog] = useState<AdminAuditLogRow | null>(null);
  const [isExportingPdf, setIsExportingPdf] = useState(false);
  const debouncedSearch = useDebouncedValue(search.trim(), AUDIT_LOG_SEARCH_DEBOUNCE_MS);
  const canView = Boolean(user && canAccessAdminDashboard(user.role));
  const invalidRange = Boolean(startDate && endDate && startDate > endDate);
  const queryInput = useMemo(() => ({
    limit: 1000,
    sortBy,
    sortDirection,
    ...(startDate ? { startDate } : {}),
    ...(endDate ? { endDate } : {}),
    ...(action ? { action: action as "read" | "updated" | "reset" | "line_connected" | "line_disconnected" | "pdf_exported" } : {}),
    ...(debouncedSearch ? { search: debouncedSearch } : {}),
  }), [action, debouncedSearch, endDate, sortBy, sortDirection, startDate]);
  const { data: logs = [], isLoading, error } = trpc.admin.listNotificationPreferenceAuditLogs.useQuery(queryInput, { enabled: canView && !invalidRange });
  const { data: exportPermissions } = trpc.admin.getMyExportPermissions.useQuery(undefined, { enabled: canView });
  const { data: exportPolicy } = trpc.admin.getExportSecurityPolicy.useQuery(undefined, { enabled: canView });
  const { data: approvalRequests = [] } = trpc.admin.getMyExportApprovalRequests.useQuery({ limit: 100 }, { enabled: canView });
  const pdfReference = trpc.admin.createAuditLogPdfExportReference.useMutation();
  const recordDownload = trpc.admin.recordAuditLogDownload.useMutation();
  const requestApproval = trpc.admin.requestHighSensitivityAuditLogExport.useMutation();
  const hasPendingSearch = search.trim() !== debouncedSearch;
  const resetFilters = () => { setStartDate(""); setEndDate(""); setAction(""); setSearch(""); setSortBy("createdAt"); setSortDirection("desc"); };
  const exportSummary = [startDate || endDate ? `ช่วงวันที่ ${startDate || "เริ่มต้น"} ถึง ${endDate || "ปัจจุบัน"}` : "", action ? `ประเภท ${actionLabels[action]}` : "", debouncedSearch ? `ค้นหา ${debouncedSearch}` : "", sortBy !== "createdAt" || sortDirection !== "desc" ? `เรียง ${sortBy === "action" ? "ประเภท" : "วันที่"} ${sortDirection}` : ""].filter(Boolean).join(" • ");
  const requiresApproval = Boolean(exportPolicy && logs.length >= exportPolicy.approvalRowThreshold);
  const matchingApproval = (format: "csv" | "pdf") => approvalRequests.find((request) => request.status === "approved" && !request.consumedAt && request.format === format && request.rowCount === logs.length && request.filterSummary === exportSummary && new Date(request.expiresAt) > new Date());
  const hasPendingApproval = (format: "csv" | "pdf") => approvalRequests.some((request) => request.status === "pending" && request.format === format && request.rowCount === logs.length && request.filterSummary === exportSummary && new Date(request.expiresAt) > new Date());
  const requestExportApproval = async (format: "csv" | "pdf") => {
    try {
      const response = await requestApproval.mutateAsync({ format, rowCount: logs.length, filterSummary: exportSummary });
      toast.success(`ส่งคำขอ ${format.toUpperCase()} แล้ว • รออนุมัติก่อน ${new Date(response.expiresAt).toLocaleString("th-TH")}`);
    } catch (requestError) {
      toast.error(requestError instanceof Error ? requestError.message : "ไม่สามารถส่งคำขออนุมัติได้");
    }
  };
  const exportCSV = async () => {
    const approvalRequestId = matchingApproval("csv")?.id;
    if (requiresApproval && !approvalRequestId) return requestExportApproval("csv");
    try {
      await recordDownload.mutateAsync({ format: "csv", rowCount: logs.length, filterSummary: exportSummary, ...(approvalRequestId ? { approvalRequestId } : {}) });
      downloadHistoryCSV(createAdminAuditLogExportOptions(logs, exportSummary));
      toast.success(`ส่งออก Audit Logs ${logs.length.toLocaleString("th-TH")} รายการแล้ว`);
    } catch (exportError) {
      toast.error(exportError instanceof Error ? exportError.message : "ไม่สามารถส่งออก CSV ได้");
    }
  };
  const exportPDF = async () => {
    const approvalRequestId = matchingApproval("pdf")?.id;
    if (requiresApproval && !approvalRequestId) return requestExportApproval("pdf");
    try {
      setIsExportingPdf(true);
      const { referenceCode } = await pdfReference.mutateAsync({ rowCount: logs.length, filterSummary: exportSummary, ...(approvalRequestId ? { approvalRequestId } : {}) });
      await downloadAdminAuditLogPDF(logs, exportSummary, referenceCode);
      await recordDownload.mutateAsync({ format: "pdf", rowCount: logs.length, filterSummary: exportSummary, referenceCode, ...(approvalRequestId ? { approvalRequestId } : {}) });
      toast.success(`สร้าง PDF แล้ว • รหัสอ้างอิง ${referenceCode}`);
    } catch (pdfError) {
      toast.error(pdfError instanceof Error ? pdfError.message : "ไม่สามารถสร้าง PDF ได้");
    } finally {
      setIsExportingPdf(false);
    }
  };

  if (!canView) return <DashboardLayout><Card className="mx-auto max-w-xl glass-panel"><CardContent className="p-8 text-center"><ShieldAlert className="mx-auto h-10 w-10 text-destructive" /><h1 className="mt-4 text-xl font-semibold">ไม่มีสิทธิ์เข้าถึง Audit Logs</h1><p className="mt-2 text-sm text-muted-foreground">หน้านี้สงวนไว้สำหรับผู้ดูแลระบบ</p></CardContent></Card></DashboardLayout>;

  return <DashboardLayout><div className="mx-auto max-w-6xl space-y-6"><div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between"><div><p className="text-sm font-medium text-primary">Admin Governance</p><h1 className="text-3xl font-bold tracking-tight">Audit Logs</h1><p className="mt-1 text-muted-foreground">เลือกช่วงวันที่ ค้นหา ส่งออก และตรวจรายละเอียดการตั้งค่าการแจ้งเตือนทุกบัญชี โดยไม่เปิดเผย token หรือค่าลับ</p></div><div className="rounded-xl border border-primary/15 bg-primary/5 px-4 py-3 text-sm"><span className="font-semibold text-primary">{logs.length.toLocaleString("th-TH")}</span><span className="ml-1 text-muted-foreground">รายการ</span></div></div><Card className="glass-panel"><CardHeader><div className="flex items-center gap-3"><ClipboardList className="h-6 w-6 text-primary" /><div><CardTitle>กรอง ค้นหา และเรียงลำดับ</CardTitle><CardDescription>ผลลัพธ์นี้ใช้ร่วมกันสำหรับรายการเสมือน รายละเอียด ไฟล์ CSV และ PDF</CardDescription></div></div></CardHeader><CardContent><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6"><div className="lg:col-span-2"><AuditLogDateRangePicker startDate={startDate} endDate={endDate} onRangeChange={({ startDate: nextStart, endDate: nextEnd }) => { setStartDate(nextStart); setEndDate(nextEnd); }} /></div><label className="text-sm font-medium">ประเภท<select className="mt-1 h-10 w-full rounded-md border border-input bg-background px-3" value={action} onChange={(event) => setAction(event.target.value)}>{actionOptions.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label><label className="text-sm font-medium">เรียงตาม<select className="mt-1 h-10 w-full rounded-md border border-input bg-background px-3" value={sortBy} onChange={(event) => setSortBy(event.target.value as "createdAt" | "action")}><option value="createdAt">วันที่</option><option value="action">ประเภทการกระทำ</option></select></label><label className="text-sm font-medium">ลำดับ<select className="mt-1 h-10 w-full rounded-md border border-input bg-background px-3" value={sortDirection} onChange={(event) => setSortDirection(event.target.value as "asc" | "desc")}><option value="desc">ใหม่ไปเก่า / Z-A</option><option value="asc">เก่าไปใหม่ / A-Z</option></select></label><label className="text-sm font-medium">ค้นหาชื่อหรืออีเมล<div className="relative mt-1"><Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-muted-foreground" aria-hidden="true" /><Input className="pl-9" type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="เช่น somchai หรือ @mail" aria-label="ค้นหาชื่อหรืออีเมล" /></div></label></div>{invalidRange && <p className="mt-3 text-sm text-destructive">วันสิ้นสุดต้องไม่ก่อนวันเริ่มต้น</p>}{hasPendingSearch && <p className="mt-3 text-sm text-muted-foreground" role="status" aria-live="polite">กำลังเตรียมค้นหา…</p>}<div className="mt-4"><AuditLogFilterChips startDate={startDate} endDate={endDate} action={action} search={debouncedSearch} sortBy={sortBy} sortDirection={sortDirection} onClearDate={() => { setStartDate(""); setEndDate(""); }} onClearAction={() => setAction("")} onClearSearch={() => setSearch("")} onResetSort={() => { setSortBy("createdAt"); setSortDirection("desc"); }} onClearAll={resetFilters} /></div><div className="mt-4 flex flex-wrap gap-2"><Button type="button" variant="outline" onClick={resetFilters} className="gap-2"><RotateCcw className="h-4 w-4" />ล้างตัวกรอง</Button><Button type="button" variant="outline" onClick={exportCSV} disabled={isLoading || !logs.length || isExportingPdf || !exportPermissions?.canExportCsv || requestApproval.isPending || (requiresApproval && hasPendingApproval("csv"))} className="gap-2"><Download className="h-4 w-4" />{requiresApproval && !matchingApproval("csv") ? (hasPendingApproval("csv") ? "CSV รออนุมัติ" : "ขออนุมัติ CSV") : "Export CSV"}</Button><Button type="button" variant="outline" onClick={exportPDF} disabled={isLoading || !logs.length || isExportingPdf || !exportPermissions?.canExportPdf || requestApproval.isPending || (requiresApproval && hasPendingApproval("pdf"))} className="gap-2"><FileText className="h-4 w-4" />{requiresApproval && !matchingApproval("pdf") ? (hasPendingApproval("pdf") ? "PDF รออนุมัติ" : "ขออนุมัติ PDF") : (isExportingPdf ? "กำลังสร้าง PDF" : "Export PDF")}</Button>{requiresApproval && <span className="inline-flex items-center px-2 text-sm text-amber-700 dark:text-amber-300">ผลลัพธ์นี้ต้องได้รับอนุมัติจากผู้ดูแลคนอื่นก่อนส่งออก</span>}{exportPermissions && (!exportPermissions.canExportCsv || !exportPermissions.canExportPdf) && <span className="inline-flex items-center px-2 text-sm text-amber-700 dark:text-amber-300">บางรูปแบบถูกจำกัดตามสิทธิ์บัญชี</span>}<span className="inline-flex items-center gap-2 px-2 text-sm text-muted-foreground"><CalendarDays className="h-4 w-4" />ดึงสูงสุด 1,000 รายการต่อครั้ง</span><span className="inline-flex items-center gap-2 px-2 text-sm text-muted-foreground"><ArrowDownAZ className="h-4 w-4" />เรียงลำดับจาก server</span></div></CardContent></Card>{isLoading ? <Card className="glass-panel p-5" role="status" aria-live="polite" aria-busy="true"><div className="space-y-3">{[1, 2, 3, 4, 5].map((row) => <div key={row} className="h-20 animate-pulse rounded-xl bg-muted" />)}<span className="sr-only">กำลังโหลด Audit Logs</span></div></Card> : error ? <Card className="glass-panel p-8 text-center"><p className="text-destructive">ไม่สามารถโหลด Audit Logs ได้: {error.message}</p></Card> : <AdminAuditVirtualList rows={logs} onSelect={setSelectedLog} highlightQuery={debouncedSearch} />}</div><Dialog open={Boolean(selectedLog)} onOpenChange={(open) => { if (!open) setSelectedLog(null); }}><DialogContent className="glass-panel max-w-lg"><DialogHeader><DialogTitle>รายละเอียด Audit Log</DialogTitle><DialogDescription>แสดง metadata ที่ได้รับอนุญาตเท่านั้น ไม่มี token หรือค่าการตั้งค่า</DialogDescription></DialogHeader>{selectedLog && <div className="space-y-4 text-sm"><div className="rounded-xl bg-muted/50 p-4"><p className="font-semibold">{actionLabels[selectedLog.action] || selectedLog.action}</p><time className="mt-1 block text-muted-foreground">{new Date(selectedLog.createdAt).toLocaleString("th-TH")}</time></div><dl className="grid gap-3 sm:grid-cols-2"><div><dt className="text-xs text-muted-foreground">ผู้ใช้</dt><dd className="mt-1 font-medium"><AuditLogHighlight value={selectedLog.userName} query={debouncedSearch} fallback="ไม่ระบุชื่อ" /></dd></div><div><dt className="text-xs text-muted-foreground">อีเมล</dt><dd className="mt-1 break-all font-medium"><AuditLogHighlight value={selectedLog.userEmail} query={debouncedSearch} /></dd></div><div><dt className="text-xs text-muted-foreground">บทบาท</dt><dd className="mt-1 font-medium">{roleLabels[selectedLog.userRole]}</dd></div><div><dt className="text-xs text-muted-foreground">ฟิลด์ที่เกี่ยวข้อง</dt><dd className="mt-1 break-words font-medium">{selectedLog.changedFields ? selectedLog.changedFields.split(",").join(", ") : "ไม่มีการบันทึกค่าลับ"}</dd></div></dl><Button type="button" variant="outline" className="w-full gap-2" onClick={() => setSelectedLog(null)}><FileSearch className="h-4 w-4" />ปิดรายละเอียด</Button></div>}</DialogContent></Dialog></DashboardLayout>;
}
