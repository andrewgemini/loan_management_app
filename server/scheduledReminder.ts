import type { Request, Response } from "express";
import { and, eq, gte, like, lte } from "drizzle-orm";
import { amortizationSchedules, loans, notifications, userLineTokens, users } from "../drizzle/schema";
import { getDb } from "./db";
import { sendEmail, getPaymentReminderEmailTemplate } from "./emailService";
import { sendLineNotify } from "./lineNotifyService";
import {
  shouldSendEmailPaymentReminder,
  shouldSendLinePaymentReminder,
} from "./notificationPreferencesDb";
import { sdk } from "./_core/sdk";

function toDateOnly(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function addDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setUTCDate(result.getUTCDate() + days);
  return result;
}

export async function sendUpcomingPaymentReminders(req: Request, res: Response) {
  try {
    const user = await sdk.authenticateRequest(req);
    if (!user.isCron) {
      return res.status(403).json({ error: "cron-only" });
    }

    const db = await getDb();
    if (!db) return res.status(503).json({ error: "database-unavailable" });

    const startDate = toDateOnly(new Date());
    const endDate = toDateOnly(addDays(new Date(), 3));
    const schedules = await db
      .select()
      .from(amortizationSchedules)
      .where(
        and(
          eq(amortizationSchedules.isPaid, false),
          gte(amortizationSchedules.dueDate, new Date(`${startDate}T00:00:00.000Z`)),
          lte(amortizationSchedules.dueDate, new Date(`${endDate}T00:00:00.000Z`))
        )
      );

    let sent = 0;
    let skipped = 0;

    for (const schedule of schedules) {
      const loanRows = await db.select().from(loans).where(eq(loans.id, schedule.loanId)).limit(1);
      const loan = loanRows[0];
      if (!loan) {
        skipped += 1;
        continue;
      }

      const borrowerRows = await db.select().from(users).where(eq(users.id, loan.borrowerId)).limit(1);
      const borrower = borrowerRows[0];
      if (!borrower) {
        skipped += 1;
        continue;
      }

      const dueDate = String(schedule.dueDate);
      const notificationMessage = `ใกล้ถึงกำหนดชำระสัญญา #${loan.id} งวดที่ ${schedule.paymentNumber} วันที่ ${dueDate}`;
      const existing = await db
        .select({ id: notifications.id })
        .from(notifications)
        .where(
          and(
            eq(notifications.userId, borrower.id),
            eq(notifications.type, "payment_due"),
            like(notifications.message, notificationMessage)
          )
        )
        .limit(1);

      if (existing.length > 0) {
        skipped += 1;
        continue;
      }

      await db.insert(notifications).values({
        userId: borrower.id,
        type: "payment_due",
        message: notificationMessage,
        sentVia: "in-app",
      });

      if (borrower.email && (await shouldSendEmailPaymentReminder(borrower.id))) {
        const email = getPaymentReminderEmailTemplate(
          borrower.name || "ผู้กู้",
          schedule.totalPaymentDue,
          dueDate,
          schedule.paymentNumber,
          loan.id
        );
        await sendEmail({
          to: borrower.email,
          subject: `แจ้งเตือนกำหนดชำระสัญญา #${loan.id}`,
          html: email,
          text: notificationMessage,
        });
      }

      if (await shouldSendLinePaymentReminder(borrower.id)) {
        const tokenRows = await db
          .select()
          .from(userLineTokens)
          .where(eq(userLineTokens.userId, borrower.id))
          .limit(1);
        const token = tokenRows[0]?.lineToken;
        if (token) {
          await sendLineNotify(token, {
            message: `⏰ แจ้งเตือนกำหนดชำระ\n\nสัญญา: #${loan.id}\nงวดที่: ${schedule.paymentNumber}\nจำนวน: ฿${schedule.totalPaymentDue}\nครบกำหนด: ${dueDate}`,
          });
        }
      }

      sent += 1;
    }

    return res.json({ ok: true, taskUid: user.taskUid ?? null, startDate, endDate, sent, skipped });
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown-error";
    return res.status(500).json({
      error: message,
      stack: error instanceof Error ? error.stack : undefined,
      context: { url: req.originalUrl, taskUid: req.headers["x-task-uid"] ?? null },
      timestamp: new Date().toISOString(),
    });
  }
}
