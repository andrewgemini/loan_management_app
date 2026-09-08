import { useEffect, useState } from "react";
import { BookmarkPlus, Clock3, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getQuickReportRange, loadReportPresets, removeReportPreset, saveReportPreset, type SavedReportPreset } from "@/lib/reportDatePresets";
import { toast } from "sonner";

export function ReportDatePresetControls({ scope, startDate, endDate, onRangeChange }: { scope: string; startDate: string; endDate: string; onRangeChange: (range: { startDate: string; endDate: string }) => void }) {
  const [presets, setPresets] = useState<SavedReportPreset[]>([]);
  const [presetName, setPresetName] = useState("");
  const [selectedSavedId, setSelectedSavedId] = useState("");
  useEffect(() => setPresets(loadReportPresets(scope)), [scope]);

  const applyQuick = (value: string) => {
    if (!value) return;
    onRangeChange(getQuickReportRange(value as "thisMonth" | "lastMonth" | "last90Days"));
  };
  const saveCurrent = () => {
    if (!presetName.trim() || !startDate || !endDate || startDate > endDate) { toast.error("กรุณาระบุชื่อและช่วงวันที่ที่ถูกต้องก่อนบันทึก preset"); return; }
    setPresets(saveReportPreset(scope, presetName, { startDate, endDate }));
    setPresetName("");
    toast.success("บันทึกช่วงวันที่แล้ว");
  };

  return <div className="flex flex-col gap-2 rounded-md border border-border/60 bg-muted/25 p-3 sm:flex-row sm:flex-wrap sm:items-end">
    <label className="text-xs text-muted-foreground">ช่วงด่วน<select defaultValue="" onChange={(event) => applyQuick(event.target.value)} className="mt-1 h-9 w-full rounded-md border border-input bg-background px-2 text-sm sm:w-36"><option value="">เลือกช่วง</option><option value="thisMonth">เดือนนี้</option><option value="lastMonth">เดือนก่อน</option><option value="last90Days">90 วันล่าสุด</option></select></label>
    <label className="text-xs text-muted-foreground">ช่วงที่บันทึก<select value={selectedSavedId} onChange={(event) => { const selected = presets.find((preset) => preset.id === event.target.value); setSelectedSavedId(event.target.value); if (selected) onRangeChange(selected); }} className="mt-1 h-9 w-full rounded-md border border-input bg-background px-2 text-sm sm:w-44"><option value="">เลือก preset</option>{presets.map((preset) => <option key={preset.id} value={preset.id}>{preset.name}</option>)}</select></label>
    <label className="text-xs text-muted-foreground">บันทึกช่วงนี้เป็น<input value={presetName} onChange={(event) => setPresetName(event.target.value)} placeholder="เช่น รอบบัญชีเดือนนี้" className="mt-1 h-9 w-full rounded-md border border-input bg-background px-2 text-sm sm:w-44" /></label>
    <div className="flex gap-1"><Button type="button" size="sm" variant="outline" onClick={saveCurrent} className="h-9 gap-1"><BookmarkPlus className="h-3.5 w-3.5" />บันทึก</Button>{selectedSavedId && <Button type="button" size="sm" variant="ghost" aria-label="ลบ preset ที่เลือก" onClick={() => { setPresets(removeReportPreset(scope, selectedSavedId)); setSelectedSavedId(""); }} className="h-9 px-2"><Trash2 className="h-3.5 w-3.5" /></Button>}</div>
    <span className="inline-flex items-center gap-1 text-xs text-muted-foreground"><Clock3 className="h-3.5 w-3.5" />เก็บในเบราว์เซอร์นี้</span>
  </div>;
}
