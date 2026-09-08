export type ScheduleStatusFilter = "all" | "paid" | "unpaid";
export type ScheduleSortKey =
  | "paymentNumber"
  | "dueDate"
  | "totalPaymentDue"
  | "endingBalance"
  | "status";
export type ScheduleSortDirection = "asc" | "desc";

export type ScheduleRow = {
  id: number;
  paymentNumber: number;
  dueDate: Date | string;
  totalPaymentDue: string | number;
  endingBalance: string | number;
  isPaid?: boolean | null;
};

export type ScheduleTableFilters = {
  query: string;
  status: ScheduleStatusFilter;
  sortKey: ScheduleSortKey;
  sortDirection: ScheduleSortDirection;
};

function numericValue(value: string | number): number {
  const parsed = typeof value === "number" ? value : Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function dateValue(value: Date | string): number {
  const timestamp = value instanceof Date ? value.getTime() : Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp : 0;
}

export function filterAndSortSchedule<T extends ScheduleRow>(
  rows: T[],
  filters: ScheduleTableFilters,
): T[] {
  const normalizedQuery = filters.query.trim().toLocaleLowerCase("th-TH");
  const filteredRows = rows.filter((row) => {
    const matchesStatus =
      filters.status === "all" ||
      (filters.status === "paid" ? Boolean(row.isPaid) : !row.isPaid);

    if (!matchesStatus) return false;
    if (!normalizedQuery) return true;

    const searchableText = [
      `งวด ${row.paymentNumber}`,
      `งวดที่ ${row.paymentNumber}`,
      String(row.paymentNumber),
      new Date(row.dueDate).toLocaleDateString("th-TH"),
      row.isPaid ? "ชำระแล้ว paid" : "ยังไม่ชำระ unpaid",
    ]
      .join(" ")
      .toLocaleLowerCase("th-TH");

    return searchableText.includes(normalizedQuery);
  });

  return [...filteredRows].sort((left, right) => {
    let comparison = 0;

    switch (filters.sortKey) {
      case "paymentNumber":
        comparison = left.paymentNumber - right.paymentNumber;
        break;
      case "dueDate":
        comparison = dateValue(left.dueDate) - dateValue(right.dueDate);
        break;
      case "totalPaymentDue":
        comparison = numericValue(left.totalPaymentDue) - numericValue(right.totalPaymentDue);
        break;
      case "endingBalance":
        comparison = numericValue(left.endingBalance) - numericValue(right.endingBalance);
        break;
      case "status":
        comparison = Number(Boolean(left.isPaid)) - Number(Boolean(right.isPaid));
        break;
    }

    if (comparison === 0) comparison = left.paymentNumber - right.paymentNumber;
    return filters.sortDirection === "asc" ? comparison : -comparison;
  });
}
