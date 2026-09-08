import { describe, expect, it } from "vitest";
import { buildDailyPaymentTrend, getDashboardComparisonWindow, getDashboardTimeWindow, getPreviousDashboardWindow } from "./dashboardTimeUtils";

describe("dashboard time utilities", () => {
  const now = new Date("2026-08-26T12:00:00.000Z");

  it("creates an inclusive 7-day UTC window", () => {
    const range = getDashboardTimeWindow(7, now);
    expect(range.start.toISOString()).toBe("2026-08-20T00:00:00.000Z");
    expect(range.end.toISOString()).toBe("2026-08-26T00:00:00.000Z");
  });

  it("aggregates only payments inside the selected range and keeps zero-value days", () => {
    expect(buildDailyPaymentTrend([
      { paymentDate: "2026-08-20T08:00:00.000Z", amountPaid: "125.5" },
      { paymentDate: "2026-08-20T10:00:00.000Z", amountPaid: 74.5 },
      { paymentDate: "2026-08-19T23:59:59.000Z", amountPaid: 500 },
    ], 7, now)).toEqual({
      labels: ["2026-08-20", "2026-08-21", "2026-08-22", "2026-08-23", "2026-08-24", "2026-08-25", "2026-08-26"],
      data: [200, 0, 0, 0, 0, 0, 0],
    });
  });

  it("accepts an inclusive custom date range without dropping zero-value days", () => {
    expect(buildDailyPaymentTrend([
      { paymentDate: "2026-08-05T05:00:00.000Z", amountPaid: 100 },
      { paymentDate: "2026-08-07T20:00:00.000Z", amountPaid: 250 },
      { paymentDate: "2026-08-08T00:00:00.000Z", amountPaid: 999 },
    ], { startDate: "2026-08-05", endDate: "2026-08-07" }, now)).toEqual({
      labels: ["2026-08-05", "2026-08-06", "2026-08-07"],
      data: [100, 0, 250],
    });
  });

  it("creates a previous period with exactly the same inclusive length", () => {
    expect(getPreviousDashboardWindow({ startDate: "2026-08-05", endDate: "2026-08-07" }, now)).toEqual({
      start: new Date("2026-08-02T00:00:00.000Z"),
      end: new Date("2026-08-04T00:00:00.000Z"),
    });
  });

  it("creates completed calendar month and quarter comparison windows", () => {
    expect(getDashboardComparisonWindow(30, "previous_month", now)).toEqual({ start: new Date("2026-07-01T00:00:00.000Z"), end: new Date("2026-07-31T00:00:00.000Z") });
    expect(getDashboardComparisonWindow(30, "previous_quarter", now)).toEqual({ start: new Date("2026-04-01T00:00:00.000Z"), end: new Date("2026-06-30T00:00:00.000Z") });
  });
});
