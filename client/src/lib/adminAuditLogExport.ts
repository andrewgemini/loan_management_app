import type { AdminAuditLogRow } from "@/components/AdminAuditVirtualList";
import type { ExportColumn } from "./historyExport";
import { downloadHistoryPDF } from "./historyExport";

const actionLabels: Record<string, string> = {
  read: "เปิดดูการตั้งค่า", updated: "แก้ไขการตั้งค่า", reset: "รีเซ็ตการตั้งค่า", line_connected: "เชื่อมต่อ LINE Notify", line_disconnected: "ยกเลิก LINE Notify", pdf_exported: "ส่งออก PDF Audit Logs",
};

export const adminAuditLogExportColumns: ExportColumn<AdminAuditLogRow>[] = [
  { header: "วันที่และเวลา", value: (row) => new Date(row.createdAt).toLocaleString("th-TH") },
  { header: "ประเภทการกระทำ", value: (row) => actionLabels[row.action] || row.action },
  { header: "ชื่อผู้ใช้", value: (row) => row.userName || "ไม่ระบุชื่อ" },
  { header: "อีเมล", value: (row) => row.userEmail || "-" },
  { header: "บทบาท", value: (row) => ({ admin: "ผู้ดูแลระบบ", lender: "ผู้ให้กู้", borrower: "ผู้กู้" })[row.userRole] },
  { header: "ฟิลด์ที่เกี่ยวข้อง", value: (row) => row.changedFields || "ไม่มีการบันทึกค่าลับ" },
];

export function createAdminAuditLogExportOptions(rows: AdminAuditLogRow[], summary: string, referenceCode?: string) {
  const referenceSummary = referenceCode ? `${summary ? `${summary} • ` : ""}Reference ${referenceCode}` : summary;
  return { title: "Audit Logs การตั้งค่าการแจ้งเตือน", subtitle: `จำนวน ${rows.length} รายการ${referenceSummary ? ` • ${referenceSummary}` : ""}`, filenamePrefix: "admin_audit_logs", columns: adminAuditLogExportColumns, rows, referenceCode, watermark: referenceCode ? `AUDIT LOGS • ${referenceCode}` : undefined };
}

export async function downloadAdminAuditLogPDF(rows: AdminAuditLogRow[], summary: string, referenceCode: string) {
  await downloadHistoryPDF(createAdminAuditLogExportOptions(rows, summary, referenceCode));
}
