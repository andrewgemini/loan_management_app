import "dotenv/config";
import express, { type Express } from "express";
import path from "path";
import fs from "fs";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { registerOAuthRoutes } from "./oauth";
import { appRouter } from "../routers";
import { createContext } from "./context";
import { apiSecurityMiddleware } from "../securityMiddleware";
import { registerStorageProxy } from "./storageProxy";
import { sendUpcomingPaymentReminders } from "../scheduledReminder";
import { runReportDownloadRetentionCleanup } from "../reportRetentionCleanup";
import { initializeEmailService } from "../emailService";

export function createApiApp(): Express {
  const app = express();
  const uploadsDir = process.env.VERCEL
    ? path.join("/tmp", "loan-management-uploads")
    : path.resolve(process.cwd(), "uploads");
  if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });
  app.use("/uploads", express.static(uploadsDir));
  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ limit: "50mb", extended: true }));
  app.use("/api", apiSecurityMiddleware);
  registerStorageProxy(app);
  registerOAuthRoutes(app);
  app.use("/api/trpc", createExpressMiddleware({ router: appRouter, createContext }));
  app.post("/api/scheduled/payment-reminders", sendUpcomingPaymentReminders);
  app.post("/api/scheduled/report-download-retention", runReportDownloadRetentionCleanup);
  return app;
}

export function configureEmailService() {
  const smtpHost = process.env.SMTP_HOST;
  const smtpUser = process.env.SMTP_USER;
  const smtpPass = process.env.SMTP_PASS;
  if (!smtpHost || !smtpUser || !smtpPass) {
    console.log("[Email] SMTP is not configured; email delivery is disabled");
    return;
  }
  const smtpPort = Number(process.env.SMTP_PORT || 587);
  initializeEmailService({
    host: smtpHost,
    port: Number.isFinite(smtpPort) ? smtpPort : 587,
    secure: process.env.SMTP_SECURE === "true" || smtpPort === 465,
    auth: { user: smtpUser, pass: smtpPass },
    from: process.env.EMAIL_FROM || smtpUser,
  });
  console.log("[Email] SMTP service initialized");
}
