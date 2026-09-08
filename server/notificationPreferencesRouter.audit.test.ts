import { beforeEach, describe, expect, it, vi } from "vitest";

const dbMock = vi.hoisted(() => ({
  getNotificationPreferences: vi.fn(),
  createDefaultNotificationPreferences: vi.fn(),
  updateNotificationPreferences: vi.fn(),
  getNotificationPreferenceAuditLogs: vi.fn(),
  recordNotificationPreferenceAudit: vi.fn(),
}));

vi.mock("./notificationPreferencesDb", () => dbMock);

import { notificationPreferencesRouter } from "./routers/notificationPreferencesRouter";

const preferences = {
  id: 1, userId: 51,
  emailNewLoanRequest: true, emailLoanApproval: true, emailLoanRejection: true, emailPaymentReminder: true, emailPaymentConfirmation: true,
  lineNewLoanRequest: true, lineLoanApproval: true, lineLoanRejection: true, linePaymentReminder: true, linePaymentConfirmation: true,
  createdAt: new Date(), updatedAt: new Date(),
};

function caller(userId = 51) {
  return notificationPreferencesRouter.createCaller({ user: { id: userId, role: "borrower", openId: `user-${userId}`, name: "ผู้ใช้" } as any, req: {} as any, res: {} as any } as any);
}

describe("notification preferences audit router", () => {
  beforeEach(() => {
    Object.values(dbMock).forEach((mock) => mock.mockReset());
    dbMock.getNotificationPreferences.mockResolvedValue(preferences);
    dbMock.updateNotificationPreferences.mockResolvedValue(preferences);
    dbMock.getNotificationPreferenceAuditLogs.mockResolvedValue([]);
    dbMock.recordNotificationPreferenceAudit.mockResolvedValue(undefined);
  });

  it("records a read event for the authenticated account", async () => {
    await expect(caller().getPreferences()).resolves.toEqual(preferences);
    expect(dbMock.recordNotificationPreferenceAudit).toHaveBeenCalledWith(51, "read");
  });

  it("records only changed field names after a successful update", async () => {
    await expect(caller().updatePreferences({ emailLoanApproval: false, linePaymentReminder: false })).resolves.toEqual(preferences);
    expect(dbMock.updateNotificationPreferences).toHaveBeenCalledWith(51, { emailLoanApproval: false, linePaymentReminder: false });
    expect(dbMock.recordNotificationPreferenceAudit).toHaveBeenCalledWith(51, "updated", ["emailLoanApproval", "linePaymentReminder"]);
  });

  it("scopes audit history to the authenticated account regardless of requested limit", async () => {
    const logs = [{ id: 1, userId: 51, action: "updated", changedFields: "emailLoanApproval", createdAt: new Date() }];
    dbMock.getNotificationPreferenceAuditLogs.mockResolvedValue(logs);
    await expect(caller(51).getAuditLogs({ limit: 5 })).resolves.toEqual(logs);
    expect(dbMock.getNotificationPreferenceAuditLogs).toHaveBeenCalledWith(51, 5);
  });
});
