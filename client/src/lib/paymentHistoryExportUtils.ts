import { filterRowsByDateRange } from "./reportingUtils";

export type PaymentHistoryExportRow = { paymentDate: Date | string };

export function getPaymentRowsForExport<T extends PaymentHistoryExportRow>(rows: T[], startDate?: string, endDate?: string): T[] {
  return filterRowsByDateRange(rows, (payment) => payment.paymentDate, startDate, endDate);
}
