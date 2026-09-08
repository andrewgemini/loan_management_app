import { describe, expect, it } from "vitest";
import { getLoanTypeDistribution, getPaymentStatusDistribution, hasDistributionData } from "./adminAnalytics";

describe("admin analytics distributions", () => {
  it("aggregates loan payment types into pie chart slices", () => {
    const result = getLoanTypeDistribution([
      { paymentType: "fixed" },
      { paymentType: "reducing" },
      { paymentType: "reducing" },
    ]);

    expect(result).toEqual([
      { name: "ผ่อนคงที่", value: 1 },
      { name: "ลดต้นลดดอก", value: 2 },
    ]);
    expect(hasDistributionData(result)).toBe(true);
  });

  it("aggregates each payment verification status and reports empty datasets", () => {
    const result = getPaymentStatusDistribution([
      { status: "pending" },
      { status: "verified" },
      { status: "verified" },
      { status: "rejected" },
    ]);

    expect(result).toEqual([
      { name: "รอตรวจสอบ", value: 1 },
      { name: "ยืนยันแล้ว", value: 2 },
      { name: "ปฏิเสธ", value: 1 },
    ]);
    expect(hasDistributionData(getLoanTypeDistribution([]))).toBe(false);
  });
});
