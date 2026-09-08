export function isDateWithinRange(value: Date | string, startDate?: string, endDate?: string): boolean {
  const date = new Date(value).toISOString().slice(0, 10);
  return (!startDate || date >= startDate) && (!endDate || date <= endDate);
}

export function filterRowsByDateRange<T>(rows: T[], getDate: (row: T) => Date | string, startDate?: string, endDate?: string): T[] {
  return rows.filter((row) => isDateWithinRange(getDate(row), startDate, endDate));
}

type AmortizationTotalRow = {
  paymentNumber: number;
  principalDue: string | number;
  interestDue: string | number;
  totalPaymentDue: string | number;
  endingBalance: string | number;
  isPaid: boolean | null;
};

export function calculateAmortizationTotals<T extends AmortizationTotalRow>(rows: T[]) {
  const totals = rows.reduce((accumulator, row) => ({
    principalDue: accumulator.principalDue + Number(row.principalDue),
    interestDue: accumulator.interestDue + Number(row.interestDue),
    totalPaymentDue: accumulator.totalPaymentDue + Number(row.totalPaymentDue),
    paidCount: accumulator.paidCount + (row.isPaid ? 1 : 0),
  }), { principalDue: 0, interestDue: 0, totalPaymentDue: 0, paidCount: 0 });
  const latestRow = [...rows].sort((left, right) => right.paymentNumber - left.paymentNumber)[0];
  return { ...totals, endingBalance: Number(latestRow?.endingBalance ?? 0) };
}
