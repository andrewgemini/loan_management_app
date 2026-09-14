export type ReportDateRange = { startDate: string; endDate: string };
export type SavedReportPreset = ReportDateRange & { id: string; name: string };

function toInputDate(value: Date): string {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function getQuickReportRange(preset: "thisMonth" | "lastMonth" | "last90Days", now = new Date()): ReportDateRange {
  const end = new Date(now);
  if (preset === "thisMonth") return { startDate: toInputDate(new Date(now.getFullYear(), now.getMonth(), 1)), endDate: toInputDate(end) };
  if (preset === "lastMonth") return { startDate: toInputDate(new Date(now.getFullYear(), now.getMonth() - 1, 1)), endDate: toInputDate(new Date(now.getFullYear(), now.getMonth(), 0)) };
  const start = new Date(now);
  start.setDate(start.getDate() - 89);
  return { startDate: toInputDate(start), endDate: toInputDate(end) };
}

function storageKey(scope: string) {
  return `loan-report-date-presets:${scope}`;
}

export function loadReportPresets(scope: string): SavedReportPreset[] {
  if (typeof window === "undefined") return [];
  try {
    const value = window.localStorage.getItem(storageKey(scope));
    const parsed = value ? JSON.parse(value) : [];
    return Array.isArray(parsed) ? parsed.filter((item): item is SavedReportPreset => Boolean(item?.id && item?.name && item?.startDate && item?.endDate)) : [];
  } catch {
    return [];
  }
}

export function saveReportPreset(scope: string, name: string, range: ReportDateRange): SavedReportPreset[] {
  const cleanedName = name.trim();
  if (!cleanedName || !range.startDate || !range.endDate || range.startDate > range.endDate) return loadReportPresets(scope);
  const next = [...loadReportPresets(scope).filter((preset) => preset.name !== cleanedName), { id: `${Date.now()}-${cleanedName}`, name: cleanedName, ...range }].slice(-8);
  if (typeof window !== "undefined") window.localStorage.setItem(storageKey(scope), JSON.stringify(next));
  return next;
}

export function removeReportPreset(scope: string, id: string): SavedReportPreset[] {
  const next = loadReportPresets(scope).filter((preset) => preset.id !== id);
  if (typeof window !== "undefined") window.localStorage.setItem(storageKey(scope), JSON.stringify(next));
  return next;
}
