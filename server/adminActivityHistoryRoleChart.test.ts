import { describe, expect, it } from "vitest";
import { activityFilterOptions, dailyActivityCounts, filterActivityHistory } from "../client/src/lib/adminActivityHistoryUtils";

const records = [
  { id: "request-1", status: "approved", loanId: 1, title: "อนุมัติคำขอกู้", detail: "คำขอ #1", actorName: "ผู้ดูแล A", actorRole: "admin", occurredAt: new Date("2026-08-01T04:00:00Z") },
  { id: "payment-1", status: "verified", loanId: 1, title: "ยืนยันการชำระเงิน", detail: "รายการ #1", actorName: "ผู้ให้กู้ B", actorRole: "lender", occurredAt: new Date("2026-08-01T12:00:00Z") },
  { id: "request-2", status: "rejected", loanId: 2, title: "ปฏิเสธคำขอกู้", detail: "คำขอ #2", actorName: "ผู้ดูแล A", actorRole: "admin", occurredAt: new Date("2026-08-02T04:00:00Z") },
];

describe("Activity History role filter and daily chart data", () => {
  it("filters by actor role alongside event and actor filters", () => {
    expect(filterActivityHistory(records, "all", "all", "admin").map((record) => record.id)).toEqual(["request-1", "request-2"]);
    expect(filterActivityHistory(records, "อนุมัติคำขอกู้", "ผู้ดูแล A", "admin").map((record) => record.id)).toEqual(["request-1"]);
    expect(activityFilterOptions(records).roles).toEqual(["admin", "lender"]);
  });

  it("groups filtered activity records by date in ascending order", () => {
    expect(dailyActivityCounts(records)).toEqual([{ date: "2026-08-01", count: 2 }, { date: "2026-08-02", count: 1 }]);
  });
});
