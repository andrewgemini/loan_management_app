import { describe, expect, it } from "vitest";
import { filterLoanTypeDrilldown, filterPaymentStatusDrilldown } from "../client/src/lib/adminDrilldownSearch";

describe("admin drill-down search", () => {
  it("filters only the selected loan-type slice using explicit searchable fields", () => {
    const results = filterLoanTypeDrilldown([
      { id: 41, paymentType: "fixed", principalAmount: "12000", totalPaid: "2000", isClosed: false },
      { id: 42, paymentType: "reducing", principalAmount: "8000", totalPaid: "8000", isClosed: true },
    ], "ผ่อนคงที่", "12000");
    expect(results.map((record) => record.id)).toEqual([41]);
    expect(filterLoanTypeDrilldown(results, "ผ่อนคงที่", "กำลังดำเนิน")).toHaveLength(1);
  });

  it("filters payment rows by slice and searchable payment fields", () => {
    const results = filterPaymentStatusDrilldown([
      { id: 9, loanId: 41, status: "verified", paymentDate: new Date("2026-08-01"), amountPaid: "2500", paymentMethod: "promptpay" },
      { id: 10, loanId: 41, status: "pending", paymentDate: new Date("2026-08-02"), amountPaid: "1200", paymentMethod: "bank" },
    ], "ยืนยันแล้ว", "promptpay");
    expect(results.map((record) => record.id)).toEqual([9]);
  });
});
