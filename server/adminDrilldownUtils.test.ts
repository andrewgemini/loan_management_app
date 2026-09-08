import { describe, expect, it } from "vitest";
import { matchesLoanTypeSlice, matchesPaymentStatusSlice } from "../client/src/lib/adminDrilldownUtils";

describe("admin pie-chart drill-down matching", () => {
  it("matches only loan records for the selected repayment-type slice", () => {
    expect(matchesLoanTypeSlice("fixed", "ผ่อนคงที่")).toBe(true);
    expect(matchesLoanTypeSlice("reducing", "ผ่อนคงที่")).toBe(false);
  });

  it("matches only payment rows for the selected status slice", () => {
    expect(matchesPaymentStatusSlice("verified", "ยืนยันแล้ว")).toBe(true);
    expect(matchesPaymentStatusSlice("pending", "ยืนยันแล้ว")).toBe(false);
    expect(matchesPaymentStatusSlice("rejected", "ปฏิเสธ")).toBe(true);
  });
});
