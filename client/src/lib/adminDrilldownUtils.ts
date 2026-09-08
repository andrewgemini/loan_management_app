export function matchesLoanTypeSlice(paymentType: string, sliceName: string): boolean {
  return (sliceName === "ผ่อนคงที่" && paymentType === "fixed") ||
    (sliceName === "ลดต้นลดดอก" && paymentType === "reducing");
}

export function matchesPaymentStatusSlice(status: string, sliceName: string): boolean {
  return (sliceName === "รอตรวจสอบ" && status === "pending") ||
    (sliceName === "ยืนยันแล้ว" && status === "verified") ||
    (sliceName === "ปฏิเสธ" && status === "rejected");
}
