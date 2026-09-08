import { describe, expect, it } from "vitest";
import { createExportFilename, createHistoryCSV, escapeCSVValue } from "../client/src/lib/historyExport";

describe("history export utilities", () => {
  it("escapes CSV cells containing commas, quotes, and line breaks", () => {
    expect(escapeCSVValue('ยอด, "ทดสอบ"\nใหม่')).toBe('"ยอด, ""ทดสอบ""\nใหม่"');
  });

  it("creates a Thai-compatible table body with title, subtitle, and escaped values", () => {
    const csv = createHistoryCSV({
      title: "ประวัติการชำระเงิน",
      subtitle: "สัญญา #7",
      filenamePrefix: "payment_history_loan_7",
      columns: [
        { header: "งวด", value: (row: { installment: string }) => row.installment },
        { header: "หมายเหตุ", value: (row: { note: string }) => row.note },
      ],
      rows: [{ installment: "1", note: "จ่าย, ครบ" }],
    });

    expect(csv).toContain("ประวัติการชำระเงิน");
    expect(csv).toContain("สัญญา #7");
    expect(csv).toContain('1,"จ่าย, ครบ"');
  });

  it("uses a stable dated filename for CSV and PDF downloads", () => {
    expect(createExportFilename("payment_history", "csv")).toMatch(/^payment_history_\d{4}-\d{2}-\d{2}\.csv$/);
    expect(createExportFilename("payment_history", "pdf")).toMatch(/^payment_history_\d{4}-\d{2}-\d{2}\.pdf$/);
  });
});
