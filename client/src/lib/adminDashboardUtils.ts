export type PaymentTrendChartData = {
  labels: string[];
  data: number[];
};

export function canAccessAdminDashboard(role: string | null | undefined): boolean {
  return role === "admin";
}

export function hasPaymentTrendData(
  chart: PaymentTrendChartData | null | undefined
): chart is PaymentTrendChartData {
  return Boolean(chart && chart.labels.length > 0 && chart.data.length > 0);
}

export type PaymentTrendViewState = "chart" | "empty";

export function calculatePaymentBarHeight(amount: number, data: number[]): number {
  const maximum = Math.max(...data, 1);
  return amount > 0 ? Math.max((amount / maximum) * 100, 8) : 3;
}

export function getPaymentTrendViewState(
  chart: PaymentTrendChartData | null | undefined
): PaymentTrendViewState {
  return hasPaymentTrendData(chart) ? "chart" : "empty";
}

export function hasDecisionReason(reason: string | null | undefined): boolean {
  return Boolean(reason && reason.trim().length > 0);
}

export type AdminDecisionAction = "approve" | "reject" | "verify";

export function getDecisionButtonLabel(action: AdminDecisionAction): string {
  if (action === "approve") return "อนุมัติ";
  if (action === "verify") return "ยืนยัน";
  return "ปฏิเสธ";
}
