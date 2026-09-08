import React from "react";
import { act, create } from "react-test-renderer";
import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ csv: vi.fn(), pdf: vi.fn(), exportOptions: vi.fn((rows: unknown[]) => ({ rows })), savePreset: vi.fn(), invalidatePresets: vi.fn(), toast: { success: vi.fn(), error: vi.fn() } }));
const activities = [
  { id: "request-1", status: "approved", loanId: 12, title: "อนุมัติคำขอกู้", detail: "คำขอ #1", actorName: "ผู้ดูแล A", actorRole: "admin", lenderId: 7, lenderName: "ผู้ให้กู้ A", occurredAt: new Date("2026-08-01") },
  { id: "payment-1", status: "verified", loanId: 12, title: "ยืนยันการชำระเงิน", detail: "รายการชำระ #1", actorName: "ผู้ตรวจ B", actorRole: "lender", lenderId: 8, lenderName: "ผู้ให้กู้ B", occurredAt: new Date("2026-08-02") },
];

vi.mock("@/_core/hooks/useAuth", () => ({ useAuth: () => ({ user: { id: 1, role: "admin", name: "ผู้ดูแล" } }) }));
vi.mock("@/components/DashboardLayout", () => ({ default: ({ children }: { children: React.ReactNode }) => React.createElement("main", null, children) }));
vi.mock("@/components/ui/card", () => ({ Card: ({ children }: { children: React.ReactNode }) => React.createElement("section", null, children) }));
vi.mock("@/components/ui/dialog", () => { const Container = ({ children }: { children: React.ReactNode }) => React.createElement("div", null, children); return { Dialog: Container, DialogContent: Container, DialogHeader: Container, DialogTitle: Container, DialogDescription: Container }; });
vi.mock("@/components/ui/button", () => ({ Button: ({ children, ...props }: { children: React.ReactNode; [key: string]: unknown }) => React.createElement("button", props, children) }));
vi.mock("@/components/ui/input", () => ({ Input: (props: Record<string, unknown>) => React.createElement("input", props) }));
vi.mock("@/components/ReportDatePresetControls", () => ({ ReportDatePresetControls: () => React.createElement("div") }));
vi.mock("@/components/ActivityHistoryDailyChart", () => ({ ActivityHistoryDailyChart: () => React.createElement("div") }));
vi.mock("@/lib/adminDashboardUtils", () => ({ canAccessAdminDashboard: () => true }));
vi.mock("@/lib/trpc", () => ({ trpc: { admin: { getActivityHistory: { useQuery: () => ({ data: activities, isLoading: false }) }, listActivityFilterPresets: { useQuery: () => ({ data: [], isLoading: false }) }, saveActivityFilterPreset: { useMutation: () => ({ mutate: state.savePreset, isPending: false }) }, deleteActivityFilterPreset: { useMutation: () => ({ mutate: vi.fn(), isPending: false }) } }, useUtils: () => ({ admin: { listActivityFilterPresets: { invalidate: state.invalidatePresets } } }) } }));
vi.mock("@/lib/adminActivityHistoryUtils", () => ({
  activityFilterOptions: (records: typeof activities) => ({ eventTypes: records.map((record) => record.title), actors: records.map((record) => record.actorName), roles: records.map((record) => record.actorRole), lenders: records.map((record) => ({ id: record.lenderId, name: record.lenderName })) }),
  filterActivityHistory: (records: typeof activities, eventType: string, actorName: string, actorRole: string, lenderId: number | null) => records.filter((record) => (eventType === "all" || record.title === eventType) && (actorName === "all" || record.actorName === actorName) && (actorRole === "all" || record.actorRole === actorRole) && (lenderId === null || record.lenderId === lenderId)),
  dailyActivityCounts: () => [],
}));
vi.mock("@/lib/activityHistoryExport", () => ({ createActivityHistoryExportOptions: state.exportOptions }));
vi.mock("@/lib/historyExport", () => ({ downloadHistoryCSV: state.csv, downloadHistoryPDF: state.pdf }));
vi.mock("wouter", () => ({ Link: ({ children }: { children: React.ReactNode }) => React.createElement("a", null, children) }));
vi.mock("lucide-react", () => { const Icon = () => React.createElement("svg"); return { Activity: Icon, BookmarkPlus: Icon, Building2: Icon, CalendarDays: Icon, Download: Icon, FileText: Icon, Filter: Icon, RotateCcw: Icon, ShieldAlert: Icon, Trash2: Icon, X: Icon }; });
vi.mock("sonner", () => ({ toast: state.toast }));

import AdminActivityHistory from "../client/src/pages/AdminActivityHistory";

const includesText = (value: unknown, text: string): boolean => Array.isArray(value) ? value.some((entry) => includesText(entry, text)) : value === text;

describe("AdminActivityHistory export interactions", () => {
  beforeEach(() => { state.csv.mockReset(); state.pdf.mockReset(); state.exportOptions.mockClear(); state.savePreset.mockReset(); state.invalidatePresets.mockReset(); state.toast.success.mockReset(); state.toast.error.mockReset(); });

  it("exports exactly the records remaining after an event-type selection", async () => {
    let tree: ReturnType<typeof create>;
    await act(async () => { tree = create(React.createElement(AdminActivityHistory)); });
    const eventSelect = tree!.root.findAllByType("select")[0];
    await act(async () => { eventSelect.props.onChange({ target: { value: "ยืนยันการชำระเงิน" } }); });
    const buttons = tree!.root.findAllByType("button");
    const csvButton = buttons.find((button) => includesText(button.props.children, "CSV"));
    const pdfButton = buttons.find((button) => includesText(button.props.children, "PDF"));
    await act(async () => { csvButton!.props.onClick(); await pdfButton!.props.onClick(); });
    const expectedFilteredRows = [activities[1]];
    expect(state.exportOptions).toHaveBeenLastCalledWith(expectedFilteredRows, "", "");
    expect(state.csv).toHaveBeenCalledWith({ rows: expectedFilteredRows });
    expect(state.pdf).toHaveBeenCalledWith({ rows: expectedFilteredRows });
  });

  it("applies the role filter before export and saves the complete current filter set", async () => {
    let tree: ReturnType<typeof create>;
    await act(async () => { tree = create(React.createElement(AdminActivityHistory)); });
    const selects = tree!.root.findAllByType("select");
    await act(async () => { selects[2].props.onChange({ target: { value: "admin" } }); });
    const csvButton = tree!.root.findAllByType("button").find((button) => includesText(button.props.children, "CSV"));
    await act(async () => { csvButton!.props.onClick(); });
    expect(state.exportOptions).toHaveBeenLastCalledWith([activities[0]], "", "");
    const textInputs = tree!.root.findAllByType("input");
    const presetNameInput = textInputs.find((input) => input.props.placeholder === "เช่น ตรวจสอบผู้ให้กู้เดือนนี้");
    await act(async () => { presetNameInput!.props.onChange({ target: { value: "ตรวจผู้ดูแล" } }); });
    const saveButton = tree!.root.findAllByType("button").find((button) => includesText(button.props.children, "บันทึก"));
    await act(async () => { saveButton!.props.onClick(); });
    expect(state.savePreset).toHaveBeenCalledWith(expect.objectContaining({ name: "ตรวจผู้ดูแล", actorRole: "admin", eventType: "all", actorName: "all", lenderId: null }));
  });
});
