import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

function source(path: string) {
  return readFileSync(new URL(`../client/src/pages/${path}`, import.meta.url), "utf8");
}

describe("protected route fallbacks", () => {
  it("renders an access explanation for non-borrowers on the create-loan route", () => {
    const createLoan = source("CreateLoanRequest.tsx");
    expect(createLoan).toContain("สร้างคำขอกู้ได้เฉพาะผู้กู้");
    expect(createLoan).not.toContain('if (!user || user.role !== "borrower") {\n    return null;');
  });

  it("defers protected dashboard and loan queries until a user is available", () => {
    expect(source("Dashboard.tsx")).toContain("enabled: Boolean(user)");
    expect(source("LoanDetail.tsx")).toContain("enabled: Boolean(user) && loanId > 0");
    expect(source("LoanDetail.tsx")).toContain("ไม่สามารถเปิดรายละเอียดสัญญา");
  });
});
