import { describe, expect, it } from "vitest";
import { calculateAmortizationTotals, filterRowsByDateRange, isDateWithinRange } from "../client/src/lib/reportingUtils";

describe("reporting date range and amortization totals", () => {
  it("filters inclusive start/end dates and supports open-ended report ranges", () => {
    const rows = [
      { id: 1, date: "2026-01-01" },
      { id: 2, date: "2026-01-15" },
      { id: 3, date: "2026-02-01" },
    ];

    expect(filterRowsByDateRange(rows, (row) => row.date, "2026-01-01", "2026-01-15").map((row) => row.id)).toEqual([1, 2]);
    expect(filterRowsByDateRange(rows, (row) => row.date, "2026-01-15").map((row) => row.id)).toEqual([2, 3]);
    expect(isDateWithinRange("2026-02-01", undefined, "2026-01-31")).toBe(false);
  });

  it("summarizes the currently visible amortization rows and uses the latest installment balance", () => {
    const result = calculateAmortizationTotals([
      { paymentNumber: 3, principalDue: "900", interestDue: "100", totalPaymentDue: "1000", endingBalance: "0", isPaid: true },
      { paymentNumber: 1, principalDue: "700", interestDue: "300", totalPaymentDue: "1000", endingBalance: "1800", isPaid: false },
      { paymentNumber: 2, principalDue: "800", interestDue: "200", totalPaymentDue: "1000", endingBalance: "900", isPaid: true },
    ]);

    expect(result).toEqual({ principalDue: 2400, interestDue: 600, totalPaymentDue: 3000, paidCount: 2, endingBalance: 0 });
  });

  it("selects only payment-history rows whose paymentDate is within the report range", () => {
    const paymentRows = [
      { id: 11, paymentDate: new Date("2026-03-01T00:00:00.000Z"), amountPaid: "500" },
      { id: 12, paymentDate: new Date("2026-03-15T00:00:00.000Z"), amountPaid: "600" },
      { id: 13, paymentDate: new Date("2026-04-01T00:00:00.000Z"), amountPaid: "700" },
    ];

    const rowsForExport = filterRowsByDateRange(paymentRows, (payment) => payment.paymentDate, "2026-03-01", "2026-03-31");
    expect(rowsForExport.map((payment) => payment.id)).toEqual([11, 12]);
    expect(rowsForExport).toHaveLength(2);
  });
});
