import { describe, expect, it } from "vitest";
import {
  calculatePaymentBarHeight,
  canAccessAdminDashboard,
  getPaymentTrendViewState,
  hasPaymentTrendData,
  hasDecisionReason,
  getDecisionButtonLabel,
} from "../client/src/lib/adminDashboardUtils";

describe("AdminDashboard helpers", () => {
  it("allows only the admin role to access the dashboard", () => {
    expect(canAccessAdminDashboard("admin")).toBe(true);
    expect(canAccessAdminDashboard("borrower")).toBe(false);
    expect(canAccessAdminDashboard("lender")).toBe(false);
    expect(canAccessAdminDashboard(undefined)).toBe(false);
  });

  it("recognizes usable and empty payment trend data", () => {
    expect(hasPaymentTrendData({ labels: ["ม.ค."], data: [1200] })).toBe(true);
    expect(hasPaymentTrendData({ labels: [], data: [] })).toBe(false);
    expect(hasPaymentTrendData(undefined)).toBe(false);
    expect(getPaymentTrendViewState({ labels: [], data: [] })).toBe("empty");
    expect(getPaymentTrendViewState(undefined)).toBe("empty");
    expect(getPaymentTrendViewState({ labels: ["ม.ค."], data: [1200] })).toBe("chart");
  });

  it("scales payment bars safely, including zero-value months", () => {
    expect(calculatePaymentBarHeight(500, [500, 250])).toBe(100);
    expect(calculatePaymentBarHeight(0, [500, 250])).toBe(3);
    expect(calculatePaymentBarHeight(1, [0, 0])).toBe(100);
  });

  it("requires a non-empty decision reason", () => {
    expect(hasDecisionReason("   ")).toBe(false);
    expect(hasDecisionReason("หลักฐานไม่ครบ")).toBe(true);
  });

  it("provides labels for admin decisions", () => {
    expect(getDecisionButtonLabel("approve")).toBe("อนุมัติ");
    expect(getDecisionButtonLabel("verify")).toBe("ยืนยัน");
    expect(getDecisionButtonLabel("reject")).toBe("ปฏิเสธ");
  });
});
