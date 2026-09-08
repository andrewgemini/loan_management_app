import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { getAuditLogDatePresetRange } from "../client/src/lib/auditLogDatePresets";
import { createAdminAuditLogExportOptions } from "../client/src/lib/adminAuditLogExport";

describe("Audit Log presets and verified PDF", () => {
  it("computes today, Monday-based week, and whole month ranges deterministically", () => {
    const now = new Date("2026-08-26T10:00:00");
    expect(getAuditLogDatePresetRange("today", now)).toEqual({ startDate: "2026-08-26", endDate: "2026-08-26" });
    expect(getAuditLogDatePresetRange("thisWeek", now)).toEqual({ startDate: "2026-08-24", endDate: "2026-08-30" });
    expect(getAuditLogDatePresetRange("thisMonth", now)).toEqual({ startDate: "2026-08-01", endDate: "2026-08-31" });
  });

  it("includes an explicit reference code and watermark only in verified PDF options", () => {
    const options = createAdminAuditLogExportOptions([], "เดือนนี้", "AUD-20260826090000-TEST0001");
    expect(options.referenceCode).toBe("AUD-20260826090000-TEST0001");
    expect(options.watermark).toContain("AUDIT LOGS");
    expect(options.subtitle).toContain("Reference AUD-20260826090000-TEST0001");
  });

  it("renders removable active chips and writes PDF footer/watermark through the shared helper", () => {
    const chipSource = readFileSync(new URL("../client/src/components/AuditLogFilterChips.tsx", import.meta.url), "utf8");
    const pdfSource = readFileSync(new URL("../client/src/lib/historyExport.ts", import.meta.url), "utf8");
    expect(chipSource).toContain("ลบตัวกรอง");
    expect(chipSource).toContain("ล้างทั้งหมด");
    expect(pdfSource).toContain("willDrawPage");
    expect(pdfSource).toContain("Reference: ${options.referenceCode}");
  });
});
