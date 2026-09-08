import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { createAdminAuditLogExportOptions } from "../client/src/lib/adminAuditLogExport";

describe("Audit Log PDF and date range features", () => {
  it("reuses the authorized filtered export options for PDF", () => {
    const source = readFileSync(new URL("../client/src/lib/adminAuditLogExport.ts", import.meta.url), "utf8");
    expect(source).toContain("downloadHistoryPDF(createAdminAuditLogExportOptions(rows, summary, referenceCode))");
    expect(createAdminAuditLogExportOptions([], "ช่วงวันที่ 2026-08-01 ถึง 2026-08-31").subtitle).toContain("ช่วงวันที่");
  });

  it("uses the existing accessible calendar in range mode and syncs both date inputs", () => {
    const source = readFileSync(new URL("../client/src/components/AuditLogDateRangePicker.tsx", import.meta.url), "utf8");
    expect(source).toContain('mode="range"');
    expect(source).toContain("startDate: toDateInput(range?.from), endDate: toDateInput(range?.to)");
  });
});
