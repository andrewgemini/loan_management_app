import { beforeEach, describe, expect, it, vi } from "vitest";

const mockedSendMail = vi.hoisted(() => vi.fn());

vi.mock("nodemailer", () => ({
  default: {
    createTransport: vi.fn(() => ({ sendMail: mockedSendMail })),
  },
}));

import {
  getPaymentReminderEmailTemplate,
  initializeEmailService,
  resetEmailService,
  sendEmail,
} from "./emailService";

describe("emailService", () => {
  beforeEach(() => {
    mockedSendMail.mockReset();
    resetEmailService();
  });

  it("returns false when SMTP transporter has not been initialized", async () => {
    const result = await sendEmail({
      to: "test@example.com",
      subject: "test",
      html: "<p>test</p>",
    });

    expect(result).toBe(false);
    expect(mockedSendMail).not.toHaveBeenCalled();
  });

  it("sends through the configured transporter", async () => {
    mockedSendMail.mockResolvedValue({ messageId: "test-message-id" });
    initializeEmailService({
      host: "smtp.test.local",
      port: 587,
      secure: false,
      auth: { user: "mailer", pass: "secret" },
      from: "mailer@example.com",
    });

    const result = await sendEmail({
      to: "borrower@example.com",
      subject: "แจ้งเตือน",
      html: "<p>hello</p>",
      text: "hello",
    });

    expect(result).toBe(true);
    expect(mockedSendMail).toHaveBeenCalledWith(expect.objectContaining({
      to: "borrower@example.com",
      subject: "แจ้งเตือน",
      html: "<p>hello</p>",
    }));
  });

  it("renders the payment reminder details in Thai", () => {
    const html = getPaymentReminderEmailTemplate("ผู้กู้ทดสอบ", "5500.00", "2026-09-01", 2, 10);

    expect(html).toContain("ผู้กู้ทดสอบ");
    expect(html).toContain("สัญญา #10");
    expect(html).toContain("งวดที่ 2");
    expect(html).toContain("5500.00");
    expect(html).toContain("2026-09-01");
  });
});
