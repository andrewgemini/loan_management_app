import { beforeEach, describe, expect, it, vi } from "vitest";

const dbMock = vi.hoisted(() => ({ getDb: vi.fn() }));
const sdkMock = vi.hoisted(() => ({ authenticateRequest: vi.fn() }));
const emailMock = vi.hoisted(() => ({ sendEmail: vi.fn(), getPaymentReminderEmailTemplate: vi.fn() }));
const lineMock = vi.hoisted(() => ({ sendLineNotify: vi.fn() }));
const preferenceMock = vi.hoisted(() => ({
  shouldSendEmailPaymentReminder: vi.fn(),
  shouldSendLinePaymentReminder: vi.fn(),
}));

vi.mock("./db", () => dbMock);
vi.mock("./_core/sdk", () => ({ sdk: sdkMock }));
vi.mock("./emailService", () => emailMock);
vi.mock("./lineNotifyService", () => lineMock);
vi.mock("./notificationPreferencesDb", () => preferenceMock);

import { sendUpcomingPaymentReminders } from "./scheduledReminder";

function createResponse() {
  const response = { status: vi.fn(), json: vi.fn() } as any;
  response.status.mockReturnValue(response);
  return response;
}

function createDb(existingNotifications: unknown[] = []) {
  const schedule = {
    loanId: 77,
    paymentNumber: 1,
    dueDate: "2026-08-23",
    totalPaymentDue: "2500.00",
    isPaid: false,
  };
  const loan = { id: 77, borrowerId: 11 };
  const borrower = { id: 11, name: "ผู้กู้ทดสอบ", email: "borrower@example.com" };
  const db = {
    select: vi.fn()
      .mockImplementationOnce(() => ({ from: () => ({ where: () => [schedule] }) }))
      .mockImplementationOnce(() => ({ from: () => ({ where: () => ({ limit: async () => [loan] }) }) }))
      .mockImplementationOnce(() => ({ from: () => ({ where: () => ({ limit: async () => [borrower] }) }) }))
      .mockImplementationOnce(() => ({ from: () => ({ where: () => ({ limit: async () => existingNotifications }) }) }))
      .mockImplementationOnce(() => ({ from: () => ({ where: () => ({ limit: async () => [{ lineToken: "line-token" }] }) }) })),
    insert: vi.fn(() => ({ values: vi.fn().mockResolvedValue(undefined) })),
  };
  return db;
}

describe("scheduled payment reminders", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sdkMock.authenticateRequest.mockResolvedValue({ isCron: true, taskUid: "task-1" });
    emailMock.getPaymentReminderEmailTemplate.mockReturnValue("<p>reminder</p>");
    emailMock.sendEmail.mockResolvedValue(true);
    lineMock.sendLineNotify.mockResolvedValue(true);
    preferenceMock.shouldSendEmailPaymentReminder.mockResolvedValue(true);
    preferenceMock.shouldSendLinePaymentReminder.mockResolvedValue(true);
  });

  it("rejects non-cron callers", async () => {
    sdkMock.authenticateRequest.mockResolvedValue({ isCron: false });
    const response = createResponse();

    await sendUpcomingPaymentReminders({} as any, response);

    expect(response.status).toHaveBeenCalledWith(403);
    expect(response.json).toHaveBeenCalledWith({ error: "cron-only" });
  });

  it("creates in-app notification and sends enabled email and LINE reminders", async () => {
    const db = createDb();
    dbMock.getDb.mockResolvedValue(db);
    const response = createResponse();

    await sendUpcomingPaymentReminders({ originalUrl: "/api/scheduled/payment-reminders", headers: {} } as any, response);

    expect(db.insert).toHaveBeenCalledTimes(1);
    expect(emailMock.sendEmail).toHaveBeenCalledWith(expect.objectContaining({ to: "borrower@example.com" }));
    expect(lineMock.sendLineNotify).toHaveBeenCalledWith("line-token", expect.objectContaining({ message: expect.stringContaining("สัญญา: #77") }));
    expect(response.json).toHaveBeenCalledWith(expect.objectContaining({ ok: true, sent: 1, skipped: 0 }));
  });

  it("skips an already-created reminder and does not send again", async () => {
    const db = createDb([{ id: 123 }]);
    dbMock.getDb.mockResolvedValue(db);
    const response = createResponse();

    await sendUpcomingPaymentReminders({ originalUrl: "/api/scheduled/payment-reminders", headers: {} } as any, response);

    expect(db.insert).not.toHaveBeenCalled();
    expect(emailMock.sendEmail).not.toHaveBeenCalled();
    expect(lineMock.sendLineNotify).not.toHaveBeenCalled();
    expect(response.json).toHaveBeenCalledWith(expect.objectContaining({ ok: true, sent: 0, skipped: 1 }));
  });
});
