/**
 * CSV Export Utility Functions
 * สำหรับ export ตารางผ่อนชำระและข้อมูลอื่นๆ เป็นไฟล์ CSV
 */

export interface AmortizationRow {
  paymentNumber: number;
  dueDate: string;
  startingBalance: string;
  principalDue: string;
  interestDue: string;
  totalPayment: string;
  endingBalance: string;
}

export interface LoanInfo {
  loanId: number;
  borrowerName: string;
  principalAmount: string;
  interestRate: string;
  loanTermMonths: number;
  startDate: string;
  endDate: string;
  interestType: string;
  paymentType: string;
}

export interface ExportDateRange {
  startDate?: string;
  endDate?: string;
}

function toDateKey(value: string | Date): string {
  return typeof value === "string"
    ? value.slice(0, 10)
    : value.toISOString().slice(0, 10);
}

/**
 * กรองตารางผ่อนชำระแบบรวมวันเริ่มต้นและวันสิ้นสุด
 */
export function filterAmortizationScheduleByDateRange<T extends { dueDate: string | Date }>(
  schedule: T[],
  dateRange?: ExportDateRange
): T[] {
  if (!dateRange?.startDate && !dateRange?.endDate) {
    return schedule;
  }

  return schedule.filter((row) => {
    const dueDateKey = toDateKey(row.dueDate);
    return (
      (!dateRange.startDate || dueDateKey >= dateRange.startDate) &&
      (!dateRange.endDate || dueDateKey <= dateRange.endDate)
    );
  });
}

/**
 * แปลงข้อมูลตารางผ่อนชำระเป็น CSV format
 */
export function generateAmortizationCSV(
  loanInfo: LoanInfo,
  schedule: AmortizationRow[],
  dateRange?: ExportDateRange
): string {
  const lines: string[] = [];

  // Header section
  lines.push("สัญญาเงินกู้ยืม - ตารางผ่อนชำระ");
  lines.push("Loan Agreement - Amortization Schedule");
  lines.push("");

  // Loan Information
  lines.push(`เลขที่สัญญา (Loan ID),${escapeCSV(loanInfo.loanId)}`);
  lines.push(`ชื่อผู้กู้ (Borrower Name),${escapeCSV(loanInfo.borrowerName)}`);
  lines.push(`เงินต้น (Principal Amount),${escapeCSV(loanInfo.principalAmount)}`);
  lines.push(`อัตราดอกเบี้ย (Interest Rate),${escapeCSV(`${loanInfo.interestRate}%`)}`);
  lines.push(`ระยะเวลาผ่อน (Loan Term),${escapeCSV(`${loanInfo.loanTermMonths} เดือน`)}`);
  lines.push(`วันเริ่มต้น (Start Date),${escapeCSV(loanInfo.startDate)}`);
  lines.push(`วันสิ้นสุด (End Date),${escapeCSV(loanInfo.endDate)}`);
  lines.push(`ประเภทดอกเบี้ย (Interest Type),${escapeCSV(loanInfo.interestType)}`);
  lines.push(`ประเภทการผ่อน (Payment Type),${escapeCSV(loanInfo.paymentType)}`);

  if (dateRange?.startDate || dateRange?.endDate) {
    const rangeLabel = `${dateRange.startDate || "ไม่จำกัด"} ถึง ${dateRange.endDate || "ไม่จำกัด"}`;
    lines.push(`ช่วงวันที่ Export (Export Date Range),${escapeCSV(rangeLabel)}`);
  }

  lines.push("");

  // Schedule Header
  const headers = [
    "งวดที่",
    "วันครบกำหนด",
    "ยอดคงเหลือต้น",
    "ชำระต้น",
    "ชำระดอก",
    "รวมชำระ",
    "ยอดคงเหลือสิ้น",
  ];
  lines.push(headers.map((h) => escapeCSV(h)).join(","));

  // Schedule rows
  schedule.forEach((row) => {
    const values = [
      row.paymentNumber,
      row.dueDate,
      row.startingBalance,
      row.principalDue,
      row.interestDue,
      row.totalPayment,
      row.endingBalance,
    ];
    lines.push(values.map((v) => escapeCSV(v)).join(","));
  });

  return lines.join("\n");
}

/**
 * Escape special characters in CSV values.
 */
export function escapeCSV(value: unknown): string {
  if (value === null || value === undefined) {
    return "";
  }

  const stringValue = String(value);

  // If value contains comma, newline, or quotes, wrap in quotes and escape quotes.
  if (/[",\n\r]/.test(stringValue)) {
    return `"${stringValue.replace(/"/g, '""')}"`;
  }

  return stringValue;
}

/**
 * สร้างชื่อไฟล์ CSV พร้อม timestamp และช่วงวันที่ (ถ้ามี)
 */
export function generateCSVFilename(
  loanId: number,
  dateRange?: ExportDateRange
): string {
  const now = new Date();
  const dateStr = now.toISOString().split("T")[0]; // YYYY-MM-DD
  const timeStr = now.toTimeString().split(" ")[0].replace(/:/g, ""); // HHMMSS
  const rangePart = dateRange?.startDate || dateRange?.endDate
    ? `_${dateRange.startDate || "start"}_to_${dateRange.endDate || "end"}`
    : "";

  return `amortization_schedule_${loanId}${rangePart}_${dateStr}_${timeStr}.csv`;
}

/**
 * Convert CSV string to Blob for download
 */
export function createCSVBlob(csvContent: string): Blob {
  // Add BOM for UTF-8 encoding to support Thai characters properly.
  const BOM = "\uFEFF";
  return new Blob([BOM + csvContent], { type: "text/csv;charset=utf-8;" });
}

/**
 * Trigger download of CSV file
 */
export function downloadCSV(filename: string, csvContent: string): void {
  const blob = createCSVBlob(csvContent);
  const link = document.createElement("a");
  const url = URL.createObjectURL(blob);

  link.setAttribute("href", url);
  link.setAttribute("download", filename);
  link.style.visibility = "hidden";

  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);

  // Clean up the URL object.
  URL.revokeObjectURL(url);
}
