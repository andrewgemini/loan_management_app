import { desc, eq } from "drizzle-orm";
import { getDb } from "./db";
import { notificationPreferences, notificationPreferenceAuditLogs, NotificationPreference } from "../drizzle/schema";

export type NotificationPreferenceAuditAction = "read" | "updated" | "reset" | "line_connected" | "line_disconnected" | "pdf_exported";

export async function recordNotificationPreferenceAudit(
  userId: number,
  action: NotificationPreferenceAuditAction,
  changedFields: string[] = []
) : Promise<boolean> {
  const db = await getDb();
  if (!db) return false;
  await db.insert(notificationPreferenceAuditLogs).values({
    userId,
    action,
    changedFields: changedFields.join(","),
  });
  return true;
}

export async function getNotificationPreferenceAuditLogs(userId: number, limit = 8) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(notificationPreferenceAuditLogs)
    .where(eq(notificationPreferenceAuditLogs.userId, userId))
    .orderBy(desc(notificationPreferenceAuditLogs.createdAt))
    .limit(limit);
}

/**
 * ดึงการตั้งค่าการแจ้งเตือนของผู้ใช้
 */
export async function getNotificationPreferences(userId: number): Promise<NotificationPreference | undefined> {
  const db = await getDb();
  if (!db) return undefined;

  const result = await db
    .select()
    .from(notificationPreferences)
    .where(eq(notificationPreferences.userId, userId))
    .limit(1);

  return result.length > 0 ? result[0] : undefined;
}

/**
 * สร้างการตั้งค่าการแจ้งเตือนเริ่มต้นสำหรับผู้ใช้ใหม่
 */
export async function createDefaultNotificationPreferences(userId: number): Promise<NotificationPreference | undefined> {
  const db = await getDb();
  if (!db) return undefined;

  try {
    const result = await db.insert(notificationPreferences).values({
      userId,
      emailNewLoanRequest: true,
      emailLoanApproval: true,
      emailLoanRejection: true,
      emailPaymentReminder: true,
      emailPaymentConfirmation: true,
      lineNewLoanRequest: true,
      lineLoanApproval: true,
      lineLoanRejection: true,
      linePaymentReminder: true,
      linePaymentConfirmation: true,
    });

    return await getNotificationPreferences(userId);
  } catch (error) {
    console.error("[NotificationPreferences] Failed to create default preferences:", error);
    return undefined;
  }
}

/**
 * อัปเดตการตั้งค่าการแจ้งเตือน
 */
export async function updateNotificationPreferences(
  userId: number,
  updates: Partial<Omit<NotificationPreference, "id" | "userId" | "createdAt" | "updatedAt">>
): Promise<NotificationPreference | undefined> {
  const db = await getDb();
  if (!db) return undefined;

  try {
    // ตรวจสอบว่ามีการตั้งค่าอยู่หรือไม่
    let prefs = await getNotificationPreferences(userId);

    if (!prefs) {
      // ถ้าไม่มี ให้สร้างใหม่
      prefs = await createDefaultNotificationPreferences(userId);
      if (!prefs) return undefined;
    }

    // อัปเดตการตั้งค่า
    await db
      .update(notificationPreferences)
      .set(updates)
      .where(eq(notificationPreferences.userId, userId));

    return await getNotificationPreferences(userId);
  } catch (error) {
    console.error("[NotificationPreferences] Failed to update preferences:", error);
    return undefined;
  }
}

/**
 * ตรวจสอบว่าควรส่งแจ้งเตือนอีเมลสำหรับคำขอกู้ใหม่หรือไม่
 */
export async function shouldSendEmailNewLoanRequest(userId: number): Promise<boolean> {
  const prefs = await getNotificationPreferences(userId);
  if (!prefs) {
    // ถ้าไม่มีการตั้งค่า ให้สร้างเริ่มต้น
    const newPrefs = await createDefaultNotificationPreferences(userId);
    return newPrefs?.emailNewLoanRequest ?? true;
  }
  return prefs.emailNewLoanRequest;
}

/**
 * ตรวจสอบว่าควรส่งแจ้งเตือนอีเมลสำหรับการอนุมัติหรือไม่
 */
export async function shouldSendEmailLoanApproval(userId: number): Promise<boolean> {
  const prefs = await getNotificationPreferences(userId);
  if (!prefs) {
    const newPrefs = await createDefaultNotificationPreferences(userId);
    return newPrefs?.emailLoanApproval ?? true;
  }
  return prefs.emailLoanApproval;
}

/**
 * ตรวจสอบว่าควรส่งแจ้งเตือนอีเมลสำหรับการปฏิเสธหรือไม่
 */
export async function shouldSendEmailLoanRejection(userId: number): Promise<boolean> {
  const prefs = await getNotificationPreferences(userId);
  if (!prefs) {
    const newPrefs = await createDefaultNotificationPreferences(userId);
    return newPrefs?.emailLoanRejection ?? true;
  }
  return prefs.emailLoanRejection;
}

/**
 * ตรวจสอบว่าควรส่งแจ้งเตือนอีเมลสำหรับการชำระเงินหรือไม่
 */
export async function shouldSendEmailPaymentReminder(userId: number): Promise<boolean> {
  const prefs = await getNotificationPreferences(userId);
  if (!prefs) {
    const newPrefs = await createDefaultNotificationPreferences(userId);
    return newPrefs?.emailPaymentReminder ?? true;
  }
  return prefs.emailPaymentReminder;
}

/**
 * ตรวจสอบว่าควรส่งแจ้งเตือน LINE สำหรับคำขอกู้ใหม่หรือไม่
 */
export async function shouldSendLineNewLoanRequest(userId: number): Promise<boolean> {
  const prefs = await getNotificationPreferences(userId);
  if (!prefs) {
    const newPrefs = await createDefaultNotificationPreferences(userId);
    return newPrefs?.lineNewLoanRequest ?? true;
  }
  return prefs.lineNewLoanRequest;
}

/**
 * ตรวจสอบว่าควรส่งแจ้งเตือน LINE สำหรับการอนุมัติหรือไม่
 */
export async function shouldSendLineLoanApproval(userId: number): Promise<boolean> {
  const prefs = await getNotificationPreferences(userId);
  if (!prefs) {
    const newPrefs = await createDefaultNotificationPreferences(userId);
    return newPrefs?.lineLoanApproval ?? true;
  }
  return prefs.lineLoanApproval;
}

/**
 * ตรวจสอบว่าควรส่งแจ้งเตือน LINE สำหรับการปฏิเสธหรือไม่
 */
export async function shouldSendLineLoanRejection(userId: number): Promise<boolean> {
  const prefs = await getNotificationPreferences(userId);
  if (!prefs) {
    const newPrefs = await createDefaultNotificationPreferences(userId);
    return newPrefs?.lineLoanRejection ?? true;
  }
  return prefs.lineLoanRejection;
}

/**
 * ตรวจสอบว่าควรส่งแจ้งเตือน LINE สำหรับการชำระเงินหรือไม่
 */
export async function shouldSendLinePaymentReminder(userId: number): Promise<boolean> {
  const prefs = await getNotificationPreferences(userId);
  if (!prefs) {
    const newPrefs = await createDefaultNotificationPreferences(userId);
    return newPrefs?.linePaymentReminder ?? true;
  }
  return prefs.linePaymentReminder;
}
