export type AuditLogDatePreset = "today" | "thisWeek" | "thisMonth";

function toDateInput(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export function getAuditLogDatePresetRange(preset: AuditLogDatePreset, now = new Date()) {
  const current = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (preset === "today") return { startDate: toDateInput(current), endDate: toDateInput(current) };
  if (preset === "thisMonth") {
    return { startDate: toDateInput(new Date(current.getFullYear(), current.getMonth(), 1)), endDate: toDateInput(new Date(current.getFullYear(), current.getMonth() + 1, 0)) };
  }
  const mondayOffset = (current.getDay() + 6) % 7;
  const monday = new Date(current);
  monday.setDate(current.getDate() - mondayOffset);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  return { startDate: toDateInput(monday), endDate: toDateInput(sunday) };
}
