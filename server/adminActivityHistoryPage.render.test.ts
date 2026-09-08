import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const interactionState = vi.hoisted(() => ({ buttonProps: [] as Array<Record<string, unknown>>, csv: vi.fn(), pdf: vi.fn(), exportOptions: vi.fn((rows: unknown[]) => ({ rows })) }));

vi.mock("@/_core/hooks/useAuth", () => ({ useAuth: () => ({ user: { id: 1, role: "admin", name: "ผู้ดูแล" } }) }));
vi.mock("@/components/DashboardLayout", () => ({ default: ({ children }: { children: React.ReactNode }) => React.createElement("main", null, children) }));
vi.mock("@/components/ui/card", () => ({ Card: ({ children }: { children: React.ReactNode }) => React.createElement("section", null, children) }));
vi.mock("@/components/ui/dialog", () => { const Container = ({ children }: { children: React.ReactNode }) => React.createElement("div", null, children); return { Dialog: Container, DialogContent: Container, DialogHeader: Container, DialogTitle: Container, DialogDescription: Container }; });
vi.mock("@/components/ui/button", () => ({ Button: ({ children, ...props }: { children: React.ReactNode; [key: string]: unknown }) => { interactionState.buttonProps.push({ children, ...props }); return React.createElement("button", props, children); } }));
vi.mock("@/components/ui/input", () => ({ Input: (props: Record<string, unknown>) => React.createElement("input", props) }));
vi.mock("@/components/ReportDatePresetControls", () => ({ ReportDatePresetControls: () => React.createElement("div", null, "ช่วงด่วน") }));
vi.mock("@/components/ActivityHistoryDailyChart", () => ({ ActivityHistoryDailyChart: () => React.createElement("div", null, "กิจกรรมรายวัน") }));
vi.mock("@/lib/adminDashboardUtils", () => ({ canAccessAdminDashboard: (role: string) => role === "admin" }));
vi.mock("@/lib/trpc", () => ({ trpc: { admin: { getActivityHistory: { useQuery: () => ({ data: [{ id: "request-9", status: "approved", title: "อนุมัติคำขอกู้", detail: "คำขอ #9", actorName: "ผู้ดูแลอนุมัติ", actorRole: "admin", lenderId: 5, lenderName: "ผู้ให้กู้ A", occurredAt: new Date("2026-08-10"), loanId: 77 }], isLoading: false }) }, listActivityFilterPresets: { useQuery: () => ({ data: [], isLoading: false }) }, saveActivityFilterPreset: { useMutation: () => ({ mutate: vi.fn(), isPending: false }) }, deleteActivityFilterPreset: { useMutation: () => ({ mutate: vi.fn(), isPending: false }) } }, useUtils: () => ({ admin: { listActivityFilterPresets: { invalidate: vi.fn() } } }) } }));
vi.mock("@/lib/adminActivityHistoryUtils", () => ({ activityFilterOptions: () => ({ eventTypes: ["อนุมัติคำขอกู้"], actors: ["ผู้ดูแลอนุมัติ"], roles: ["admin"], lenders: [{ id: 5, name: "ผู้ให้กู้ A" }] }), filterActivityHistory: (records: unknown[]) => records, dailyActivityCounts: () => [{ date: "2026-08-10", count: 1 }] }));
vi.mock("@/lib/activityHistoryFilterPresets", () => ({ loadActivityHistoryFilterPresets: () => [], saveActivityHistoryFilterPreset: () => [], removeActivityHistoryFilterPreset: () => [] }));
vi.mock("@/lib/activityHistoryExport", () => ({ createActivityHistoryExportOptions: interactionState.exportOptions }));
vi.mock("@/lib/historyExport", () => ({ downloadHistoryCSV: interactionState.csv, downloadHistoryPDF: interactionState.pdf }));
vi.mock("wouter", () => ({ Link: ({ children }: { children: React.ReactNode }) => React.createElement("a", null, children) }));
vi.mock("lucide-react", () => { const Icon = () => React.createElement("svg"); return { Activity: Icon, BookmarkPlus: Icon, Building2: Icon, CalendarDays: Icon, Download: Icon, FileText: Icon, Filter: Icon, RotateCcw: Icon, ShieldAlert: Icon, Trash2: Icon, X: Icon }; });

import AdminActivityHistory from "../client/src/pages/AdminActivityHistory";

describe("AdminActivityHistory render", () => {
  beforeEach(() => {
    interactionState.buttonProps.length = 0;
    interactionState.csv.mockReset();
    interactionState.pdf.mockReset();
    interactionState.exportOptions.mockClear();
  });
  it("shows the inclusive date filter controls and a populated audited activity", () => {
    const markup = renderToStaticMarkup(React.createElement(AdminActivityHistory));
    expect(markup).toContain("Activity History");
    expect(markup).toContain('type="date"');
    expect(markup).toContain("ผู้ดูแลอนุมัติ");
    expect(markup).toContain("ดูสัญญา");
    expect(markup).toContain("ทุกประเภท");
    expect(markup).toContain("ทุกคน");
    expect(markup).toContain("ทุกบทบาท");
    expect(markup).toContain("ชุดตัวกรองของบัญชี");
    expect(markup).toContain("ผู้ให้กู้ทั้งหมด");
    expect(markup).toContain("กิจกรรมรายวัน");
    expect(markup).toContain("CSV");
    expect(markup).toContain("PDF");
  });

  it("sends the final filtered rows to CSV and PDF button handlers", async () => {
    renderToStaticMarkup(React.createElement(AdminActivityHistory));
    const buttonWithText = (text: string) => interactionState.buttonProps.find((props) => Array.isArray(props.children) && props.children.includes(text));
    const csvButton = buttonWithText("CSV");
    const pdfButton = buttonWithText("PDF");
    expect(csvButton?.onClick).toEqual(expect.any(Function));
    expect(pdfButton?.onClick).toEqual(expect.any(Function));
    (csvButton?.onClick as () => void)();
    await (pdfButton?.onClick as () => Promise<void>)();
    const exportedRows = [{ id: "request-9", status: "approved", title: "อนุมัติคำขอกู้", detail: "คำขอ #9", actorName: "ผู้ดูแลอนุมัติ", actorRole: "admin", lenderId: 5, lenderName: "ผู้ให้กู้ A", occurredAt: new Date("2026-08-10"), loanId: 77 }];
    expect(interactionState.exportOptions).toHaveBeenCalledWith(exportedRows, "", "");
    expect(interactionState.csv).toHaveBeenCalledWith({ rows: exportedRows });
    expect(interactionState.pdf).toHaveBeenCalledWith({ rows: exportedRows });
  });
});
