import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const queryState = vi.hoisted(() => ({ chartLoading: false, statsLoading: false, pieLoading: false, piePopulated: false, activityHistory: [] as unknown[], rangePresets: [] as unknown[], recentRangePresets: [] as unknown[], presetCategories: [] as unknown[], presetCategoryMoveHistory: [] as unknown[] }));

vi.mock("@/_core/hooks/useAuth", () => ({
  useAuth: () => ({
    user: { id: 1, name: "ผู้ดูแลระบบ", role: "admin" },
  }),
}));

vi.mock("@/components/DashboardLayout", () => ({
  default: ({ children }: { children: React.ReactNode }) =>
    React.createElement("main", null, children),
}));

vi.mock("@/components/ui/card", () => ({
  Card: ({ children, className }: { children: React.ReactNode; className?: string }) =>
    React.createElement("section", { className }, children),
  CardContent: ({ children, className }: { children: React.ReactNode; className?: string }) =>
    React.createElement("div", { className }, children),
  CardHeader: ({ children, className }: { children: React.ReactNode; className?: string }) =>
    React.createElement("header", { className }, children),
  CardTitle: ({ children }: { children: React.ReactNode }) => React.createElement("h2", null, children),
  CardDescription: ({ children }: { children: React.ReactNode }) => React.createElement("p", null, children),
}));

vi.mock("@/components/ui/button", () => ({
  Button: ({ children, ...props }: { children: React.ReactNode; [key: string]: unknown }) =>
    React.createElement("button", props, children),
}));

vi.mock("@/components/ui/input", () => ({
  Input: (props: Record<string, unknown>) => React.createElement("input", props),
}));

vi.mock("@/components/ui/dialog", () => ({
  Dialog: ({ children }: { children: React.ReactNode }) => React.createElement("div", null, children),
  DialogContent: ({ children }: { children: React.ReactNode }) => React.createElement("section", null, children),
  DialogHeader: ({ children }: { children: React.ReactNode }) => React.createElement("header", null, children),
  DialogTitle: ({ children }: { children: React.ReactNode }) => React.createElement("h2", null, children),
  DialogDescription: ({ children }: { children: React.ReactNode }) => React.createElement("p", null, children),
}));

vi.mock("@/components/ui/alert-dialog", () => {
  const Container = ({ children }: { children: React.ReactNode }) => React.createElement("div", null, children);
  const Action = ({ children, ...props }: { children: React.ReactNode; [key: string]: unknown }) => React.createElement("button", props, children);
  return { AlertDialog: Container, AlertDialogContent: Container, AlertDialogHeader: Container, AlertDialogFooter: Container, AlertDialogTitle: Container, AlertDialogDescription: Container, AlertDialogAction: Action, AlertDialogCancel: Action };
});

vi.mock("@/lib/adminDrilldownUtils", () => ({
  matchesLoanTypeSlice: (paymentType: string, sliceName: string) =>
    (sliceName === "ผ่อนคงที่" && paymentType === "fixed") || (sliceName === "ลดต้นลดดอก" && paymentType === "reducing"),
  matchesPaymentStatusSlice: (status: string, sliceName: string) =>
    (sliceName === "รอตรวจสอบ" && status === "pending") || (sliceName === "ยืนยันแล้ว" && status === "verified") || (sliceName === "ปฏิเสธ" && status === "rejected"),
}));

vi.mock("@/lib/adminDrilldownSearch", () => ({
  filterLoanTypeDrilldown: (records: unknown[]) => records,
  filterPaymentStatusDrilldown: (records: unknown[]) => records,
}));

vi.mock("@/lib/historyExport", () => ({
  downloadHistoryCSV: vi.fn(),
}));

vi.mock("lucide-react", () => {
  const Icon = ({ className, ...props }: { className?: string; [key: string]: unknown }) =>
    React.createElement("svg", { className, ...props }, null);
  return {
    BarChart3: Icon,
    Users: Icon,
    Banknote: Icon,
    TrendingUp: Icon,
    AlertCircle: Icon,
    Loader2: Icon,
    Download: Icon,
    ExternalLink: Icon,
    AlertTriangle: Icon,
    CheckCircle2: Icon,
    CircleDollarSign: Icon,
    Clock3: Icon,
    FileCheck2: Icon,
    Landmark: Icon,
    FileDown: Icon,
    ImageDown: Icon,
    ArrowDownRight: Icon,
    ArrowUpRight: Icon,
    CalendarDays: Icon,
    Minus: Icon,
    Bookmark: Icon,
    BriefcaseBusiness: Icon,
    Flag: Icon,
    Folder: Icon,
    Star: Icon,
  };
});

vi.mock("recharts", () => {
  const Container = ({ children, ...props }: { children?: React.ReactNode; [key: string]: unknown }) =>
    React.createElement("div", props, children);
  const Empty = () => null;
  return { ResponsiveContainer: Container, PieChart: Container, Pie: Container, Cell: Empty, Tooltip: Empty, Legend: Empty };
});

vi.mock("@/lib/trpc", () => {
  const query = (data: unknown, isLoading = false) => ({ data, isLoading });
  return {
    trpc: {
      admin: {
        getDashboardStats: { useQuery: () => query({
          users: { total: 0, borrowers: 0, lenders: 0 },
          loans: { total: 0, active: 0, closed: 0, totalPrincipal: 0, totalPaid: 0, totalOutstanding: 0, avgInterestRate: 0 },
          requests: { total: 0, pending: 0, approved: 0, rejected: 0 },
          payments: { total: 0, pending: 0, verified: 0 },
        }, queryState.statsLoading) },
        getDashboardPreferences: { useQuery: () => query({ customRangeStartDate: null, customRangeEndDate: null, comparisonMode: "matching_period" }) },
        saveDashboardPreferences: { useMutation: () => ({ mutate: vi.fn(), isPending: false }) },
        resetDashboardPreferences: { useMutation: () => ({ mutate: vi.fn(), isPending: false }) },
        listDashboardRangePresets: { useQuery: () => query(queryState.rangePresets) },
        listRecentDashboardRangePresets: { useQuery: () => query(queryState.recentRangePresets) },
        listDashboardPresetCategories: { useQuery: () => query(queryState.presetCategories) },
        listDashboardPresetCategoryMoveHistory: { useQuery: () => query(queryState.presetCategoryMoveHistory) },
        saveDashboardRangePreset: { useMutation: () => ({ mutate: vi.fn(), isPending: false }) },
        deleteDashboardRangePreset: { useMutation: () => ({ mutate: vi.fn(), isPending: false }) },
        setDashboardRangePresetSharing: { useMutation: () => ({ mutate: vi.fn(), isPending: false }) },
        copyDashboardRangePresetToPrivate: { useMutation: () => ({ mutate: vi.fn(), isPending: false }) },
        markDashboardRangePresetUsed: { useMutation: () => ({ mutate: vi.fn(), isPending: false }) },
        setDashboardRangePresetPin: { useMutation: () => ({ mutate: vi.fn(), isPending: false }) },
        clearDashboardRangePresetHistory: { useMutation: () => ({ mutate: vi.fn(), isPending: false }) },
        reorderDashboardRangePresetPins: { useMutation: () => ({ mutate: vi.fn(), isPending: false }) },
        resetDashboardRangePresetPinOrder: { useMutation: () => ({ mutate: vi.fn(), isPending: false }) },
        sortDashboardRangePresetPinsByUsage: { useMutation: () => ({ mutate: vi.fn(), isPending: false }) },
        clearDashboardRangePresetPins: { useMutation: () => ({ mutate: vi.fn(), isPending: false }) },
        createDashboardPresetCategory: { useMutation: () => ({ mutate: vi.fn(), isPending: false }) },
        updateDashboardPresetCategoryAppearance: { useMutation: () => ({ mutate: vi.fn(), isPending: false }) },
        renameDashboardPresetCategory: { useMutation: () => ({ mutate: vi.fn(), isPending: false }) },
        deleteDashboardPresetCategory: { useMutation: () => ({ mutate: vi.fn(), isPending: false }) },
        setDashboardRangePresetCategory: { useMutation: () => ({ mutate: vi.fn(), isPending: false }) },
        setDashboardRangePresetCategories: { useMutation: () => ({ mutate: vi.fn(), isPending: false }) },
        undoDashboardPresetCategoryMove: { useMutation: () => ({ mutate: vi.fn(), isPending: false }) },
        redoDashboardPresetCategoryMove: { useMutation: () => ({ mutate: vi.fn(), isPending: false }) },
        getPendingRequests: { useQuery: () => query([]) },
        getPendingPaymentVerifications: { useQuery: () => query([]) },
        listUsers: { useQuery: () => query([]) },
        getActivityHistory: { useQuery: () => query(queryState.activityHistory) },
        updateUserRole: { useMutation: () => ({ mutate: vi.fn(), isPending: false }) },
        getLoanStatusChart: { useQuery: () => query({ labels: [], data: [] }, queryState.chartLoading) },
        getOutstandingChart: { useQuery: () => query([], queryState.chartLoading) },
        getPaymentTrendChart: { useQuery: () => query(undefined, queryState.chartLoading) },
        getDashboardKpiComparison: { useQuery: () => query(null) },
        getLoanTypeDistribution: { useQuery: () => query(queryState.piePopulated ? [{ name: "ผ่อนคงที่", value: 1 }, { name: "ลดต้นลดดอก", value: 2 }] : [], queryState.pieLoading) },
        getPaymentStatusDistribution: { useQuery: () => query(queryState.piePopulated ? [{ name: "รอตรวจสอบ", value: 1 }, { name: "ยืนยันแล้ว", value: 2 }, { name: "ปฏิเสธ", value: 1 }] : [], queryState.pieLoading) },
        getLoanTypeDrilldown: { useQuery: () => query([]) },
        getPaymentStatusDrilldown: { useQuery: () => query([]) },
        getDashboardKpiDetails: { useQuery: () => query(null) },
      },
      loan: {
        approveRequest: { useMutation: () => ({ mutate: vi.fn(), isPending: false }) },
        rejectRequest: { useMutation: () => ({ mutate: vi.fn(), isPending: false }) },
        verifyPayment: { useMutation: () => ({ mutate: vi.fn(), isPending: false }) },
        rejectPayment: { useMutation: () => ({ mutate: vi.fn(), isPending: false }) },
      },
      useUtils: () => ({
        admin: {
          getDashboardStats: { invalidate: vi.fn() },
          getPendingRequests: { invalidate: vi.fn() },
          getPendingPaymentVerifications: { invalidate: vi.fn() },
          listUsers: { invalidate: vi.fn() },
          getLoanTypeDistribution: { invalidate: vi.fn() },
          getPaymentStatusDistribution: { invalidate: vi.fn() },
          getPaymentTrendChart: { invalidate: vi.fn() },
          getDashboardKpiDetails: { invalidate: vi.fn() },
          getDashboardPreferences: { invalidate: vi.fn() },
          listDashboardRangePresets: { invalidate: vi.fn() },
          listRecentDashboardRangePresets: { invalidate: vi.fn() },
          listDashboardPresetCategories: { invalidate: vi.fn() },
          listDashboardPresetCategoryMoveHistory: { invalidate: vi.fn() },
        },
      }),
    },
  };
});

import AdminDashboard from "../client/src/pages/AdminDashboard";

describe("AdminDashboard render states", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    queryState.chartLoading = false;
    queryState.statsLoading = false;
    queryState.pieLoading = false;
    queryState.piePopulated = false;
    queryState.activityHistory = [];
    queryState.rangePresets = [];
    queryState.recentRangePresets = [];
    queryState.presetCategories = [];
    queryState.presetCategoryMoveHistory = [];
  });

  it("renders the payment trend empty state when there is no chart data", () => {
    const markup = renderToStaticMarkup(React.createElement(AdminDashboard));

    expect(markup).toContain("ยังไม่มีข้อมูลการชำระเงิน");
    expect(markup).toContain("ยังไม่มีข้อมูลประเภทสินเชื่อ");
    expect(markup).toContain("ยังไม่มีข้อมูลสถานะการชำระ");
    expect(markup).not.toContain("ยอดชำระรวมย้อนหลัง 12 เดือน: 0");
  });

  it("renders chart loading animation while chart queries are pending", () => {
    queryState.chartLoading = true;
    const markup = renderToStaticMarkup(React.createElement(AdminDashboard));

    expect(markup).toContain("กำลังโหลดข้อมูลแนวโน้มการชำระเงิน...");
    expect(markup).toContain('aria-busy="true"');
    expect(markup).toContain("animate-spin");
  });

  it("renders statistics loading animation while the stats query is pending", () => {
    queryState.statsLoading = true;
    const markup = renderToStaticMarkup(React.createElement(AdminDashboard));

    expect(markup).toContain("กำลังโหลดข้อมูลสถิติและกราฟ...");
    expect(markup).toContain('aria-label="กำลังโหลดข้อมูลสถิติ"');
  });

  it("renders pie chart loading animations independently", () => {
    queryState.pieLoading = true;
    const markup = renderToStaticMarkup(React.createElement(AdminDashboard));

    expect(markup).toContain("กำลังโหลดสัดส่วนประเภทสินเชื่อ...");
    expect(markup).toContain("กำลังโหลดสัดส่วนสถานะการชำระ...");
  });

  it("renders accessible drill-down controls for every populated pie slice", () => {
    queryState.piePopulated = true;
    const markup = renderToStaticMarkup(React.createElement(AdminDashboard));

    expect(markup).toContain("ผ่อนคงที่: 1");
    expect(markup).toContain("ลดต้นลดดอก: 2");
    expect(markup).toContain("ยืนยันแล้ว: 2");
    expect(markup).toContain("CSV");
    expect(markup).toContain("PDF");
  });

  it("renders the activity actor and timestamp for an audited action", () => {
    queryState.activityHistory = [{ id: "request-9", status: "approved", title: "อนุมัติคำขอกู้", detail: "คำขอ #9", actorName: "ผู้ดูแลอนุมัติ", occurredAt: new Date("2026-08-10") }];
    const markup = renderToStaticMarkup(React.createElement(AdminDashboard));
    expect(markup).toContain("ดำเนินการโดย ผู้ดูแลอนุมัติ");
    expect(markup).toContain("อนุมัติคำขอกู้");
  });

  it("renders preset pin ordering, bulk-unpin entry, usage frequency, and copy confirmation controls", () => {
    queryState.rangePresets = [{ id: 8, userId: 22, name: "รอบทีมสิ้นเดือน", startDate: "2026-08-01", endDate: "2026-08-31", isShared: true, isOwner: false, isPinned: true, usageCount: 12, creatorName: "ผู้ดูแลฝ่ายปฏิบัติการ", categoryId: 3, categoryName: "ติดตามสิ้นเดือน", categoryColor: "teal", categoryIcon: "flag", updatedAt: new Date("2026-08-20T10:15:00.000Z") }];
    queryState.recentRangePresets = [{ id: 9, userId: 22, name: "ติดตามเงินกู้", startDate: "2026-08-01", endDate: "2026-08-31", isShared: true, isOwner: false, creatorName: "ผู้ดูแลฝ่ายปฏิบัติการ", updatedAt: new Date("2026-08-20T10:15:00.000Z"), lastUsedAt: new Date("2026-08-21T10:15:00.000Z") }];
    queryState.presetCategories = [{ id: 3, name: "ติดตามสิ้นเดือน", color: "teal", icon: "flag", presetCount: 1 }];
    queryState.presetCategoryMoveHistory = [{ id: 21, presetCount: 2, destinationCategoryId: 3, undoneAt: null, createdAt: new Date("2026-08-26T08:00:00.000Z") }];
    const markup = renderToStaticMarkup(React.createElement(AdminDashboard));

    expect(markup).toContain("ค้นหา Preset");
    expect(markup).toContain("แสดง");
    expect(markup).toContain("ของฉัน");
    expect(markup).toContain("ของทีม");
    expect(markup).toContain("ชื่อผู้สร้าง");
    expect(markup).toContain("เรียงลำดับ");
    expect(markup).toContain("Preset ที่ใช้ล่าสุด");
    expect(markup).toContain("ล้างประวัติ");
    expect(markup).toContain("Preset ที่ปักหมุด");
    expect(markup).toContain("ย้อนกลับ");
    expect(markup).toContain("ย้อนกลับลำดับ Preset ที่ปักหมุดก่อนหน้า");
    expect(markup).toContain("ทำซ้ำ");
    expect(markup).toContain("ทำซ้ำลำดับ Preset ที่ปักหมุดที่ย้อนกลับไป");
    expect(markup).toContain("Undo 0/5 · Redo 0/5 ขั้น");
    expect(markup).toContain("เรียงตามการใช้");
    expect(markup).toContain("จัดเรียง Preset ที่ปักหมุดตามความถี่การใช้");
    expect(markup).toContain("ค้นหา Preset ที่ปักหมุด");
    expect(markup).toContain("โฟลเดอร์และตัวกรอง Preset หมุด");
    expect(markup).toContain("ค้นหาผู้สร้าง Preset ที่ปักหมุด");
    expect(markup).toContain("สร้างโฟลเดอร์");
    expect(markup).toContain("ยกเลิกการเลือก");
    expect(markup).toContain("Preset มากไปน้อย");
    expect(markup).toContain("Preset น้อยไปมาก");
    expect(markup).toContain("ค้นหาโฟลเดอร์");
    expect(markup).toContain("เฉพาะโฟลเดอร์ว่าง");
    expect(markup).toContain("กรองสี");
    expect(markup).toContain("กรองไอคอน");
    expect(markup).toContain("ประวัติการย้าย Preset");
    expect(markup).toContain("ย้อนกลับการย้าย Preset ล่าสุด");
    expect(markup).toContain("ส่งออกประวัติการย้าย Preset เป็น CSV");
    expect(markup).toContain("จัดโฟลเดอร์ราย Preset หรือเลือกหลายรายการด้านบน");
    expect(markup).toContain("สีโฟลเดอร์");
    expect(markup).toContain("ไอคอนโฟลเดอร์");
    expect(markup).toContain("เลือก 0 Preset เพื่อย้ายพร้อมกัน");
    expect(markup).toContain("ย้าย Preset ที่เลือก");
    expect(markup).toContain("ติดตามสิ้นเดือน");
    expect(markup).toContain("เปลี่ยนชื่อโฟลเดอร์ ติดตามสิ้นเดือน");
    expect(markup).toContain("ลาก Preset ที่เลือก (0)");
    expect(markup).toContain("ลาก Preset ที่เลือกไปวางบนโฟลเดอร์เป้าหมายเพื่อย้ายโดยตรง");
    expect(markup).toContain("รีเซ็ตลำดับ");
    expect(markup).toContain("รีเซ็ตลำดับ Preset ที่ปักหมุดเป็นค่าเริ่มต้น");
    expect(markup).toContain("ยกเลิกหมุดทั้งหมด");
    expect(markup).toContain("ลากเพื่อจัดลำดับ รอบทีมสิ้นเดือน");
    expect(markup).toContain("ใช้ 12 ครั้ง");
    expect(markup).toContain("ติดตามเงินกู้");
    expect(markup).toContain("รอบทีมสิ้นเดือน");
    expect(markup).toContain("สร้างโดย ผู้ดูแลฝ่ายปฏิบัติการ");
    expect(markup).toContain("แก้ไขล่าสุด");
    expect(markup).toContain("ทีม Admin");
    expect(markup).toContain("จากทีม");
    expect(markup).toContain("ปักหมุด · รอบทีมสิ้นเดือน");
    expect(markup).toContain("ยกเลิกการปักหมุด Preset รอบทีมสิ้นเดือน");
    expect(markup).toContain("คัดลอก Preset รอบทีมสิ้นเดือน เป็นส่วนตัว");
    expect(markup).not.toContain("ลบ Preset รอบทีมสิ้นเดือน");
  });
});
