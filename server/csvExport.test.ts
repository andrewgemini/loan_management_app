import { describe, expect, it } from "vitest";
import {
  escapeCSV,
  filterAmortizationScheduleByDateRange,
  generateAmortizationCSV,
  generateCSVFilename,
} from "./csvExport";

describe("CSV export utilities", () => {
  const schedule = [
    {
      paymentNumber: 1,
      dueDate: "2026-01-15",
      startingBalance: "10000.00",
      principalDue: "800.00",
      interestDue: "100.00",
      totalPayment: "900.00",
      endingBalance: "9200.00",
    },
    {
      paymentNumber: 2,
      dueDate: "2026-02-15",
      startingBalance: "9200.00",
      principalDue: "820.00",
      interestDue: "80.00",
      totalPayment: "900.00",
      endingBalance: "8380.00",
    },
    {
      paymentNumber: 3,
      dueDate: "2026-03-15",
      startingBalance: "8380.00",
      principalDue: "840.00",
      interestDue: "60.00",
      totalPayment: "900.00",
      endingBalance: "7540.00",
    },
  ];

  it("filters rows inclusively by start and end dates", () => {
    const filtered = filterAmortizationScheduleByDateRange(schedule, {
      startDate: "2026-02-15",
      endDate: "2026-03-15",
    });

    expect(filtered.map((row) => row.paymentNumber)).toEqual([2, 3]);
  });

  it("supports an open-ended date range and leaves the original array unchanged", () => {
    const filtered = filterAmortizationScheduleByDateRange(schedule, {
      startDate: "2026-02-01",
    });

    expect(filtered).toHaveLength(2);
    expect(schedule).toHaveLength(3);
  });

  it("escapes commas, quotes, and newlines in CSV values", () => {
    expect(escapeCSV('สมชาย, ทดสอบ')).toBe('"สมชาย, ทดสอบ"');
    expect(escapeCSV('ชื่อ "ตัวอย่าง"')).toBe('"ชื่อ ""ตัวอย่าง"""');
    expect(escapeCSV("บรรทัดแรก\nบรรทัดสอง")).toBe('"บรรทัดแรก\nบรรทัดสอง"');
  });

  it("includes the selected date range in the CSV metadata and filename", () => {
    const csv = generateAmortizationCSV(
      {
        loanId: 42,
        borrowerName: "ผู้กู้ทดสอบ",
        principalAmount: "10,000.00",
        interestRate: "12.00",
        loanTermMonths: 3,
        startDate: "15/01/2569",
        endDate: "15/03/2569",
        interestType: "simple",
        paymentType: "reducing",
      },
      schedule.slice(1),
      { startDate: "2026-02-15", endDate: "2026-03-15" }
    );

    expect(csv).toContain("ช่วงวันที่ Export (Export Date Range)");
    expect(csv).toContain("2026-02-15 ถึง 2026-03-15");
    expect(csv).toContain("2,2026-02-15");
    expect(csv).not.toContain("1,2026-01-15");
    expect(generateCSVFilename(42, { startDate: "2026-02-15", endDate: "2026-03-15" })).toContain(
      "_2026-02-15_to_2026-03-15_"
    );
  });
});
