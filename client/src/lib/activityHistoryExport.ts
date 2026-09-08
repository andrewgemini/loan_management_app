import type { ExportColumn } from "./historyExport";
import type { ActivityHistoryRecord } from "./adminActivityHistoryUtils";

export const activityHistoryExportColumns: ExportColumn<ActivityHistoryRecord>[] = [
  { header: "ประเภทเหตุการณ์", value: (activity) => activity.title },
  { header: "รายละเอียด", value: (activity) => activity.detail },
  { header: "ผู้ดำเนินการ", value: (activity) => activity.actorName },
  { header: "บทบาทผู้ดำเนินการ", value: (activity) => activity.actorRole },
  { header: "ผู้ให้กู้", value: (activity) => activity.lenderName },
  { header: "สถานะ", value: (activity) => activity.status },
  { header: "วันที่และเวลา", value: (activity) => new Date(activity.occurredAt).toLocaleString("th-TH") },
  { header: "สัญญา", value: (activity) => activity.loanId ? `#${activity.loanId}` : "-" },
];

export function createActivityHistoryExportOptions(rows: ActivityHistoryRecord[], startDate: string, endDate: string) {
  const dateSummary = startDate || endDate ? ` • ช่วงวันที่ ${startDate || "เริ่มต้น"} ถึง ${endDate || "ปัจจุบัน"}` : "";
  return { title: "ประวัติการทำรายการ", subtitle: `จำนวน ${rows.length} รายการ${dateSummary}`, filenamePrefix: "activity_history", columns: activityHistoryExportColumns, rows };
}
