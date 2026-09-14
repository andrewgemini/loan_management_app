import { eq, and, desc, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { InsertUser, users, loanRequests, loans, amortizationSchedules, loanPayments, notifications, activityHistoryFilterPresets } from "../drizzle/schema";
import { ENV } from './_core/env';

let _db: ReturnType<typeof drizzle> | null = null;

// Lazily create the drizzle instance so local tooling can run without a DB.
export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      const pool = new Pool({ connectionString: process.env.DATABASE_URL });
      _db = drizzle(pool);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) {
    throw new Error("User openId is required for upsert");
  }

  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot upsert user: database not available");
    return;
  }

  try {
    const values: InsertUser = {
      openId: user.openId,
    };
    const updateSet: Record<string, unknown> = {};

    const textFields = ["name", "email", "loginMethod"] as const;
    type TextField = (typeof textFields)[number];

    const assignNullable = (field: TextField) => {
      const value = user[field];
      if (value === undefined) return;
      const normalized = value ?? null;
      values[field] = normalized;
      updateSet[field] = normalized;
    };

    textFields.forEach(assignNullable);

    if (user.lastSignedIn !== undefined) {
      values.lastSignedIn = user.lastSignedIn;
      updateSet.lastSignedIn = user.lastSignedIn;
    }
    if (user.role !== undefined) {
      values.role = user.role;
      updateSet.role = user.role;
    } else if (user.openId === ENV.ownerOpenId) {
      values.role = 'admin';
      updateSet.role = 'admin';
    }

    if (!values.lastSignedIn) {
      values.lastSignedIn = new Date();
    }

    if (Object.keys(updateSet).length === 0) {
      updateSet.lastSignedIn = new Date();
    }

    await db.insert(users).values(values).onConflictDoUpdate({
      target: users.openId,
      set: updateSet,
    });
  } catch (error) {
    console.error("[Database] Failed to upsert user:", error);
    throw error;
  }
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot get user: database not available");
    return undefined;
  }

  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);

  return result.length > 0 ? result[0] : undefined;
}

export async function getUserById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(users).where(eq(users.id, id)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

export async function updateUserAvatarUrl(userId: number, avatarUrl: string) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(users).set({ avatarUrl, updatedAt: new Date() }).where(eq(users.id, userId));
}

export async function clearUserAvatarUrl(userId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(users).set({ avatarUrl: null, updatedAt: new Date() }).where(eq(users.id, userId));
}

export async function getActivityHistoryFilterPresets(userId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  return db.select().from(activityHistoryFilterPresets).where(eq(activityHistoryFilterPresets.userId, userId)).orderBy(desc(activityHistoryFilterPresets.updatedAt));
}

export async function saveActivityHistoryFilterPreset(userId: number, data: {
  name: string; startDate: string; endDate: string; eventType: string; actorName: string; actorRole: string; lenderId: number | null;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const existing = await db.select({ id: activityHistoryFilterPresets.id }).from(activityHistoryFilterPresets).where(and(eq(activityHistoryFilterPresets.userId, userId), eq(activityHistoryFilterPresets.name, data.name))).limit(1);
  if (existing[0]) {
    await db.update(activityHistoryFilterPresets).set({ ...data, updatedAt: new Date() }).where(eq(activityHistoryFilterPresets.id, existing[0].id));
    return existing[0].id;
  }
  const result = await db.insert(activityHistoryFilterPresets).values({ userId, ...data }).returning({ id: activityHistoryFilterPresets.id });
  return result[0]?.id ?? 0;
}

export async function deleteActivityHistoryFilterPreset(userId: number, id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.delete(activityHistoryFilterPresets).where(and(eq(activityHistoryFilterPresets.id, id), eq(activityHistoryFilterPresets.userId, userId)));
}

// ===== Loan Request Functions =====

export async function createLoanRequest(data: {
  borrowerId: number;
  amountRequested: string;
  interestRate: string;
  loanTermMonths: number;
  interestType: "simple" | "compound";
  paymentType: "fixed" | "reducing";
}) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  const result = await db.insert(loanRequests).values(data);
  return result;
}

export async function getLoanRequestById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(loanRequests).where(eq(loanRequests.id, id)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

export async function getLoanRequestsByBorrower(borrowerId: number) {
  const db = await getDb();
  if (!db) return [];
  return await db.select().from(loanRequests)
    .where(eq(loanRequests.borrowerId, borrowerId))
    .orderBy(desc(loanRequests.requestedAt));
}

export async function getPendingLoanRequests() {
  const db = await getDb();
  if (!db) return [];
  return await db.select().from(loanRequests)
    .where(eq(loanRequests.status, "pending"))
    .orderBy(desc(loanRequests.requestedAt));
}

export async function approveLoanRequest(requestId: number, approvedById: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  const request = await getLoanRequestById(requestId);
  if (!request) throw new Error("Loan request not found");
  
  const decidedAt = new Date();
  await db.update(loanRequests)
    .set({ status: "approved", approvedById, approvedAt: decidedAt, decidedAt })
    .where(eq(loanRequests.id, requestId));
  
  return request;
}

export async function rejectLoanRequest(requestId: number, approvedById: number, reason: string) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  const decidedAt = new Date();
  await db.update(loanRequests)
    .set({ status: "rejected", approvedById, approvedAt: decidedAt, decidedAt, rejectionReason: reason })
    .where(eq(loanRequests.id, requestId));
}

// ===== Loan Functions =====

export async function createLoan(data: {
  requestId: number;
  borrowerId: number;
  lenderId: number;
  principalAmount: string;
  interestRate: string;
  loanTermMonths: number;
  interestType: "simple" | "compound";
  paymentType: "fixed" | "reducing";
  startDate: Date;
  nextPaymentDate: Date;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  const result = await db.insert(loans).values(data).returning({ id: loans.id });
  return { insertId: result[0]?.id ?? 0 };
}

export async function getLoanById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(loans).where(eq(loans.id, id)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

export async function getLoansByBorrower(borrowerId: number) {
  const db = await getDb();
  if (!db) return [];
  return await db.select().from(loans)
    .where(eq(loans.borrowerId, borrowerId))
    .orderBy(desc(loans.createdAt));
}

export async function getLoansByLender(lenderId: number) {
  const db = await getDb();
  if (!db) return [];
  return await db.select().from(loans)
    .where(eq(loans.lenderId, lenderId))
    .orderBy(desc(loans.createdAt));
}

// ===== Amortization Schedule Functions =====

export async function createAmortizationSchedules(schedules: Array<{
  loanId: number;
  paymentNumber: number;
  dueDate: Date;
  startingBalance: string;
  principalDue: string;
  interestDue: string;
  totalPaymentDue: string;
  endingBalance: string;
}>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  return await db.insert(amortizationSchedules).values(schedules);
}

export async function getAmortizationSchedule(loanId: number) {
  const db = await getDb();
  if (!db) return [];
  return await db.select().from(amortizationSchedules)
    .where(eq(amortizationSchedules.loanId, loanId))
    .orderBy(amortizationSchedules.paymentNumber);
}

// ===== Loan Payment Functions =====

export async function createLoanPayment(data: {
  loanId: number;
  scheduleId?: number;
  amountPaid: string;
  paymentMethod: string;
  slipPath?: string;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  return await db.insert(loanPayments).values(data);
}

export async function getLoanPayments(loanId: number) {
  const db = await getDb();
  if (!db) return [];
  return await db.select().from(loanPayments)
    .where(eq(loanPayments.loanId, loanId))
    .orderBy(desc(loanPayments.paymentDate));
}

export async function getPendingPaymentVerifications() {
  const db = await getDb();
  if (!db) return [];
  return await db.select().from(loanPayments)
    .where(eq(loanPayments.status, "pending"))
    .orderBy(desc(loanPayments.createdAt));
}

export async function verifyPayment(paymentId: number, verifiedById: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  await db.update(loanPayments)
    .set({ status: "verified", verifiedById, verifiedAt: new Date() })
    .where(eq(loanPayments.id, paymentId));
}

export async function rejectPayment(paymentId: number, verifiedById: number, reason: string) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  await db.update(loanPayments)
    .set({ status: "rejected", verifiedById, verifiedAt: new Date(), rejectionReason: reason })
    .where(eq(loanPayments.id, paymentId));
}

export async function getPaymentById(paymentId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const results = await db.select().from(loanPayments).where(eq(loanPayments.id, paymentId)).limit(1);
  return results[0] ?? null;
}

// ===== Notification Functions =====

export async function createNotification(data: {
  userId: number;
  type: "payment_due" | "loan_status" | "payment_verified" | "loan_approved" | "loan_rejected" | "export_approval_pending";
  message: string;
  sentVia: "in-app" | "email" | "line";
}) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  return await db.insert(notifications).values(data);
}

export async function getUserNotifications(userId: number) {
  const db = await getDb();
  if (!db) return [];
  return await db.select().from(notifications)
    .where(eq(notifications.userId, userId))
    .orderBy(desc(notifications.createdAt));
}

export async function markNotificationAsRead(notificationId: number, userId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  await db.update(notifications)
    .set({ isRead: true })
    .where(and(eq(notifications.id, notificationId), eq(notifications.userId, userId)));
}

// ===== Admin Dashboard Functions =====

export async function getAdminStats() {
  const db = await getDb();
  if (!db) return null;
  
  const totalUsers = await db.select({ count: sql`COUNT(*)` }).from(users);
  const totalLoans = await db.select({ count: sql`COUNT(*)` }).from(loans);
  const totalBorrowers = await db.select({ count: sql`COUNT(*)` }).from(users).where(eq(users.role, "borrower"));
  const totalLenders = await db.select({ count: sql`COUNT(*)` }).from(users).where(eq(users.role, "lender"));
  
  return {
    totalUsers: Number(totalUsers[0]?.count || 0),
    totalLoans: Number(totalLoans[0]?.count || 0),
    totalBorrowers: Number(totalBorrowers[0]?.count || 0),
    totalLenders: Number(totalLenders[0]?.count || 0),
  };
}
