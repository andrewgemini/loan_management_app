import { beforeEach, describe, expect, it, vi } from "vitest";

const getEffectiveExportPermissions = vi.hoisted(() => vi.fn());
const getExportSecurityPolicy = vi.hoisted(() => vi.fn());
const validateApprovedExportRequest = vi.hoisted(() => vi.fn());
const recordReportDownload = vi.hoisted(() => vi.fn());
const requestHighSensitivityExport = vi.hoisted(() => vi.fn());
const decideExportApprovalRequest = vi.hoisted(() => vi.fn());
const runReportDownloadHistoryRetention = vi.hoisted(() => vi.fn());
const getGovernanceAnalytics = vi.hoisted(() => vi.fn());
const recordNotificationPreferenceAudit = vi.hoisted(() => vi.fn(async () => true));

vi.mock("./reportGovernanceDb", () => ({
  getEffectiveExportPermissions,
  getExportSecurityPolicy,
  validateApprovedExportRequest,
  recordReportDownload,
  requestHighSensitivityExport,
  decideExportApprovalRequest,
  runReportDownloadHistoryRetention,
  getGovernanceAnalytics,
  getOwnExportApprovalRequests: vi.fn(async () => []),
  getPendingExportApprovalRequests: vi.fn(async () => []),
  getRecentExportSecurityEvents: vi.fn(async () => []),
  getReportDownloads: vi.fn(async () => []),
  saveExportPermissions: vi.fn(async () => undefined),
  saveExportSecurityPolicy: vi.fn(async () => undefined),
}));
vi.mock("./notificationPreferencesDb", () => ({ recordNotificationPreferenceAudit }));
vi.mock("./db", () => ({ getDb: vi.fn(async () => null) }));

import { adminRouter } from "./routers/adminRouter";

function caller(role: "admin" | "borrower", id = 17) {
  return adminRouter.createCaller({ user: { id, role, openId: role, name: role } as any, req: {} as any, res: {} as any } as any);
}

const denied = { canExportCsv: false, canExportPdf: false, canVerifyReferences: false, canViewTeamDownloadHistory: false, canManageExportPermissions: false };
const allowed = { canExportCsv: true, canExportPdf: true, canVerifyReferences: true, canViewTeamDownloadHistory: false, canManageExportPermissions: false };
const manager = { ...allowed, canManageExportPermissions: true };
const policy = { highVolumeRowThreshold: 500, approvalRowThreshold: 750, retentionDays: 365, approvalExpiresHours: 24, alertOwnerOnHighVolume: true, updatedAt: null };

describe("Report export governance router", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getExportSecurityPolicy.mockResolvedValue(policy);
    validateApprovedExportRequest.mockResolvedValue({ allowed: true, policy, approvalRequestId: null });
    recordReportDownload.mockResolvedValue({ allowed: true, policy, approvalRequestId: null });
    requestHighSensitivityExport.mockResolvedValue({ requestId: 1, expiresAt: new Date("2026-08-26T12:00:00.000Z") });
    runReportDownloadHistoryRetention.mockResolvedValue({ cutoff: new Date(), deletedHistory: 0, deletedEvents: 0, deletedRequests: 0 });
    getGovernanceAnalytics.mockResolvedValue({ days: 30, from: new Date(), daily: [], severity: { info: 0, warning: 0, high: 0 } });
  });

  it("denies exports for non-admins and accounts without the relevant format permission", async () => {
    await expect(caller("borrower").recordAuditLogDownload({ format: "csv", rowCount: 3, filterSummary: "" })).rejects.toMatchObject({ code: "FORBIDDEN" });
    getEffectiveExportPermissions.mockResolvedValueOnce(denied);
    await expect(caller("admin").recordAuditLogDownload({ format: "pdf", rowCount: 3, filterSummary: "" })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("records metadata only against the authenticated admin after the server export gate", async () => {
    getEffectiveExportPermissions.mockResolvedValueOnce(allowed);
    await expect(caller("admin", 23).recordAuditLogDownload({ format: "pdf", rowCount: 6, filterSummary: "เดือนนี้", referenceCode: "AUD-20260825123456-AB12CD34" })).resolves.toEqual({ success: true });
    expect(recordReportDownload).toHaveBeenCalledWith({ userId: 23, format: "pdf", rowCount: 6, filterSummary: "เดือนนี้", referenceCode: "AUD-20260825123456-AB12CD34" });
  });

  it("blocks high sensitivity downloads until an approval exists", async () => {
    getEffectiveExportPermissions.mockResolvedValueOnce(allowed);
    recordReportDownload.mockResolvedValueOnce({ allowed: false, reason: "approval_required" });
    await expect(caller("admin").recordAuditLogDownload({ format: "csv", rowCount: 800, filterSummary: "เดือนนี้" })).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });
  });

  it("only opens approval requests for exports at or above the policy threshold", async () => {
    getEffectiveExportPermissions.mockResolvedValueOnce(allowed);
    await expect(caller("admin").requestHighSensitivityAuditLogExport({ format: "csv", rowCount: 500, filterSummary: "" })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    getEffectiveExportPermissions.mockResolvedValueOnce(allowed);
    await expect(caller("admin", 23).requestHighSensitivityAuditLogExport({ format: "pdf", rowCount: 800, filterSummary: "เดือนนี้" })).resolves.toMatchObject({ requestId: 1 });
    expect(requestHighSensitivityExport).toHaveBeenCalledWith({ userId: 23, format: "pdf", rowCount: 800, filterSummary: "เดือนนี้" });
  });

  it("prevents self approval and permits a separately authorized manager decision", async () => {
    getEffectiveExportPermissions.mockResolvedValueOnce(manager);
    decideExportApprovalRequest.mockResolvedValueOnce({ outcome: "self_approval" });
    await expect(caller("admin", 17).decideExportApprovalRequest({ requestId: 10, approve: true })).rejects.toMatchObject({ code: "FORBIDDEN" });
    getEffectiveExportPermissions.mockResolvedValueOnce(manager);
    decideExportApprovalRequest.mockResolvedValueOnce({ outcome: "decided", status: "approved" });
    await expect(caller("admin", 21).decideExportApprovalRequest({ requestId: 10, approve: true, reviewerNote: "verified" })).resolves.toEqual({ success: true, status: "approved" });
  });

  it("limits policy/retention operations to export managers and calls cleanup with their identity", async () => {
    getEffectiveExportPermissions.mockResolvedValueOnce(allowed);
    await expect(caller("admin").runDownloadHistoryRetentionCleanup()).rejects.toMatchObject({ code: "FORBIDDEN" });
    getEffectiveExportPermissions.mockResolvedValueOnce(manager);
    await expect(caller("admin", 21).runDownloadHistoryRetentionCleanup()).resolves.toMatchObject({ deletedHistory: 0 });
    expect(runReportDownloadHistoryRetention).toHaveBeenCalledWith(21);
  });

  it("limits governance analytics to export managers and returns only server aggregates", async () => {
    getEffectiveExportPermissions.mockResolvedValueOnce(allowed);
    await expect(caller("admin").getGovernanceAnalytics({ days: 30 })).rejects.toMatchObject({ code: "FORBIDDEN" });
    getEffectiveExportPermissions.mockResolvedValueOnce(manager);
    await expect(caller("admin").getGovernanceAnalytics({ days: 30 })).resolves.toMatchObject({ days: 30, severity: { high: 0 } });
    expect(getGovernanceAnalytics).toHaveBeenCalledWith(30);
  });

  it("enforces PDF permission and the high-sensitivity gate before issuing a reference", async () => {
    getEffectiveExportPermissions.mockResolvedValueOnce(denied);
    await expect(caller("admin").createAuditLogPdfExportReference({ rowCount: 1, filterSummary: "" })).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(recordNotificationPreferenceAudit).not.toHaveBeenCalled();
    getEffectiveExportPermissions.mockResolvedValueOnce(allowed);
    validateApprovedExportRequest.mockResolvedValueOnce({ allowed: false, reason: "approval_required" });
    await expect(caller("admin").createAuditLogPdfExportReference({ rowCount: 800, filterSummary: "ทั้งหมด" })).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });
  });
});
