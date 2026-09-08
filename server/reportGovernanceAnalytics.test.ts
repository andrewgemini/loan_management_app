import { describe, expect, it } from "vitest";
import { mergeGovernanceDailyTrend, selectApprovalNotificationRecipients } from "./reportGovernanceDb";

describe("report governance analytics helpers", () => {
  it("notifies only other approval-capable admins while preserving legacy default permissions", () => {
    expect(selectApprovalNotificationRecipients([
      { userId: 7, canManageExportPermissions: true },
      { userId: 9, canManageExportPermissions: false },
      { userId: 11, canManageExportPermissions: null },
      { userId: 13, canManageExportPermissions: true },
    ], 7)).toEqual([11, 13]);
  });

  it("merges and orders daily export/event aggregates without fabricating missing values", () => {
    expect(mergeGovernanceDailyTrend(
      [{ date: "2026-08-25", exportCount: "2", exportedRows: "730" }],
      [{ date: "2026-08-24", eventCount: "3", highSeverityCount: "1" }, { date: "2026-08-25", eventCount: "1", highSeverityCount: "0" }],
    )).toEqual([
      { date: "2026-08-24", exportCount: 0, exportedRows: 0, securityEventCount: 3, highSeverityCount: 1 },
      { date: "2026-08-25", exportCount: 2, exportedRows: 730, securityEventCount: 1, highSeverityCount: 0 },
    ]);
  });
});
