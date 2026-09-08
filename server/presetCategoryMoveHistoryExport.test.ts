import { describe, expect, it } from "vitest";
import { createHistoryCSV } from "../client/src/lib/historyExport";
import { createPresetCategoryMoveHistoryCsvOptions } from "../client/src/lib/presetCategoryMoveHistoryExport";

describe("Preset category move history CSV export", () => {
  it("exports only owner-scoped history metadata with safe destination and status labels", () => {
    const options = createPresetCategoryMoveHistoryCsvOptions([
      { id: 21, presetCount: 2, destinationCategoryId: 3, undoneAt: null, createdAt: new Date("2026-08-26T08:00:00.000Z") },
      { id: 20, presetCount: 1, destinationCategoryId: null, undoneAt: new Date("2026-08-26T09:00:00.000Z"), createdAt: new Date("2026-08-26T07:00:00.000Z") },
    ], [{ id: 3, name: "ติดตามสิ้นเดือน" }]);
    const csv = createHistoryCSV(options);

    expect(options.filenamePrefix).toBe("preset_category_move_history");
    expect(csv).toContain("จำนวน Preset");
    expect(csv).toContain("ติดตามสิ้นเดือน");
    expect(csv).toContain("ไม่จัดโฟลเดอร์");
    expect(csv).toContain("ย้อนกลับแล้ว");
    expect(csv).not.toContain("presetIds");
    expect(csv).not.toContain("previousCategoryIds");
  });
});
