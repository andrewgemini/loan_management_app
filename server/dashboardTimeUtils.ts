export const dashboardTimeRanges = [7, 30, 90] as const;
export type DashboardTimeRange = (typeof dashboardTimeRanges)[number];
export type DashboardCustomRange = { startDate: string; endDate: string };
export type DashboardComparisonMode = "matching_period" | "previous_month" | "previous_quarter";

type PaymentRow = { paymentDate: Date | string; amountPaid: string | number };

function startOfUtcDay(value: Date) {
  return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()));
}

function dayKey(value: Date) {
  return value.toISOString().slice(0, 10);
}

export function getDashboardTimeWindow(days: DashboardTimeRange, now = new Date()) {
  const end = startOfUtcDay(now);
  const start = new Date(end);
  start.setUTCDate(start.getUTCDate() - (days - 1));
  return { start, end };
}

export function getDashboardCustomWindow(range: DashboardCustomRange) {
  return {
    start: new Date(`${range.startDate}T00:00:00.000Z`),
    end: new Date(`${range.endDate}T00:00:00.000Z`),
  };
}

export function getDashboardRangeWindow(range: DashboardTimeRange | DashboardCustomRange, now = new Date()) {
  return typeof range === "number" ? getDashboardTimeWindow(range, now) : getDashboardCustomWindow(range);
}

export function getPreviousDashboardWindow(range: DashboardTimeRange | DashboardCustomRange, now = new Date()) {
  const current = getDashboardRangeWindow(range, now);
  const days = Math.round((current.end.getTime() - current.start.getTime()) / 86400000) + 1;
  const end = new Date(current.start);
  end.setUTCDate(end.getUTCDate() - 1);
  const start = new Date(end);
  start.setUTCDate(start.getUTCDate() - (days - 1));
  return { start, end };
}

export function getDashboardComparisonWindow(range: DashboardTimeRange | DashboardCustomRange, mode: DashboardComparisonMode, now = new Date()) {
  if (mode === "matching_period") return getPreviousDashboardWindow(range, now);
  const { end: anchor } = getDashboardRangeWindow(range, now);
  if (mode === "previous_month") {
    const end = new Date(Date.UTC(anchor.getUTCFullYear(), anchor.getUTCMonth(), 0));
    const start = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), 1));
    return { start, end };
  }
  const currentQuarterStart = Math.floor(anchor.getUTCMonth() / 3) * 3;
  const end = new Date(Date.UTC(anchor.getUTCFullYear(), currentQuarterStart, 0));
  const start = new Date(Date.UTC(end.getUTCFullYear(), Math.floor(end.getUTCMonth() / 3) * 3, 1));
  return { start, end };
}

/** Returns a complete zero-filled daily payment trend within the permitted time window. */
export function buildDailyPaymentTrend(payments: PaymentRow[], range: DashboardTimeRange | DashboardCustomRange, now = new Date()) {
  const { start, end } = typeof range === "number" ? getDashboardTimeWindow(range, now) : getDashboardCustomWindow(range);
  const totals = new Map<string, number>();
  const cursor = new Date(start);
  while (cursor <= end) {
    totals.set(dayKey(cursor), 0);
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  for (const payment of payments) {
    const occurredAt = new Date(payment.paymentDate);
    if (Number.isNaN(occurredAt.getTime())) continue;
    const key = dayKey(occurredAt);
    if (!totals.has(key)) continue;
    totals.set(key, (totals.get(key) ?? 0) + Number(payment.amountPaid || 0));
  }
  const labels = Array.from(totals.keys());
  return { labels, data: labels.map((label) => Math.round((totals.get(label) ?? 0) * 100) / 100) };
}
