import { describe, expect, it } from "vitest";
import { createHistoryCSV } from "../client/src/lib/historyExport";
import { createAdminAuditLogExportOptions } from "../client/src/lib/adminAuditLogExport";

describe("Admin Audit Log CSV export", () => {
  it("uses the same filtered rows and includes safe metadata columns", () => {
    const rows = [{ id: 9, userId: 2, userName: "สมชาย", userEmail: "somchai@example.com", userRole: "borrower" as const, action: "updated", changedFields: "emailLoanApproval,linePaymentReminder", createdAt: new Date("2026-08-25T03:00:00Z") }];
    const options = createAdminAuditLogExportOptions(rows, "ค้นหา somchai");
    const csv = createHistoryCSV(options);
    expect(options.subtitle).toContain("ค้นหา somchai");
    expect(csv).toContain("ประเภทการกระทำ");
    expect(csv).toContain("สมชาย");
    expect(csv).toContain("emailLoanApproval,linePaymentReminder");
    expect(csv).not.toContain("lineToken");
  });
});
