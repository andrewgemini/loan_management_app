import { matchesLoanTypeSlice, matchesPaymentStatusSlice } from "./adminDrilldownUtils";

type LoanRecord = { id: number; paymentType: string; principalAmount: string | number; totalPaid?: string | number | null; isClosed: boolean | null };
type PaymentRecord = { id: number; loanId: number; status: string; paymentDate: Date | string; amountPaid: string | number; paymentMethod: string };

const normalize = (value: string) => value.trim().toLocaleLowerCase("th-TH");

export function filterLoanTypeDrilldown(records: LoanRecord[], sliceName: string, query: string) {
  const needle = normalize(query);
  return records.filter((record) => {
    if (!matchesLoanTypeSlice(record.paymentType, sliceName)) return false;
    if (!needle) return true;
    const searchable = [
      record.id,
      `#${record.id}`,
      record.paymentType,
      record.paymentType === "fixed" ? "ผ่อนคงที่" : "ลดต้นลดดอก",
      record.principalAmount,
      record.totalPaid ?? 0,
      record.isClosed ? "ปิดแล้ว" : "กำลังดำเนิน",
    ].join(" ").toLocaleLowerCase("th-TH");
    return searchable.includes(needle);
  });
}

export function filterPaymentStatusDrilldown(records: PaymentRecord[], sliceName: string, query: string) {
  const needle = normalize(query);
  return records.filter((record) => {
    if (!matchesPaymentStatusSlice(record.status, sliceName)) return false;
    if (!needle) return true;
    const searchable = [
      record.id,
      record.loanId,
      `#${record.loanId}`,
      record.status,
      new Date(record.paymentDate).toLocaleDateString("th-TH"),
      record.amountPaid,
      record.paymentMethod,
    ].join(" ").toLocaleLowerCase("th-TH");
    return searchable.includes(needle);
  });
}
