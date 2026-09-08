import type { HistoryExportOptions } from "./historyExport";

export type PresetCategoryMoveHistoryRow = {
  id: number;
  presetCount: number;
  destinationCategoryId: number | null;
  undoneAt: Date | string | null;
  createdAt: Date | string;
};

export type PresetCategoryOption = { id: number; name: string };

function formatMoveDate(value: Date | string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "ไม่ระบุเวลา" : date.toLocaleString("th-TH", { dateStyle: "medium", timeStyle: "short" });
}

export function createPresetCategoryMoveHistoryCsvOptions(rows: PresetCategoryMoveHistoryRow[], categories: PresetCategoryOption[]): HistoryExportOptions<PresetCategoryMoveHistoryRow> {
  const categoryNames = new Map(categories.map((category) => [category.id, category.name]));
  return {
    title: "ประวัติการย้าย Preset",
    subtitle: `เฉพาะรายการของบัญชีคุณ · ${rows.length.toLocaleString("th-TH")} รายการ`,
    filenamePrefix: "preset_category_move_history",
    rows,
    columns: [
      { header: "วันที่และเวลา", value: (move) => formatMoveDate(move.createdAt) },
      { header: "จำนวน Preset", value: (move) => move.presetCount },
      { header: "โฟลเดอร์ปลายทาง", value: (move) => move.destinationCategoryId === null ? "ไม่จัดโฟลเดอร์" : categoryNames.get(move.destinationCategoryId) ?? "โฟลเดอร์ที่ลบแล้ว" },
      { header: "สถานะ", value: (move) => move.undoneAt ? "ย้อนกลับแล้ว" : "ดำเนินการแล้ว" },
    ],
  };
}
