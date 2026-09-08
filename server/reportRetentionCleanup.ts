import { sdk } from "./_core/sdk";
import { isRegisteredReportDownloadRetentionTask, runReportDownloadHistoryRetention } from "./reportGovernanceDb";
import type { Request, Response } from "express";

/**
 * Daily callback for report-download metadata retention.
 * The task is deliberately registered only after checkpoint + production publish.
 */
export async function runReportDownloadRetentionCleanup(req: Request, res: Response) {
  try {
    const user = await sdk.authenticateRequest(req);
    if (!user.isCron || !user.taskUid) return res.status(403).json({ error: "cron-only" });
    if (!(await isRegisteredReportDownloadRetentionTask(user.taskUid))) {
      return res.json({ ok: true, skipped: "orphan-or-unregistered-task" });
    }
    const result = await runReportDownloadHistoryRetention(0);
    return res.json({ ok: true, taskUid: user.taskUid ?? null, ...result });
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown-error";
    return res.status(500).json({
      error: message,
      context: { url: req.originalUrl, taskUid: req.headers["x-task-uid"] ?? null },
      timestamp: new Date().toISOString(),
    });
  }
}
