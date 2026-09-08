import { describe, expect, it } from "vitest";
import { createActivityHistoryExportOptions } from "../client/src/lib/activityHistoryExport";

const filteredRows = [{ id: "request-1", status: "approved", loanId: 5, title: "อนุมัติคำขอกู้", detail: "คำขอ #1", actorName: "ผู้ดูแล A", actorRole: "admin", lenderId: 7, lenderName: "ผู้ให้กู้ A", occurredAt: new Date("2026-08-01") }];

describe("Activity History export payload", () => {
  it("uses the exact final filtered rows for CSV/PDF options with a matching date summary", () => {
    const options = createActivityHistoryExportOptions(filteredRows, "2026-08-01", "2026-08-31");
    expect(options.rows).toBe(filteredRows);
    expect(options.subtitle).toContain("จำนวน 1 รายการ");
    expect(options.subtitle).toContain("2026-08-01 ถึง 2026-08-31");
    expect(options.columns.map((column) => column.header)).toEqual(["ประเภทเหตุการณ์", "รายละเอียด", "ผู้ดำเนินการ", "บทบาทผู้ดำเนินการ", "ผู้ให้กู้", "สถานะ", "วันที่และเวลา", "สัญญา"]);
  });
});
