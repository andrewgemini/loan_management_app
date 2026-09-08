import { describe, expect, it } from "vitest";
import { getPaymentRowsForExport } from "../client/src/lib/paymentHistoryExportUtils";

describe("PaymentPage export rows", () => {
  it("uses only paymentDate rows within the selected inclusive report period", () => {
    const rows = [
      { id: 1, paymentDate: "2026-05-01", amountPaid: "100" },
      { id: 2, paymentDate: "2026-05-31", amountPaid: "200" },
      { id: 3, paymentDate: "2026-06-01", amountPaid: "300" },
    ];

    const exportRows = getPaymentRowsForExport(rows, "2026-05-01", "2026-05-31");
    expect(exportRows.map((row) => row.id)).toEqual([1, 2]);
    expect(exportRows).toHaveLength(2);
  });
});
