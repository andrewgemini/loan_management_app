import { describe, expect, it } from "vitest";
import {
  filterAndSortPayments,
  getPaymentStatusLabel,
  type PaymentHistoryFilters,
} from "../client/src/lib/paymentHistoryUtils";

const rows = [
  { id: 1, amountPaid: "2500.00", paymentDate: "2026-03-15", status: "verified" as const, paymentMethod: "promptpay", scheduleId: 3 },
  { id: 2, amountPaid: "1200.00", paymentDate: "2026-01-15", status: "pending" as const, paymentMethod: "bank_transfer", scheduleId: 1 },
  { id: 3, amountPaid: "1800.00", paymentDate: "2026-02-15", status: "rejected" as const, paymentMethod: "cash", scheduleId: 2 },
];

const filters = (overrides: Partial<PaymentHistoryFilters> = {}): PaymentHistoryFilters => ({
  query: "",
  status: "all",
  sortKey: "paymentDate",
  sortDirection: "desc",
  ...overrides,
});

describe("filterAndSortPayments", () => {
  it("filters by status and does not mutate the original rows", () => {
    const result = filterAndSortPayments(rows, filters({ status: "verified" }));

    expect(result.map((row) => row.id)).toEqual([1]);
    expect(rows.map((row) => row.id)).toEqual([1, 2, 3]);
  });

  it("searches payment amount, localized date, schedule reference, and Thai status", () => {
    expect(filterAndSortPayments(rows, filters({ query: "2500.00" })).map((row) => row.id)).toEqual([1]);
    expect(filterAndSortPayments(rows, filters({ query: "15/1/2569" })).map((row) => row.id)).toEqual([2]);
    expect(filterAndSortPayments(rows, filters({ query: "รอตรวจสอบ" })).map((row) => row.id)).toEqual([2]);
    expect(filterAndSortPayments(rows, filters({ query: "งวด 3" })).map((row) => row.id)).toEqual([1]);
  });

  it("sorts by amount and keeps a deterministic id tie-breaker", () => {
    expect(filterAndSortPayments(rows, filters({ sortKey: "amountPaid", sortDirection: "asc" })).map((row) => row.id)).toEqual([2, 3, 1]);
    expect(filterAndSortPayments(rows, filters({ sortKey: "amountPaid", sortDirection: "desc" })).map((row) => row.id)).toEqual([1, 3, 2]);
  });

  it("exposes localized status labels for the UI", () => {
    expect(getPaymentStatusLabel("pending")).toBe("รอตรวจสอบ");
    expect(getPaymentStatusLabel("verified")).toBe("ยืนยันแล้ว");
    expect(getPaymentStatusLabel("rejected")).toBe("ปฏิเสธ");
  });
});
