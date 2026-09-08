import { describe, expect, it } from "vitest";
import { getQuickReportRange } from "../client/src/lib/reportDatePresets";

describe("report date presets", () => {
  it("returns deterministic inclusive ranges for common report presets", () => {
    const now = new Date("2026-08-22T12:00:00.000Z");
    expect(getQuickReportRange("thisMonth", now)).toEqual({ startDate: "2026-08-01", endDate: "2026-08-22" });
    expect(getQuickReportRange("lastMonth", now)).toEqual({ startDate: "2026-07-01", endDate: "2026-07-31" });
    expect(getQuickReportRange("last90Days", now)).toEqual({ startDate: "2026-05-25", endDate: "2026-08-22" });
  });
});
