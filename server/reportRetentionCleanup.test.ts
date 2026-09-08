import { beforeEach, describe, expect, it, vi } from "vitest";

const authenticateRequest = vi.hoisted(() => vi.fn());
const isRegisteredReportDownloadRetentionTask = vi.hoisted(() => vi.fn());
const runReportDownloadHistoryRetention = vi.hoisted(() => vi.fn());

vi.mock("./_core/sdk", () => ({ sdk: { authenticateRequest } }));
vi.mock("./reportGovernanceDb", () => ({ isRegisteredReportDownloadRetentionTask, runReportDownloadHistoryRetention }));

import { runReportDownloadRetentionCleanup } from "./reportRetentionCleanup";

function response() {
  const res = { status: vi.fn(), json: vi.fn() } as any;
  res.status.mockReturnValue(res);
  return res;
}

describe("report download retention callback", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    runReportDownloadHistoryRetention.mockResolvedValue({ cutoff: new Date("2026-08-01T00:00:00.000Z"), deletedHistory: 2, deletedEvents: 1, deletedRequests: 1 });
  });

  it("rejects calls that are not authenticated Heartbeat jobs", async () => {
    authenticateRequest.mockResolvedValue({ isCron: false });
    const res = response();
    await runReportDownloadRetentionCleanup({} as any, res);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(runReportDownloadHistoryRetention).not.toHaveBeenCalled();
  });

  it("skips unknown or unregistered task UIDs without deleting records", async () => {
    authenticateRequest.mockResolvedValue({ isCron: true, taskUid: "unknown-task" });
    isRegisteredReportDownloadRetentionTask.mockResolvedValue(false);
    const res = response();
    await runReportDownloadRetentionCleanup({} as any, res);
    expect(res.json).toHaveBeenCalledWith({ ok: true, skipped: "orphan-or-unregistered-task" });
    expect(runReportDownloadHistoryRetention).not.toHaveBeenCalled();
  });

  it("runs idempotent cleanup only for the registered task UID", async () => {
    authenticateRequest.mockResolvedValue({ isCron: true, taskUid: "retention-task" });
    isRegisteredReportDownloadRetentionTask.mockResolvedValue(true);
    const res = response();
    await runReportDownloadRetentionCleanup({} as any, res);
    expect(isRegisteredReportDownloadRetentionTask).toHaveBeenCalledWith("retention-task");
    expect(runReportDownloadHistoryRetention).toHaveBeenCalledWith(0);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ ok: true, taskUid: "retention-task", deletedHistory: 2 }));
  });
});
