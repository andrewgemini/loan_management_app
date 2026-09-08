export type DistributionSlice = {
  name: string;
  value: number;
};

type LoanTypeRow = {
  paymentType: "fixed" | "reducing";
};

type PaymentStatusRow = {
  status: "pending" | "verified" | "rejected";
};

export function getLoanTypeDistribution(rows: LoanTypeRow[]): DistributionSlice[] {
  return [
    { name: "ผ่อนคงที่", value: rows.filter((row) => row.paymentType === "fixed").length },
    { name: "ลดต้นลดดอก", value: rows.filter((row) => row.paymentType === "reducing").length },
  ];
}

export function getPaymentStatusDistribution(rows: PaymentStatusRow[]): DistributionSlice[] {
  return [
    { name: "รอตรวจสอบ", value: rows.filter((row) => row.status === "pending").length },
    { name: "ยืนยันแล้ว", value: rows.filter((row) => row.status === "verified").length },
    { name: "ปฏิเสธ", value: rows.filter((row) => row.status === "rejected").length },
  ];
}

export function hasDistributionData(rows: DistributionSlice[]): boolean {
  return rows.some((row) => row.value > 0);
}
