import { beforeEach, describe, expect, it, vi } from "vitest";

const recordNotificationPreferenceAudit = vi.hoisted(() => vi.fn(async () => true));
const getEffectiveExportPermissions = vi.hoisted(() => vi.fn());
const validateApprovedExportRequest = vi.hoisted(() => vi.fn());

vi.mock("./notificationPreferencesDb", () => ({ recordNotificationPreferenceAudit }));
vi.mock("./reportGovernanceDb", () => ({
  getEffectiveExportPermissions,
  validateApprovedExportRequest,
  getReportDownloads: vi.fn(async () => []),
  recordReportDownload: vi.fn(async () => ({ allowed: true })),
  getExportSecurityPolicy: vi.fn(async () => ({ approvalRowThreshold: 750 })),
  getOwnExportApprovalRequests: vi.fn(async () => []),
  getPendingExportApprovalRequests: vi.fn(async () => []),
  getRecentExportSecurityEvents: vi.fn(async () => []),
  requestHighSensitivityExport: vi.fn(),
  decideExportApprovalRequest: vi.fn(),
  runReportDownloadHistoryRetention: vi.fn(),
  saveExportSecurityPolicy: vi.fn(),
  saveExportPermissions: vi.fn(),
}));

import { adminRouter } from "./routers/adminRouter";

function caller(role: "admin" | "borrower") {
  return adminRouter.createCaller({ user: { id: 9, role, openId: role, name: role } as any, req: {} as any, res: {} as any } as any);
}

describe("Admin Audit Log PDF reference", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getEffectiveExportPermissions.mockResolvedValue({ canExportCsv: true, canExportPdf: true, canVerifyReferences: true, canViewTeamDownloadHistory: false, canManageExportPermissions: false });
    validateApprovedExportRequest.mockResolvedValue({ allowed: true, approvalRequestId: null });
  });

  it("records a unique safe reference only after the export policy gate passes", async () => {
    const result = await caller("admin").createAuditLogPdfExportReference({ rowCount: 6, filterSummary: "เดือนนี้" });
    expect(result.referenceCode).toMatch(/^AUD-\d{14}-[A-F0-9]{8}$/);
    expect(validateApprovedExportRequest).toHaveBeenCalledWith({ userId: 9, format: "pdf", rowCount: 6, filterSummary: "เดือนนี้", approvalRequestId: undefined });
    expect(recordNotificationPreferenceAudit).toHaveBeenCalledWith(9, "pdf_exported", [`reference:${result.referenceCode}`]);
  });

  it("rejects non-admin callers before checking policy or recording a reference", async () => {
    await expect(caller("borrower").createAuditLogPdfExportReference({ rowCount: 6, filterSummary: "" })).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(validateApprovedExportRequest).not.toHaveBeenCalled();
  });
});
