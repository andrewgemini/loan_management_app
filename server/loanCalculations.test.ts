import { describe, expect, it } from "vitest";
import {
  calculateCompoundInterest,
  calculateFixedMonthlyPayment,
  calculateSimpleInterest,
  calculateTotalPayment,
  generateAmortizationSchedule,
  calculateOutstandingBalance,
} from "./loanCalculations";

const params = {
  principal: 12000,
  annualRate: 12,
  months: 12,
  interestType: "simple" as const,
  paymentType: "reducing" as const,
};

describe("loan calculations", () => {
  it("calculates simple and compound interest", () => {
    expect(calculateSimpleInterest(12000, 12, 12)).toBeCloseTo(1440, 8);
    expect(calculateCompoundInterest(12000, 12, 12)).toBeGreaterThan(1440);
    expect(calculateTotalPayment(12000, 1440)).toBe(13440);
  });

  it("calculates zero-rate fixed payment without division by zero", () => {
    expect(calculateFixedMonthlyPayment(12000, 0, 12)).toBe(1000);
  });

  it("creates a reducing schedule with a declining balance", () => {
    const schedule = generateAmortizationSchedule(params, new Date("2026-01-01T00:00:00.000Z"));
    expect(schedule).toHaveLength(12);
    expect(schedule[0]?.startingBalance).toBe(12000);
    expect(schedule[0]?.endingBalance).toBeLessThan(12000);
    expect(schedule[11]?.endingBalance).toBeCloseTo(0, 8);
    expect(calculateOutstandingBalance(schedule, 0)).toBe(12000);
    expect(calculateOutstandingBalance(schedule, 12)).toBe(0);
  });

  it("creates a fixed-payment schedule with the requested number of periods", () => {
    const schedule = generateAmortizationSchedule(
      { ...params, paymentType: "fixed" },
      new Date("2026-01-01T00:00:00.000Z")
    );
    expect(schedule).toHaveLength(12);
    expect(schedule[0]?.totalPayment).toBeCloseTo(schedule[1]?.totalPayment ?? 0, 8);
    expect(schedule[11]?.endingBalance).toBeCloseTo(0, 8);
  });
});
