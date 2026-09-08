export type PaymentStatusFilter = "all" | "pending" | "verified" | "rejected";
export type PaymentSortKey = "paymentDate" | "amountPaid" | "status" | "paymentMethod";
export type PaymentSortDirection = "asc" | "desc";

export type PaymentHistoryRow = {
  id: number;
  amountPaid: string | number;
  paymentDate: Date | string;
  status: PaymentStatusFilter;
  paymentMethod: string;
  scheduleId?: number | null;
};

export type PaymentHistoryFilters = {
  query: string;
  status: PaymentStatusFilter;
  sortKey: PaymentSortKey;
  sortDirection: PaymentSortDirection;
};

const statusLabels: Record<PaymentStatusFilter, string> = {
  all: "ทั้งหมด all",
  pending: "รอตรวจสอบ pending",
  verified: "ยืนยันแล้ว verified",
  rejected: "ปฏิเสธ rejected",
};

function numericValue(value: string | number): number {
  const parsed = typeof value === "number" ? value : Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function dateValue(value: Date | string): number {
  const timestamp = value instanceof Date ? value.getTime() : Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp : 0;
}

export function getPaymentStatusLabel(status: PaymentStatusFilter): string {
  if (status === "verified") return "ยืนยันแล้ว";
  if (status === "rejected") return "ปฏิเสธ";
  if (status === "pending") return "รอตรวจสอบ";
  return "ทั้งหมด";
}

export function filterAndSortPayments<T extends PaymentHistoryRow>(
  rows: T[],
  filters: PaymentHistoryFilters,
): T[] {
  const normalizedQuery = filters.query.trim().toLocaleLowerCase("th-TH");
  const filteredRows = rows.filter((row) => {
    if (filters.status !== "all" && row.status !== filters.status) return false;
    if (!normalizedQuery) return true;

    const searchableText = [
      String(row.id),
      row.scheduleId == null ? "" : `งวด ${row.scheduleId} งวดที่ ${row.scheduleId}`,
      numericValue(row.amountPaid).toFixed(2),
      new Date(row.paymentDate).toLocaleDateString("th-TH"),
      row.paymentMethod,
      statusLabels[row.status],
    ]
      .join(" ")
      .toLocaleLowerCase("th-TH");

    return searchableText.includes(normalizedQuery);
  });

  return [...filteredRows].sort((left, right) => {
    let comparison = 0;

    switch (filters.sortKey) {
      case "paymentDate":
        comparison = dateValue(left.paymentDate) - dateValue(right.paymentDate);
        break;
      case "amountPaid":
        comparison = numericValue(left.amountPaid) - numericValue(right.amountPaid);
        break;
      case "status":
        comparison = left.status.localeCompare(right.status);
        break;
      case "paymentMethod":
        comparison = left.paymentMethod.localeCompare(right.paymentMethod, "th-TH");
        break;
    }

    if (comparison === 0) comparison = left.id - right.id;
    return filters.sortDirection === "asc" ? comparison : -comparison;
  });
}
