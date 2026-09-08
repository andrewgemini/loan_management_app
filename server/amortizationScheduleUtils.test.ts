import { describe, expect, it } from "vitest";
import { filterAndSortSchedule, type ScheduleTableFilters } from "../client/src/lib/amortizationScheduleUtils";

const rows = [
  { id: 1, paymentNumber: 1, dueDate: "2026-01-15", totalPaymentDue: "1200.00", endingBalance: "8800.00", isPaid: true },
  { id: 2, paymentNumber: 2, dueDate: "2026-02-15", totalPaymentDue: "1100.00", endingBalance: "7700.00", isPaid: false },
  { id: 3, paymentNumber: 3, dueDate: "2026-03-15", totalPaymentDue: "1000.00", endingBalance: "6700.00", isPaid: false },
];

const filters = (overrides: Partial<ScheduleTableFilters> = {}): ScheduleTableFilters => ({
  query: "",
  status: "all",
  sortKey: "paymentNumber",
  sortDirection: "asc",
  ...overrides,
});

describe("filterAndSortSchedule", () => {
  it("filters paid and unpaid installments without mutating the source array", () => {
    const result = filterAndSortSchedule(rows, filters({ status: "unpaid" }));

    expect(result.map((row) => row.paymentNumber)).toEqual([2, 3]);
    expect(rows.map((row) => row.paymentNumber)).toEqual([1, 2, 3]);
  });

  it("searches by installment number, localized date, and payment status", () => {
    expect(filterAndSortSchedule(rows, filters({ query: "งวด" })).map((row) => row.paymentNumber)).toEqual([1, 2, 3]);
    expect(filterAndSortSchedule(rows, filters({ query: "15/2/2569" })).map((row) => row.paymentNumber)).toEqual([2]);
    expect(filterAndSortSchedule(rows, filters({ query: "ชำระแล้ว" })).map((row) => row.paymentNumber)).toEqual([1]);
  });

  it("sorts by amount in both directions and uses installment number as a stable tie-breaker", () => {
    expect(filterAndSortSchedule(rows, filters({ sortKey: "totalPaymentDue" })).map((row) => row.paymentNumber)).toEqual([3, 2, 1]);
    expect(filterAndSortSchedule(rows, filters({ sortKey: "totalPaymentDue", sortDirection: "desc" })).map((row) => row.paymentNumber)).toEqual([1, 2, 3]);
  });
});
