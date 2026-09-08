import React from "react";
import { useAuth } from "@/_core/hooks/useAuth";
import DashboardLayout from "@/components/DashboardLayout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { trpc } from "@/lib/trpc";
import { downloadHistoryCSV, downloadHistoryPDF } from "@/lib/historyExport";
import { BarChart3, Users, Banknote, TrendingUp, AlertCircle, Loader2, Download, ExternalLink } from "lucide-react";
import { Chart as ChartJS, ArcElement, Legend as ChartLegend, Tooltip as ChartTooltip } from "chart.js";
import { Doughnut } from "react-chartjs-2";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Link } from "wouter";
import {
  calculatePaymentBarHeight,
  canAccessAdminDashboard,
  getPaymentTrendViewState,
  hasDecisionReason,
} from "../lib/adminDashboardUtils";
import { filterLoanTypeDrilldown, filterPaymentStatusDrilldown } from "@/lib/adminDrilldownSearch";
import { ProfessionalLoanDashboard } from "../components/ProfessionalLoanDashboard";

ChartJS.register(ArcElement, ChartTooltip, ChartLegend);

function DashboardChartLoading({ label, bars = 4 }: { label: string; bars?: number }) {
  return (
    <div
      className="space-y-3"
      role="status"
      aria-live="polite"
      aria-busy="true"
      aria-label={label}
    >
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 motion-safe:animate-spin motion-reduce:animate-none text-accent" aria-hidden="true" />
        <span>{label}</span>
      </div>
      {[...Array(bars)].map((_, index) => (
        <div key={index} className="flex items-center gap-3 motion-safe:animate-pulse motion-reduce:animate-none" style={{ animationDelay: `${index * 80}ms` }}>
          <div className="h-3 w-16 rounded bg-muted" />
          <div className="h-3 flex-1 rounded-full bg-muted" />
          <div className="h-3 w-20 rounded bg-muted" />
        </div>
      ))}
    </div>
  );
}

type DistributionSlice = { name: string; value: number };
type DrilldownSelection = { kind: "loanType" | "paymentStatus"; name: string; value: number };
type ConfirmationAction = { type: "approve" | "reject" | "verify" | "rejectPayment"; id: number; reason?: string } | null;
type DashboardComparisonMode = "matching_period" | "previous_month" | "previous_quarter";
type DashboardSelection = ({ days: 7 | 30 | 90 } | { startDate: string; endDate: string }) & { comparisonMode: DashboardComparisonMode };

function DashboardPieChart({ data, colors, label, onSliceClick }: { data: DistributionSlice[]; colors: string[]; label: string; onSliceClick: (slice: DistributionSlice) => void }) {
  const chartData = { labels: data.map((slice) => slice.name), datasets: [{ data: data.map((slice) => slice.value), backgroundColor: data.map((_, index) => colors[index % colors.length]), borderColor: "rgba(255,255,255,0.72)", borderWidth: 3, hoverOffset: 8 }] };
  return (
    <div className="space-y-2" aria-label={label}>
      <div className="h-56">
        <Doughnut data={chartData} options={{ maintainAspectRatio: false, cutout: "62%", plugins: { legend: { position: "bottom", labels: { usePointStyle: true, boxWidth: 8 } }, tooltip: { callbacks: { label: (context) => `${context.label}: ${context.parsed} รายการ` } } }, onClick: (_event, elements) => { const slice = data[elements[0]?.index ?? -1]; if (slice) onSliceClick(slice); } }} />
      </div>
      <div className="flex flex-wrap justify-center gap-2" aria-label={`${label} เลือกดูรายละเอียด`}>
        {data.map((slice) => (
          <Button key={slice.name} type="button" size="sm" variant="outline" onClick={() => onSliceClick(slice)} className="h-8 text-xs">
            {slice.name}: {slice.value}
          </Button>
        ))}
      </div>
    </div>
  );
}

export default function AdminDashboard() {
  const { user } = useAuth();
  const [selectedTab, setSelectedTab] = useState<"overview" | "requests" | "payments" | "users" | "legacyOverview">(
    "overview"
  );
  const [requestReasons, setRequestReasons] = useState<Record<number, string>>({});
  const [paymentReasons, setPaymentReasons] = useState<Record<number, string>>({});
  const [drilldown, setDrilldown] = useState<DrilldownSelection | null>(null);
  const [drilldownSearch, setDrilldownSearch] = useState("");
  const [confirmation, setConfirmation] = useState<ConfirmationAction>(null);
  const [dashboardTimeRange, setDashboardTimeRange] = useState<DashboardSelection>({ days: 30, comparisonMode: "matching_period" });
  const [hasAppliedDashboardPreference, setHasAppliedDashboardPreference] = useState(false);
  const [presetSearch, setPresetSearch] = useState("");
  const [presetCreatorSearch, setPresetCreatorSearch] = useState("");
  const [presetSort, setPresetSort] = useState<"updated_desc" | "name_asc" | "name_desc">("updated_desc");
  const [presetScope, setPresetScope] = useState<"all" | "private" | "team">("all");
  const [selectedKpiMetric, setSelectedKpiMetric] = useState<"users" | "activeLoans" | "principal" | "paid" | "outstanding" | "pendingPayments" | null>(null);
  const utils = trpc.useUtils();
  const { data: dashboardPreferences, isLoading: dashboardPreferencesLoading } = trpc.admin.getDashboardPreferences.useQuery();
  const { data: dashboardRangePresets = [] } = trpc.admin.listDashboardRangePresets.useQuery({ search: presetSearch.trim() || undefined, creatorSearch: presetCreatorSearch.trim() || undefined, sort: presetSort, scope: presetScope });
  const { data: recentDashboardRangePresets = [] } = trpc.admin.listRecentDashboardRangePresets.useQuery({ limit: 4 });
  const { data: dashboardPresetCategories = [] } = trpc.admin.listDashboardPresetCategories.useQuery();
  const { data: dashboardPresetCategoryMoveHistory = [] } = trpc.admin.listDashboardPresetCategoryMoveHistory.useQuery();
  const saveDashboardPreferencesMutation = trpc.admin.saveDashboardPreferences.useMutation({
    onSuccess: () => { toast.success("บันทึก Custom Date Range เป็นค่าเริ่มต้นแล้ว"); void utils.admin.getDashboardPreferences.invalidate(); },
    onError: (error) => toast.error(error.message || "บันทึกค่าเริ่มต้นไม่สำเร็จ"),
  });
  const resetDashboardPreferencesMutation = trpc.admin.resetDashboardPreferences.useMutation({
    onSuccess: () => { setDashboardTimeRange({ days: 30, comparisonMode: "matching_period" }); setHasAppliedDashboardPreference(true); toast.success("รีเซ็ต Dashboard เป็นค่าเริ่มต้นของระบบแล้ว"); void utils.admin.getDashboardPreferences.invalidate(); },
    onError: (error) => toast.error(error.message || "รีเซ็ตการตั้งค่าไม่สำเร็จ"),
  });
  const saveDashboardRangePresetMutation = trpc.admin.saveDashboardRangePreset.useMutation({
    onSuccess: (result) => { toast.success(result.updated ? "อัปเดต Preset แล้ว" : "บันทึก Preset แล้ว"); void utils.admin.listDashboardRangePresets.invalidate(); },
    onError: (error) => toast.error(error.message || "บันทึก Preset ไม่สำเร็จ"),
  });
  const deleteDashboardRangePresetMutation = trpc.admin.deleteDashboardRangePreset.useMutation({
    onSuccess: () => { toast.success("ลบ Preset แล้ว"); void utils.admin.listDashboardRangePresets.invalidate(); },
    onError: (error) => toast.error(error.message || "ลบ Preset ไม่สำเร็จ"),
  });
  const setDashboardRangePresetSharingMutation = trpc.admin.setDashboardRangePresetSharing.useMutation({
    onSuccess: (_result, input) => { toast.success(input.isShared ? "แชร์ Preset ให้ทีม Admin แล้ว" : "ยกเลิกการแชร์ Preset แล้ว"); void utils.admin.listDashboardRangePresets.invalidate(); },
    onError: (error) => toast.error(error.message || "เปลี่ยนสถานะการแชร์ไม่สำเร็จ"),
  });
  const copyDashboardRangePresetToPrivateMutation = trpc.admin.copyDashboardRangePresetToPrivate.useMutation({
    onSuccess: (result) => { toast.success(`คัดลอก ${result.name} เป็น Preset ส่วนตัวแล้ว`); void utils.admin.listDashboardRangePresets.invalidate(); },
    onError: (error) => toast.error(error.message || "คัดลอก Preset ไม่สำเร็จ"),
  });
  const markDashboardRangePresetUsedMutation = trpc.admin.markDashboardRangePresetUsed.useMutation({
    onSuccess: () => { void utils.admin.listRecentDashboardRangePresets.invalidate(); void utils.admin.listDashboardRangePresets.invalidate(); },
    onError: (error) => toast.error(error.message || "บันทึก Preset ล่าสุดไม่สำเร็จ"),
  });
  const setDashboardRangePresetPinMutation = trpc.admin.setDashboardRangePresetPin.useMutation({
    onSuccess: (_result, input) => { toast.success(input.isPinned ? "ปักหมุด Preset แล้ว" : "ยกเลิกการปักหมุด Preset แล้ว"); void utils.admin.listDashboardRangePresets.invalidate(); },
    onError: (error) => toast.error(error.message || "เปลี่ยนสถานะการปักหมุดไม่สำเร็จ"),
  });
  const clearDashboardRangePresetHistoryMutation = trpc.admin.clearDashboardRangePresetHistory.useMutation({
    onSuccess: () => { toast.success("ล้างประวัติ Preset ล่าสุดแล้ว"); void utils.admin.listRecentDashboardRangePresets.invalidate(); },
    onError: (error) => toast.error(error.message || "ล้างประวัติ Preset ล่าสุดไม่สำเร็จ"),
  });
  const reorderDashboardRangePresetPinsMutation = trpc.admin.reorderDashboardRangePresetPins.useMutation({
    onSuccess: () => { void utils.admin.listDashboardRangePresets.invalidate(); },
    onError: (error) => toast.error(error.message || "จัดลำดับ Preset ที่ปักหมุดไม่สำเร็จ"),
  });
  const resetDashboardRangePresetPinOrderMutation = trpc.admin.resetDashboardRangePresetPinOrder.useMutation({
    onSuccess: () => { toast.success("รีเซ็ตลำดับ Preset ที่ปักหมุดเป็นค่าเริ่มต้นแล้ว"); void utils.admin.listDashboardRangePresets.invalidate(); },
    onError: (error) => toast.error(error.message || "รีเซ็ตลำดับ Preset ที่ปักหมุดไม่สำเร็จ"),
  });
  const sortDashboardRangePresetPinsByUsageMutation = trpc.admin.sortDashboardRangePresetPinsByUsage.useMutation({
    onSuccess: () => { toast.success("จัดเรียง Preset ที่ปักหมุดตามความถี่การใช้แล้ว"); void utils.admin.listDashboardRangePresets.invalidate(); },
    onError: (error) => toast.error(error.message || "จัดเรียง Preset ตามความถี่การใช้ไม่สำเร็จ"),
  });
  const clearDashboardRangePresetPinsMutation = trpc.admin.clearDashboardRangePresetPins.useMutation({
    onSuccess: () => { toast.success("ยกเลิกการปักหมุดทั้งหมดแล้ว"); void utils.admin.listDashboardRangePresets.invalidate(); },
    onError: (error) => toast.error(error.message || "ยกเลิกการปักหมุดทั้งหมดไม่สำเร็จ"),
  });
  const createDashboardPresetCategoryMutation = trpc.admin.createDashboardPresetCategory.useMutation({
    onSuccess: () => { toast.success("สร้างหมวดหมู่ Preset แล้ว"); void utils.admin.listDashboardPresetCategories.invalidate(); },
    onError: (error) => toast.error(error.message || "สร้างหมวดหมู่ Preset ไม่สำเร็จ"),
  });
  const deleteDashboardPresetCategoryMutation = trpc.admin.deleteDashboardPresetCategory.useMutation({
    onSuccess: () => { toast.success("ลบหมวดหมู่ Preset แล้ว"); void utils.admin.listDashboardPresetCategories.invalidate(); void utils.admin.listDashboardRangePresets.invalidate(); },
    onError: (error) => toast.error(error.message || "ลบหมวดหมู่ Preset ไม่สำเร็จ"),
  });
  const setDashboardRangePresetCategoryMutation = trpc.admin.setDashboardRangePresetCategory.useMutation({
    onSuccess: () => { toast.success("อัปเดตหมวดหมู่ Preset แล้ว"); void utils.admin.listDashboardRangePresets.invalidate(); },
    onError: (error) => toast.error(error.message || "อัปเดตหมวดหมู่ Preset ไม่สำเร็จ"),
  });
  const updateDashboardPresetCategoryAppearanceMutation = trpc.admin.updateDashboardPresetCategoryAppearance.useMutation({
    onSuccess: () => { toast.success("อัปเดตรูปแบบโฟลเดอร์ Preset แล้ว"); void utils.admin.listDashboardPresetCategories.invalidate(); void utils.admin.listDashboardRangePresets.invalidate(); },
    onError: (error) => toast.error(error.message || "อัปเดตรูปแบบโฟลเดอร์ Preset ไม่สำเร็จ"),
  });
  const renameDashboardPresetCategoryMutation = trpc.admin.renameDashboardPresetCategory.useMutation({
    onSuccess: () => { toast.success("เปลี่ยนชื่อโฟลเดอร์ Preset แล้ว"); void utils.admin.listDashboardPresetCategories.invalidate(); void utils.admin.listDashboardRangePresets.invalidate(); },
    onError: (error) => toast.error(error.message || "เปลี่ยนชื่อโฟลเดอร์ Preset ไม่สำเร็จ"),
  });
  const setDashboardRangePresetCategoriesMutation = trpc.admin.setDashboardRangePresetCategories.useMutation({
    onSuccess: (result) => { toast.success(`ย้าย Preset ${result.count} รายการแล้ว`); void utils.admin.listDashboardRangePresets.invalidate(); void utils.admin.listDashboardPresetCategories.invalidate(); void utils.admin.listDashboardPresetCategoryMoveHistory.invalidate(); },
    onError: (error) => toast.error(error.message || "ย้าย Preset หลายรายการไม่สำเร็จ"),
  });
  const undoDashboardPresetCategoryMoveMutation = trpc.admin.undoDashboardPresetCategoryMove.useMutation({
    onSuccess: (result) => { toast.success(`ย้อนกลับการย้าย Preset ${result.count} รายการแล้ว`); void utils.admin.listDashboardRangePresets.invalidate(); void utils.admin.listDashboardPresetCategories.invalidate(); void utils.admin.listDashboardPresetCategoryMoveHistory.invalidate(); },
    onError: (error) => toast.error(error.message || "ย้อนกลับการย้าย Preset ไม่สำเร็จ"),
  });
  const redoDashboardPresetCategoryMoveMutation = trpc.admin.redoDashboardPresetCategoryMove.useMutation({
    onSuccess: (result) => { toast.success(`ทำซ้ำการย้าย Preset ${result.count} รายการแล้ว`); void utils.admin.listDashboardRangePresets.invalidate(); void utils.admin.listDashboardPresetCategories.invalidate(); void utils.admin.listDashboardPresetCategoryMoveHistory.invalidate(); },
    onError: (error) => toast.error(error.message || "ทำซ้ำการย้าย Preset ไม่สำเร็จ"),
  });

  useEffect(() => {
    if (hasAppliedDashboardPreference || !dashboardPreferences) return;
    const comparisonMode = dashboardPreferences.comparisonMode as DashboardComparisonMode;
    if (dashboardPreferences.customRangeStartDate && dashboardPreferences.customRangeEndDate) {
      setDashboardTimeRange({ startDate: dashboardPreferences.customRangeStartDate, endDate: dashboardPreferences.customRangeEndDate, comparisonMode });
    } else {
      setDashboardTimeRange((current) => ({ ...current, comparisonMode }));
    }
    setHasAppliedDashboardPreference(true);
  }, [dashboardPreferences, hasAppliedDashboardPreference]);

  const refreshAdminData = () => {
    void utils.admin.getDashboardStats.invalidate();
    void utils.admin.getPendingRequests.invalidate();
    void utils.admin.getPendingPaymentVerifications.invalidate();
    void utils.admin.listUsers.invalidate();
    void utils.admin.getActivityHistory.invalidate();
    void utils.admin.getLoanTypeDistribution.invalidate();
    void utils.admin.getPaymentStatusDistribution.invalidate();
    void utils.admin.getPaymentTrendChart.invalidate();
    void utils.admin.getDashboardKpiDetails.invalidate();
  };

  const approveRequestMutation = trpc.loan.approveRequest.useMutation({
    onSuccess: () => {
      toast.success("อนุมัติคำขอกู้และสร้างสัญญาเรียบร้อยแล้ว");
      refreshAdminData();
    },
    onError: (error) => toast.error(error.message || "อนุมัติคำขอกู้ไม่สำเร็จ"),
  });
  const rejectRequestMutation = trpc.loan.rejectRequest.useMutation({
    onSuccess: () => {
      toast.success("ปฏิเสธคำขอกู้เรียบร้อยแล้ว");
      refreshAdminData();
    },
    onError: (error) => toast.error(error.message || "ปฏิเสธคำขอกู้ไม่สำเร็จ"),
  });
  const verifyPaymentMutation = trpc.loan.verifyPayment.useMutation({
    onSuccess: () => {
      toast.success("ยืนยันการชำระเงินเรียบร้อยแล้ว");
      refreshAdminData();
    },
    onError: (error) => toast.error(error.message || "ยืนยันการชำระเงินไม่สำเร็จ"),
  });
  const rejectPaymentMutation = trpc.loan.rejectPayment.useMutation({
    onSuccess: () => {
      toast.success("ปฏิเสธหลักฐานการชำระเงินเรียบร้อยแล้ว");
      refreshAdminData();
    },
    onError: (error) => toast.error(error.message || "ปฏิเสธหลักฐานไม่สำเร็จ"),
  });
  const updateRoleMutation = trpc.admin.updateUserRole.useMutation({
    onSuccess: () => {
      toast.success("อัปเดตบทบาทผู้ใช้แล้ว");
      refreshAdminData();
    },
    onError: (error) => toast.error(error.message || "อัปเดตบทบาทไม่สำเร็จ"),
  });

  // ดึงข้อมูลสรุป
  const { data: stats, isLoading: statsLoading } = trpc.admin.getDashboardStats.useQuery();

  // ดึงข้อมูลคำขอกู้ที่รอการอนุมัติ
  const { data: pendingRequests, isLoading: requestsLoading } =
    trpc.admin.getPendingRequests.useQuery();

  // ดึงข้อมูลการชำระเงินที่รอการตรวจสอบ
  const { data: pendingPayments, isLoading: paymentsLoading } =
    trpc.admin.getPendingPaymentVerifications.useQuery();
  const { data: adminUsers, isLoading: usersLoading } = trpc.admin.listUsers.useQuery();
  const { data: activityHistory, isLoading: activityLoading } = trpc.admin.getActivityHistory.useQuery({ limit: 12 });

  // ดึงข้อมูลกราฟ
  const { data: loanStatusChart, isLoading: loanStatusChartLoading } = trpc.admin.getLoanStatusChart.useQuery();
  const { data: outstandingChart, isLoading: outstandingChartLoading } = trpc.admin.getOutstandingChart.useQuery();
  const { data: paymentTrendChart, isLoading: paymentTrendChartLoading } = trpc.admin.getPaymentTrendChart.useQuery(dashboardTimeRange);
  const { data: kpiComparison, isLoading: kpiComparisonLoading } = trpc.admin.getDashboardKpiComparison.useQuery(dashboardTimeRange);
  const { data: loanTypeDistribution, isLoading: loanTypeDistributionLoading } = trpc.admin.getLoanTypeDistribution.useQuery();
  const { data: paymentStatusDistribution, isLoading: paymentStatusDistributionLoading } = trpc.admin.getPaymentStatusDistribution.useQuery();
  const { data: loanTypeDetails, isLoading: loanTypeDetailsLoading } = trpc.admin.getLoanTypeDrilldown.useQuery(undefined, { enabled: drilldown?.kind === "loanType" });
  const { data: paymentStatusDetails, isLoading: paymentStatusDetailsLoading } = trpc.admin.getPaymentStatusDrilldown.useQuery(undefined, { enabled: drilldown?.kind === "paymentStatus" });
  const { data: kpiDetail, isLoading: kpiDetailLoading } = trpc.admin.getDashboardKpiDetails.useQuery({ metric: selectedKpiMetric ?? "users", limit: 50 }, { enabled: selectedKpiMetric !== null });
  const paymentTrendViewState = getPaymentTrendViewState(paymentTrendChart);
  const paymentTrendData =
    paymentTrendViewState === "chart" && paymentTrendChart ? paymentTrendChart : null;
  const filteredLoanTypeDetails = drilldown?.kind === "loanType" ? filterLoanTypeDrilldown(loanTypeDetails ?? [], drilldown.name, drilldownSearch) : [];
  const filteredPaymentStatusDetails = drilldown?.kind === "paymentStatus" ? filterPaymentStatusDrilldown(paymentStatusDetails ?? [], drilldown.name, drilldownSearch) : [];

  const exportDrilldownCSV = () => {
    if (!drilldown) return;
    if (drilldown.kind === "loanType") {
      const rows = filteredLoanTypeDetails;
      downloadHistoryCSV({
        title: `รายละเอียดสินเชื่อ: ${drilldown.name}`,
        subtitle: `จำนวน ${rows.length} สัญญา • ส่งออกเมื่อ ${new Date().toLocaleDateString("th-TH")}`,
        filenamePrefix: `loan_type_${drilldown.name}`,
        columns: [
          { header: "สัญญา", value: (loan) => `#${loan.id}` },
          { header: "รูปแบบ", value: (loan) => loan.paymentType === "fixed" ? "ผ่อนคงที่" : "ลดต้นลดดอก" },
          { header: "เงินต้น", value: (loan) => Number(loan.principalAmount).toLocaleString("th-TH", { maximumFractionDigits: 2 }) },
          { header: "ชำระแล้ว", value: (loan) => Number(loan.totalPaid || 0).toLocaleString("th-TH", { maximumFractionDigits: 2 }) },
          { header: "สถานะ", value: (loan) => loan.isClosed ? "ปิดแล้ว" : "กำลังดำเนิน" },
        ],
        rows,
      });
      toast.success(`ดาวน์โหลด CSV สำเร็จ (${rows.length} สัญญา)`);
      return;
    }
    const rows = filteredPaymentStatusDetails;
    downloadHistoryCSV({
      title: `รายละเอียดการชำระ: ${drilldown.name}`,
      subtitle: `จำนวน ${rows.length} รายการ • ส่งออกเมื่อ ${new Date().toLocaleDateString("th-TH")}`,
      filenamePrefix: `payment_status_${drilldown.name}`,
      columns: [
        { header: "สัญญา", value: (payment) => `#${payment.loanId}` },
        { header: "วันที่", value: (payment) => new Date(payment.paymentDate).toLocaleDateString("th-TH") },
        { header: "จำนวนเงิน", value: (payment) => Number(payment.amountPaid).toLocaleString("th-TH", { maximumFractionDigits: 2 }) },
        { header: "ช่องทาง", value: (payment) => payment.paymentMethod },
        { header: "สถานะ", value: () => drilldown.name },
      ],
      rows,
    });
    toast.success(`ดาวน์โหลด CSV สำเร็จ (${rows.length} รายการ)`);
  };
  const exportDrilldownPDF = async () => {
    try {
      if (!drilldown) return;
      if (drilldown.kind === "loanType") {
      const rows = filteredLoanTypeDetails;
      await downloadHistoryPDF({ title: `รายละเอียดสินเชื่อ: ${drilldown.name}`, subtitle: `จำนวน ${rows.length} สัญญา`, filenamePrefix: `loan_type_${drilldown.name}`, columns: [{ header: "สัญญา", value: (loan) => `#${loan.id}` }, { header: "รูปแบบ", value: (loan) => loan.paymentType === "fixed" ? "ผ่อนคงที่" : "ลดต้นลดดอก" }, { header: "เงินต้น", value: (loan) => Number(loan.principalAmount).toLocaleString("th-TH") }, { header: "ชำระแล้ว", value: (loan) => Number(loan.totalPaid || 0).toLocaleString("th-TH") }, { header: "สถานะ", value: (loan) => loan.isClosed ? "ปิดแล้ว" : "กำลังดำเนิน" }], rows });
      } else {
      const rows = filteredPaymentStatusDetails;
      await downloadHistoryPDF({ title: `รายละเอียดการชำระ: ${drilldown.name}`, subtitle: `จำนวน ${rows.length} รายการ`, filenamePrefix: `payment_status_${drilldown.name}`, columns: [{ header: "สัญญา", value: (payment) => `#${payment.loanId}` }, { header: "วันที่", value: (payment) => new Date(payment.paymentDate).toLocaleDateString("th-TH") }, { header: "จำนวนเงิน", value: (payment) => Number(payment.amountPaid).toLocaleString("th-TH") }, { header: "ช่องทาง", value: (payment) => payment.paymentMethod }], rows });
      }
      toast.success("ดาวน์โหลด PDF สำเร็จ");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "ไม่สามารถสร้างรายงาน PDF ได้");
    }
  };
  const executeConfirmation = () => {
    if (!confirmation) return;
    if (confirmation.type === "approve") approveRequestMutation.mutate({ requestId: confirmation.id });
    if (confirmation.type === "reject") rejectRequestMutation.mutate({ requestId: confirmation.id, reason: confirmation.reason || "ไม่ผ่านเกณฑ์การพิจารณา" });
    if (confirmation.type === "verify") verifyPaymentMutation.mutate({ paymentId: confirmation.id });
    if (confirmation.type === "rejectPayment") rejectPaymentMutation.mutate({ paymentId: confirmation.id, reason: confirmation.reason || "หลักฐานไม่ถูกต้อง" });
    setConfirmation(null);
  };

  if (!user || !canAccessAdminDashboard(user.role)) {
    return (
      <DashboardLayout>
        <div className="text-center space-y-4">
          <p className="text-muted-foreground">คุณไม่มีสิทธิ์เข้าถึงหน้านี้</p>
        </div>
      </DashboardLayout>
    );
  }

  if (statsLoading) {
    return (
      <DashboardLayout>
        <div className="space-y-4" role="status" aria-live="polite" aria-busy="true" aria-label="กำลังโหลดข้อมูลสถิติ">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 motion-safe:animate-spin motion-reduce:animate-none text-accent" aria-hidden="true" />
            <span>กำลังโหลดข้อมูลสถิติและกราฟ...</span>
          </div>
          <div className="h-8 rounded bg-muted motion-safe:animate-pulse motion-reduce:animate-none" />
          <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="h-32 rounded bg-muted motion-safe:animate-pulse motion-reduce:animate-none" style={{ animationDelay: `${i * 80}ms` }} />
            ))}
          </div>
          <div className="h-64 rounded bg-muted motion-safe:animate-pulse motion-reduce:animate-none" />
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="space-y-8">
        {selectedTab !== "overview" && <>
        <Card className="glass-panel p-5"><div className="mb-3 flex items-center justify-between"><div><h2 className="font-semibold">Activity History</h2><p className="text-sm text-muted-foreground">การอนุมัติและการชำระเงินล่าสุด</p></div><TrendingUp className="h-5 w-5 text-primary"/></div>{activityLoading ? <DashboardChartLoading label="กำลังโหลดประวัติการทำรายการ..." bars={3}/> : activityHistory?.length ? <div className="space-y-3">{activityHistory.map((activity) => <div key={activity.id} className="flex items-start gap-3 border-b border-border/60 pb-3 last:border-0 last:pb-0"><span className={`mt-1 h-2.5 w-2.5 rounded-full ${activity.status === "approved" || activity.status === "verified" ? "bg-emerald-500" : "bg-rose-500"}`}/><div className="min-w-0 flex-1"><p className="font-medium">{activity.title}</p><p className="text-sm text-muted-foreground">{activity.detail} • ดำเนินการโดย {activity.actorName} • {new Date(activity.occurredAt).toLocaleString("th-TH")}</p></div>{activity.loanId && <Link href={`/loan/${activity.loanId}`} className="text-sm text-primary hover:underline">ดูสัญญา</Link>}</div>)}</div> : <p className="py-4 text-sm text-muted-foreground">ยังไม่มีประวัติการทำรายการ</p>}</Card>
        {/* Header */}
        <div className="space-y-2">
          <h1 className="text-3xl font-bold">Admin Dashboard</h1>
          <p className="text-muted-foreground">สรุปข้อมูลภาพรวมของระบบ</p>
        </div>

        {/* Key Statistics */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Total Users */}
          <Card className="p-6 border border-border rounded-lg">
            <div className="flex items-start justify-between">
              <div className="space-y-2">
                <p className="text-sm text-muted-foreground">จำนวนผู้ใช้ทั้งหมด</p>
                <p className="text-3xl font-bold text-accent">{stats?.users.total || 0}</p>
                <p className="text-xs text-muted-foreground">
                  ผู้กู้: {stats?.users.borrowers || 0} • ผู้ให้กู้: {stats?.users.lenders || 0}
                </p>
              </div>
              <Users className="w-8 h-8 text-accent opacity-50" />
            </div>
          </Card>

          {/* Total Loans */}
          <Card className="p-6 border border-border rounded-lg">
            <div className="flex items-start justify-between">
              <div className="space-y-2">
                <p className="text-sm text-muted-foreground">จำนวนสัญญาเงินกู้</p>
                <p className="text-3xl font-bold text-green-600">{stats?.loans.total || 0}</p>
                <p className="text-xs text-muted-foreground">
                  กำลังดำเนิน: {stats?.loans.active || 0} • ปิดแล้ว: {stats?.loans.closed || 0}
                </p>
              </div>
              <Banknote className="w-8 h-8 text-green-600 opacity-50" />
            </div>
          </Card>

          {/* Total Principal */}
          <Card className="p-6 border border-border rounded-lg">
            <div className="flex items-start justify-between">
              <div className="space-y-2">
                <p className="text-sm text-muted-foreground">เงินต้นทั้งหมด</p>
                <p className="text-3xl font-bold text-blue-600">
                  ฿{(stats?.loans.totalPrincipal || 0).toLocaleString("th-TH", {
                    maximumFractionDigits: 0,
                  })}
                </p>
                <p className="text-xs text-muted-foreground">
                  ชำระแล้ว: ฿
                  {(stats?.loans.totalPaid || 0).toLocaleString("th-TH", {
                    maximumFractionDigits: 0,
                  })}
                </p>
              </div>
              <TrendingUp className="w-8 h-8 text-blue-600 opacity-50" />
            </div>
          </Card>

          {/* Outstanding Amount */}
          <Card className="p-6 border border-border rounded-lg">
            <div className="flex items-start justify-between">
              <div className="space-y-2">
                <p className="text-sm text-muted-foreground">ยอดคงค้าง</p>
                <p className="text-3xl font-bold text-orange-600">
                  ฿{(stats?.loans.totalOutstanding || 0).toLocaleString("th-TH", {
                    maximumFractionDigits: 0,
                  })}
                </p>
                <p className="text-xs text-muted-foreground">
                  อัตราดอกเบี้ยเฉลี่ย: {stats?.loans.avgInterestRate || 0}%
                </p>
              </div>
              <AlertCircle className="w-8 h-8 text-orange-600 opacity-50" />
            </div>
          </Card>
        </div>
        </>}

        {/* Tabs */}
        <div className="flex gap-2 overflow-x-auto border-b border-border pb-1" aria-label="เมนูจัดการระบบ">
          <button
            onClick={() => setSelectedTab("overview")}
            className={`shrink-0 px-4 py-2 font-medium border-b-2 transition-colors ${
              selectedTab === "overview"
                ? "border-accent text-accent"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            ภาพรวม
          </button>
          <button
            onClick={() => setSelectedTab("requests")}
            className={`shrink-0 px-4 py-2 font-medium border-b-2 transition-colors ${
              selectedTab === "requests"
                ? "border-accent text-accent"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            คำขอกู้ที่รอการอนุมัติ ({pendingRequests?.length || 0})
          </button>
          <button
            onClick={() => setSelectedTab("payments")}
            className={`shrink-0 px-4 py-2 font-medium border-b-2 transition-colors ${
              selectedTab === "payments"
                ? "border-accent text-accent"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            การชำระเงินที่รอตรวจสอบ ({pendingPayments?.length || 0})
          </button>
          <button
            onClick={() => setSelectedTab("users")}
            className={`shrink-0 px-4 py-2 font-medium border-b-2 transition-colors ${
              selectedTab === "users"
                ? "border-accent text-accent"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            จัดการผู้ใช้ ({adminUsers?.length || 0})
          </button>
        </div>

        {selectedTab === "overview" && <ProfessionalLoanDashboard
          stats={stats}
          paymentTrend={paymentTrendChart ?? null}
          outstanding={outstandingChart ?? null}
          loanStatus={loanStatusChart ?? null}
          loanTypes={loanTypeDistribution ?? []}
          paymentStatuses={paymentStatusDistribution ?? []}
          activities={activityHistory ?? []}
          loading={statsLoading}
          chartLoading={{ trend: paymentTrendChartLoading, outstanding: outstandingChartLoading, loanStatus: loanStatusChartLoading, loanTypes: loanTypeDistributionLoading, paymentStatuses: paymentStatusDistributionLoading, activity: activityLoading }}
          timeRange={"days" in dashboardTimeRange ? dashboardTimeRange.days : null}
          customRange={"startDate" in dashboardTimeRange ? { startDate: dashboardTimeRange.startDate, endDate: dashboardTimeRange.endDate } : null}
          comparisonMode={dashboardTimeRange.comparisonMode}
          onTimeRangeChange={(days) => setDashboardTimeRange((current) => ({ days, comparisonMode: current.comparisonMode }))}
          onCustomRangeApply={(range) => setDashboardTimeRange((current) => ({ ...range, comparisonMode: current.comparisonMode }))}
          onComparisonModeChange={(comparisonMode) => setDashboardTimeRange((current) => "days" in current ? { days: current.days, comparisonMode } : { startDate: current.startDate, endDate: current.endDate, comparisonMode })}
          onSaveCustomRange={(range) => saveDashboardPreferencesMutation.mutate({ ...range, comparisonMode: dashboardTimeRange.comparisonMode })}
          rangePresets={dashboardRangePresets}
          recentRangePresets={recentDashboardRangePresets}
          onPresetApply={(range) => setDashboardTimeRange((current) => ({ ...range, comparisonMode: current.comparisonMode }))}
          onPresetUse={(id) => markDashboardRangePresetUsedMutation.mutate({ id })}
          onSavePreset={(input) => saveDashboardRangePresetMutation.mutate(input)}
          onDeletePreset={(id) => deleteDashboardRangePresetMutation.mutate({ id })}
          onSharePreset={(input) => setDashboardRangePresetSharingMutation.mutate(input)}
          onCopyPresetToPrivate={(id) => copyDashboardRangePresetToPrivateMutation.mutate({ id })}
          onPresetPinToggle={(input) => setDashboardRangePresetPinMutation.mutate(input)}
          onClearRecentPresets={() => clearDashboardRangePresetHistoryMutation.mutate()}
          onPinnedPresetReorder={(presetIds, action) => reorderDashboardRangePresetPinsMutation.mutate({ presetIds }, { onSuccess: () => toast.success(action === "undo" ? "คืนลำดับ Preset ที่ปักหมุดแล้ว" : action === "redo" ? "ทำซ้ำลำดับ Preset ที่ปักหมุดแล้ว" : "บันทึกลำดับ Preset ที่ปักหมุดแล้ว") })}
          onResetPinnedPresetOrder={() => resetDashboardRangePresetPinOrderMutation.mutate()}
          onSortPinnedPresetsByUsage={() => sortDashboardRangePresetPinsByUsageMutation.mutate()}
          onClearAllPresetPins={() => clearDashboardRangePresetPinsMutation.mutate()}
          presetCategories={dashboardPresetCategories}
          onCreatePresetCategory={(input) => createDashboardPresetCategoryMutation.mutate(input)}
          onUpdatePresetCategoryAppearance={(input) => updateDashboardPresetCategoryAppearanceMutation.mutate(input)}
          onRenamePresetCategory={(input) => renameDashboardPresetCategoryMutation.mutate(input)}
          onDeletePresetCategory={(id) => deleteDashboardPresetCategoryMutation.mutate({ id })}
          onPresetCategoryChange={(input) => setDashboardRangePresetCategoryMutation.mutate(input)}
          onPresetCategoriesBulkChange={(input) => setDashboardRangePresetCategoriesMutation.mutate(input)}
          presetCategoryMoveHistory={dashboardPresetCategoryMoveHistory}
          onUndoPresetCategoryMove={(id) => undoDashboardPresetCategoryMoveMutation.mutate({ id })}
          onRedoPresetCategoryMove={(id) => redoDashboardPresetCategoryMoveMutation.mutate({ id })}
          isUndoingPresetCategoryMove={undoDashboardPresetCategoryMoveMutation.isPending}
          isRedoingPresetCategoryMove={redoDashboardPresetCategoryMoveMutation.isPending}
          presetSearch={presetSearch}
          onPresetSearchChange={setPresetSearch}
          presetCreatorSearch={presetCreatorSearch}
          onPresetCreatorSearchChange={setPresetCreatorSearch}
          presetSort={presetSort}
          onPresetSortChange={setPresetSort}
          presetScope={presetScope}
          onPresetScopeChange={setPresetScope}
          onResetDashboardDefaults={() => resetDashboardPreferencesMutation.mutate()}
          isPresetActionPending={saveDashboardRangePresetMutation.isPending || deleteDashboardRangePresetMutation.isPending || setDashboardRangePresetSharingMutation.isPending || copyDashboardRangePresetToPrivateMutation.isPending || setDashboardRangePresetPinMutation.isPending || createDashboardPresetCategoryMutation.isPending || updateDashboardPresetCategoryAppearanceMutation.isPending || renameDashboardPresetCategoryMutation.isPending || deleteDashboardPresetCategoryMutation.isPending || setDashboardRangePresetCategoryMutation.isPending || setDashboardRangePresetCategoriesMutation.isPending || undoDashboardPresetCategoryMoveMutation.isPending || redoDashboardPresetCategoryMoveMutation.isPending}
          isClearingRecentPresets={clearDashboardRangePresetHistoryMutation.isPending}
          isReorderingPresetPins={reorderDashboardRangePresetPinsMutation.isPending || resetDashboardRangePresetPinOrderMutation.isPending || sortDashboardRangePresetPinsByUsageMutation.isPending}
          isClearingPresetPins={clearDashboardRangePresetPinsMutation.isPending}
          isResettingDefaults={resetDashboardPreferencesMutation.isPending}
          isRefreshingPeriod={paymentTrendChartLoading || kpiComparisonLoading || dashboardPreferencesLoading}
          isSavingDefault={saveDashboardPreferencesMutation.isPending}
          kpiComparison={kpiComparison ?? null}
          kpiDetail={kpiDetail ?? null}
          kpiDetailLoading={kpiDetailLoading}
          onKpiSelect={setSelectedKpiMetric}
          onKpiDetailClose={() => setSelectedKpiMetric(null)}
          onLoanTypeSelect={(slice) => setDrilldown({ kind: "loanType", ...slice })}
          onPaymentStatusSelect={(slice) => setDrilldown({ kind: "paymentStatus", ...slice })}
        />}

        {/* Legacy overview retained for rollback safety; the professional overview is now the active view. */}
        {selectedTab === "legacyOverview" && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Outstanding by Loan Chart */}
            <Card className="p-6 border border-border rounded-lg lg:col-span-2">
              <div className="flex items-start justify-between gap-4 mb-5">
                <div>
                  <h2 className="text-xl font-bold">ยอดคงค้างรายสัญญา</h2>
                  <p className="text-sm text-muted-foreground mt-1">เฉพาะสัญญาที่ยังดำเนินอยู่</p>
                </div>
                <TrendingUp className="w-7 h-7 text-orange-600 opacity-60" />
              </div>
              {outstandingChartLoading ? (
                <DashboardChartLoading label="กำลังโหลดข้อมูลยอดคงค้าง..." />
              ) : outstandingChart && outstandingChart.length > 0 ? (
                <div className="space-y-3">
                  {outstandingChart.map((item) => {
                    const maxOutstanding = Math.max(...outstandingChart.map((row) => row.value), 1);
                    const width = Math.max((item.value / maxOutstanding) * 100, item.value > 0 ? 2 : 0);
                    return (
                      <div key={item.label} className="grid grid-cols-[5rem_1fr_7rem] items-center gap-3 text-xs">
                        <span className="text-muted-foreground">{item.label}</span>
                        <div className="h-3 overflow-hidden rounded-full bg-muted">
                          <div className="h-full rounded-full bg-gradient-to-r from-orange-400 to-rose-500" style={{ width: `${width}%` }} />
                        </div>
                        <span className="text-right font-medium">฿{item.value.toLocaleString("th-TH", { maximumFractionDigits: 0 })}</span>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <p className="text-muted-foreground text-center py-8">ยังไม่มีข้อมูลยอดคงค้าง</p>
              )}
            </Card>

            {/* Loan Status Chart */}
            <Card className="p-6 border border-border rounded-lg">
              <h2 className="text-xl font-bold mb-4">สถานะของสัญญาเงินกู้</h2>
              {loanStatusChartLoading ? (
                <DashboardChartLoading label="กำลังโหลดข้อมูลสถานะสัญญา..." bars={3} />
              ) : loanStatusChart ? (
                <div className="space-y-4">
                  {loanStatusChart.labels.map((label, idx) => (
                    <div key={label} className="space-y-2">
                      <div className="flex justify-between">
                        <span className="text-sm font-medium">{label}</span>
                        <span className="text-sm font-bold">{loanStatusChart.data[idx]}</span>
                      </div>
                      <div className="w-full bg-muted rounded-full h-2">
                        <div
                          className={`h-2 rounded-full ${
                            idx === 0 ? "bg-green-600" : "bg-blue-600"
                          }`}
                          style={{
                            width: `${
                              (loanStatusChart.data[idx] /
                                (stats?.loans.total || 1)) *
                              100
                            }%`,
                          }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-muted-foreground text-center py-8">ยังไม่มีข้อมูลสถานะสัญญา</p>
              )}
            </Card>

            {/* Request Status */}
            <Card className="p-6 border border-border rounded-lg">
              <h2 className="text-xl font-bold mb-4">สถานะของคำขอกู้</h2>
              <div className="space-y-4">
                <div className="space-y-2">
                  <div className="flex justify-between">
                    <span className="text-sm font-medium">รอการอนุมัติ</span>
                    <span className="text-sm font-bold text-orange-600">
                      {stats?.requests.pending || 0}
                    </span>
                  </div>
                  <div className="w-full bg-muted rounded-full h-2">
                    <div
                      className="h-2 rounded-full bg-orange-600"
                      style={{
                        width: `${
                          (stats?.requests.pending || 0) /
                          (stats?.requests.total || 1) *
                          100
                        }%`,
                      }}
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="flex justify-between">
                    <span className="text-sm font-medium">อนุมัติแล้ว</span>
                    <span className="text-sm font-bold text-green-600">
                      {stats?.requests.approved || 0}
                    </span>
                  </div>
                  <div className="w-full bg-muted rounded-full h-2">
                    <div
                      className="h-2 rounded-full bg-green-600"
                      style={{
                        width: `${
                          (stats?.requests.approved || 0) /
                          (stats?.requests.total || 1) *
                          100
                        }%`,
                      }}
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="flex justify-between">
                    <span className="text-sm font-medium">ปฏิเสธ</span>
                    <span className="text-sm font-bold text-red-600">
                      {stats?.requests.rejected || 0}
                    </span>
                  </div>
                  <div className="w-full bg-muted rounded-full h-2">
                    <div
                      className="h-2 rounded-full bg-red-600"
                      style={{
                        width: `${
                          (stats?.requests.rejected || 0) /
                          (stats?.requests.total || 1) *
                          100
                        }%`,
                      }}
                    />
                  </div>
                </div>
              </div>
            </Card>

            {/* Payment Status */}
            <Card className="p-6 border border-border rounded-lg">
              <h2 className="text-xl font-bold mb-4">สถานะของการชำระเงิน</h2>
              <div className="space-y-4">
                <div className="space-y-2">
                  <div className="flex justify-between">
                    <span className="text-sm font-medium">รอตรวจสอบ</span>
                    <span className="text-sm font-bold text-orange-600">
                      {stats?.payments.pending || 0}
                    </span>
                  </div>
                  <div className="w-full bg-muted rounded-full h-2">
                    <div
                      className="h-2 rounded-full bg-orange-600"
                      style={{
                        width: `${
                          (stats?.payments.pending || 0) /
                          (stats?.payments.total || 1) *
                          100
                        }%`,
                      }}
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="flex justify-between">
                    <span className="text-sm font-medium">ตรวจสอบแล้ว</span>
                    <span className="text-sm font-bold text-green-600">
                      {stats?.payments.verified || 0}
                    </span>
                  </div>
                  <div className="w-full bg-muted rounded-full h-2">
                    <div
                      className="h-2 rounded-full bg-green-600"
                      style={{
                        width: `${
                          (stats?.payments.verified || 0) /
                          (stats?.payments.total || 1) *
                          100
                        }%`,
                      }}
                    />
                  </div>
                </div>
              </div>
            </Card>

            <Card className="p-6 border border-border rounded-lg">
              <div className="mb-4">
                <h2 className="text-xl font-bold">สัดส่วนประเภทสินเชื่อ</h2>
                <p className="mt-1 text-sm text-muted-foreground">แยกตามรูปแบบการผ่อนชำระ</p>
              </div>
              {loanTypeDistributionLoading ? (
                <DashboardChartLoading label="กำลังโหลดสัดส่วนประเภทสินเชื่อ..." bars={3} />
              ) : loanTypeDistribution?.some((item) => item.value > 0) ? (
                <DashboardPieChart
                  data={loanTypeDistribution}
                  colors={["#059669", "#84cc16"]}
                  label="กราฟวงกลมสัดส่วนประเภทสินเชื่อ"
                  onSliceClick={(slice) => setDrilldown({ kind: "loanType", ...slice })}
                />
              ) : (
                <p className="py-8 text-center text-muted-foreground">ยังไม่มีข้อมูลประเภทสินเชื่อ</p>
              )}
            </Card>

            <Card className="p-6 border border-border rounded-lg">
              <div className="mb-4">
                <h2 className="text-xl font-bold">สัดส่วนสถานะการชำระ</h2>
                <p className="mt-1 text-sm text-muted-foreground">ภาพรวมรายการชำระเงินทั้งหมด</p>
              </div>
              {paymentStatusDistributionLoading ? (
                <DashboardChartLoading label="กำลังโหลดสัดส่วนสถานะการชำระ..." bars={3} />
              ) : paymentStatusDistribution?.some((item) => item.value > 0) ? (
                <DashboardPieChart
                  data={paymentStatusDistribution}
                  colors={["#f59e0b", "#10b981", "#ef4444"]}
                  label="กราฟวงกลมสัดส่วนสถานะการชำระ"
                  onSliceClick={(slice) => setDrilldown({ kind: "paymentStatus", ...slice })}
                />
              ) : (
                <p className="py-8 text-center text-muted-foreground">ยังไม่มีข้อมูลสถานะการชำระ</p>
              )}
            </Card>

            {/* Payment Trend Chart */}
            <Card className="p-6 border border-border rounded-lg lg:col-span-2">
              <div className="flex items-start justify-between gap-4 mb-5">
                <div>
                  <h2 className="text-xl font-bold">แนวโน้มการชำระเงิน</h2>
                  <p className="text-sm text-muted-foreground mt-1">ยอดชำระรวมย้อนหลัง 12 เดือน</p>
                </div>
                <BarChart3 className="w-7 h-7 text-accent opacity-60" />
              </div>

              {paymentTrendChartLoading ? (
                <DashboardChartLoading label="กำลังโหลดข้อมูลแนวโน้มการชำระเงิน..." bars={5} />
              ) : paymentTrendData ? (
                <div className="space-y-3">
                  <div className="h-52 flex items-end gap-1 sm:gap-2 border-b border-border px-1">
                    {paymentTrendData.data.map((amount, index) => {
                      const height = calculatePaymentBarHeight(amount, paymentTrendData.data);

                      return (
                        <div key={`${paymentTrendData.labels[index]}-${index}`} className="flex-1 h-full flex flex-col justify-end items-center gap-2 min-w-0">
                          <span className="text-[10px] text-muted-foreground truncate max-w-full" title={`${amount.toLocaleString("th-TH", { maximumFractionDigits: 0 })} บาท`}>
                            {amount > 0 ? amount.toLocaleString("th-TH", { maximumFractionDigits: 0 }) : "-"}
                          </span>
                          <div
                            className="w-full max-w-10 rounded-t-md bg-gradient-to-t from-emerald-600 to-lime-400 transition-all"
                            style={{ height: `${height}%` }}
                            title={`${paymentTrendData.labels[index]}: ${amount.toLocaleString("th-TH", { maximumFractionDigits: 2 })} บาท`}
                          />
                        </div>
                      );
                    })}
                  </div>
                  <div className="flex gap-1 sm:gap-2 px-1">
                    {paymentTrendData.labels.map((label, index) => (
                      <span key={`${label}-axis-${index}`} className="flex-1 text-center text-[10px] text-muted-foreground truncate" title={label}>
                        {label}
                      </span>
                    ))}
                  </div>
                </div>
              ) : (
                <p className="text-muted-foreground text-center py-8">ยังไม่มีข้อมูลการชำระเงิน</p>
              )}
            </Card>
          </div>
        )}

        {/* Users Tab */}
        {selectedTab === "users" && (
          <Card className="p-6 border border-border rounded-lg">
            <h2 className="text-xl font-bold mb-4">จัดการผู้ใช้</h2>
            {usersLoading ? (
              <div className="space-y-2">{[...Array(3)].map((_, index) => <div key={index} className="h-12 bg-muted rounded animate-pulse" />)}</div>
            ) : adminUsers && adminUsers.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="border-b border-border"><tr><th className="text-left py-2 px-2">ผู้ใช้</th><th className="text-left py-2 px-2">อีเมล</th><th className="text-center py-2 px-2">บทบาท</th><th className="text-center py-2 px-2">เข้าสู่ระบบล่าสุด</th></tr></thead>
                  <tbody>
                    {adminUsers.map((adminUser) => (
                      <tr key={adminUser.id} className="border-b border-border">
                        <td className="py-3 px-2">{adminUser.name || "ไม่ระบุชื่อ"}</td>
                        <td className="py-3 px-2 text-muted-foreground">{adminUser.email || "-"}</td>
                        <td className="py-3 px-2 text-center">
                          <select
                            value={adminUser.role}
                            onChange={(event) => updateRoleMutation.mutate({ userId: adminUser.id, role: event.target.value as "borrower" | "lender" | "admin" })}
                            disabled={updateRoleMutation.isPending || adminUser.id === user?.id}
                            aria-label={`บทบาทของ ${adminUser.name || adminUser.email || adminUser.id}`}
                            className="rounded-md border border-input bg-background px-2 py-1 text-sm"
                          >
                            <option value="borrower">ผู้กู้</option>
                            <option value="lender">ผู้ให้กู้</option>
                            <option value="admin">ผู้ดูแลระบบ</option>
                          </select>
                        </td>
                        <td className="py-3 px-2 text-center text-muted-foreground">{adminUser.lastSignedIn ? new Date(adminUser.lastSignedIn).toLocaleDateString("th-TH") : "-"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : <p className="text-muted-foreground text-center py-8">ยังไม่มีข้อมูลผู้ใช้</p>}
          </Card>
        )}

        {/* Pending Requests Tab */}
        {selectedTab === "requests" && (
          <Card className="p-6 border border-border rounded-lg">
            <h2 className="text-xl font-bold mb-4">คำขอกู้ที่รอการอนุมัติ</h2>
            {requestsLoading ? (
              <div className="space-y-2">
                {[...Array(3)].map((_, i) => (
                  <div key={i} className="h-16 bg-muted rounded animate-pulse" />
                ))}
              </div>
            ) : pendingRequests && pendingRequests.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="border-b border-border">
                    <tr>
                      <th className="text-left py-2 px-2">ชื่อผู้กู้</th>
                      <th className="text-right py-2 px-2">จำนวนเงิน</th>
                      <th className="text-right py-2 px-2">อัตราดอกเบี้ย</th>
                      <th className="text-center py-2 px-2">ระยะเวลา</th>
                      <th className="text-center py-2 px-2">ประเภท</th>
                      <th className="text-center py-2 px-2">วันที่ขอ</th>
                      <th className="text-center py-2 px-2">จัดการ</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pendingRequests.map((req) => (
                      <tr key={req.id} className="border-b border-border hover:bg-muted/50">
                        <td className="py-2 px-2">{req.borrowerName}</td>
                        <td className="text-right py-2 px-2">
                          ฿{parseFloat(req.amountRequested.toString()).toLocaleString("th-TH", {
                            maximumFractionDigits: 2,
                          })}
                        </td>
                        <td className="text-right py-2 px-2">{req.interestRate}%</td>
                        <td className="text-center py-2 px-2">{req.loanTermMonths} เดือน</td>
                        <td className="text-center py-2 px-2">
                          <span className="text-xs bg-blue-100 text-blue-800 px-2 py-1 rounded">
                            {req.interestType === "simple" ? "Simple" : "Compound"}
                          </span>
                        </td>
                        <td className="text-center py-2 px-2">
                          {new Date(req.requestedAt).toLocaleDateString("th-TH")}
                        </td>
                        <td className="min-w-[280px] py-2 px-2">
                          <div className="flex flex-col gap-2">
                            <div className="flex gap-2">
                              <Button
                                size="sm"
                                onClick={() => setConfirmation({ type: "approve", id: req.id })}
                                disabled={approveRequestMutation.isPending || rejectRequestMutation.isPending}
                                className="bg-emerald-600 hover:bg-emerald-700"
                              >
                                อนุมัติ
                              </Button>
                              <Button
                                size="sm"
                                variant="destructive"
                                onClick={() => setConfirmation({ type: "reject", id: req.id, reason: requestReasons[req.id]?.trim() || "ไม่ผ่านเกณฑ์การพิจารณา" })}
                                disabled={rejectRequestMutation.isPending || !hasDecisionReason(requestReasons[req.id])}
                              >
                                ปฏิเสธ
                              </Button>
                            </div>
                            <Input
                              value={requestReasons[req.id] || ""}
                              onChange={(event) => setRequestReasons((current) => ({ ...current, [req.id]: event.target.value }))}
                              placeholder="เหตุผลกรณีปฏิเสธ"
                              aria-label={`เหตุผลปฏิเสธคำขอกู้ ${req.id}`}
                              className="h-8 text-xs"
                            />
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="text-muted-foreground text-center py-8">ไม่มีคำขอกู้ที่รอการอนุมัติ</p>
            )}
          </Card>
        )}

        {/* Pending Payments Tab */}
        {selectedTab === "payments" && (
          <Card className="p-6 border border-border rounded-lg">
            <h2 className="text-xl font-bold mb-4">การชำระเงินที่รอตรวจสอบ</h2>
            {paymentsLoading ? (
              <div className="space-y-2">
                {[...Array(3)].map((_, i) => (
                  <div key={i} className="h-16 bg-muted rounded animate-pulse" />
                ))}
              </div>
            ) : pendingPayments && pendingPayments.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="border-b border-border">
                    <tr>
                      <th className="text-left py-2 px-2">ชื่อผู้กู้</th>
                      <th className="text-right py-2 px-2">จำนวนเงิน</th>
                      <th className="text-left py-2 px-2">วิธีการชำระ</th>
                      <th className="text-center py-2 px-2">วันที่ชำระ</th>
                      <th className="text-center py-2 px-2">สลิป</th>
                      <th className="text-center py-2 px-2">จัดการ</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pendingPayments.map((payment) => (
                      <tr key={payment.id} className="border-b border-border hover:bg-muted/50">
                        <td className="py-2 px-2">{payment.borrowerName}</td>
                        <td className="text-right py-2 px-2">
                          ฿{parseFloat(payment.amountPaid).toLocaleString("th-TH", {
                            maximumFractionDigits: 2,
                          })}
                        </td>
                        <td className="py-2 px-2">{payment.paymentMethod}</td>
                        <td className="text-center py-2 px-2">
                          {new Date(payment.paymentDate).toLocaleDateString("th-TH")}
                        </td>
                        <td className="text-center py-2 px-2">
                          {payment.slipPath ? (
                            <a
                              href={payment.slipPath}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-accent hover:underline"
                            >
                              ดู
                            </a>
                          ) : (
                            <span className="text-muted-foreground">-</span>
                          )}
                        </td>
                        <td className="min-w-[280px] py-2 px-2">
                          <div className="flex flex-col gap-2">
                            <div className="flex gap-2">
                              <Button
                                size="sm"
                                onClick={() => setConfirmation({ type: "verify", id: payment.id })}
                                disabled={verifyPaymentMutation.isPending || rejectPaymentMutation.isPending}
                                className="bg-emerald-600 hover:bg-emerald-700"
                              >
                                ยืนยัน
                              </Button>
                              <Button
                                size="sm"
                                variant="destructive"
                                onClick={() => setConfirmation({ type: "rejectPayment", id: payment.id, reason: paymentReasons[payment.id]?.trim() || "หลักฐานไม่ถูกต้อง" })}
                                disabled={rejectPaymentMutation.isPending || !hasDecisionReason(paymentReasons[payment.id])}
                              >
                                ปฏิเสธ
                              </Button>
                            </div>
                            <Input
                              value={paymentReasons[payment.id] || ""}
                              onChange={(event) => setPaymentReasons((current) => ({ ...current, [payment.id]: event.target.value }))}
                              placeholder="เหตุผลกรณีปฏิเสธ"
                              aria-label={`เหตุผลปฏิเสธการชำระเงิน ${payment.id}`}
                              className="h-8 text-xs"
                            />
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="text-muted-foreground text-center py-8">ไม่มีการชำระเงินที่รอตรวจสอบ</p>
            )}
          </Card>
        )}
      </div>
      <Dialog open={Boolean(drilldown)} onOpenChange={(open) => { if (!open) { setDrilldown(null); setDrilldownSearch(""); } }}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>รายละเอียด: {drilldown?.name ?? ""}</DialogTitle>
            <DialogDescription>พบ {drilldown?.value ?? 0} รายการจากข้อมูลภาพรวม คลิกปิดเพื่อกลับไปดูกราฟ</DialogDescription>
          </DialogHeader>
          <div className="flex justify-end">
            <div className="flex gap-2"><Button type="button" size="sm" variant="outline" onClick={exportDrilldownCSV} disabled={!drilldown || loanTypeDetailsLoading || paymentStatusDetailsLoading} className="gap-2"><Download className="h-4 w-4" />CSV</Button><Button type="button" size="sm" variant="outline" onClick={() => void exportDrilldownPDF()} disabled={!drilldown || loanTypeDetailsLoading || paymentStatusDetailsLoading} className="gap-2"><Download className="h-4 w-4" />PDF</Button></div>
          </div>
          <Input value={drilldownSearch} onChange={(event) => setDrilldownSearch(event.target.value)} placeholder="ค้นหาสัญญา วันที่ จำนวนเงิน หรือสถานะ..." aria-label="ค้นหารายละเอียดเชิงลึก" />
          {drilldown?.kind === "loanType" ? (
            loanTypeDetailsLoading ? <DashboardChartLoading label="กำลังโหลดรายละเอียดสินเชื่อ..." bars={3} /> : (
              <div className="max-h-[55vh] overflow-auto rounded-md border">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-background text-left"><tr><th className="p-3">สัญญา</th><th className="p-3">เงินต้น</th><th className="p-3">ชำระแล้ว</th><th className="p-3">สถานะ</th></tr></thead>
                  <tbody>{filteredLoanTypeDetails.map((loan) => (
                    <tr key={loan.id} className="border-t"><td className="p-3"><Link href={`/loan/${loan.id}`} className="inline-flex items-center gap-1 font-medium text-emerald-700 hover:underline">#{loan.id}<ExternalLink className="h-3.5 w-3.5" /></Link></td><td className="p-3">฿{Number(loan.principalAmount).toLocaleString("th-TH")}</td><td className="p-3">฿{Number(loan.totalPaid || 0).toLocaleString("th-TH")}</td><td className="p-3">{loan.isClosed ? "ปิดแล้ว" : "กำลังดำเนิน"}</td></tr>
                  ))}</tbody>
                </table>
              </div>
            )
          ) : paymentStatusDetailsLoading ? <DashboardChartLoading label="กำลังโหลดรายละเอียดการชำระ..." bars={3} /> : (
            <div className="max-h-[55vh] overflow-auto rounded-md border">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-background text-left"><tr><th className="p-3">สัญญา</th><th className="p-3">วันที่</th><th className="p-3">จำนวนเงิน</th><th className="p-3">ช่องทาง</th></tr></thead>
                <tbody>{filteredPaymentStatusDetails.map((payment) => (
                  <tr key={payment.id} className="border-t"><td className="p-3"><Link href={`/loan/${payment.loanId}`} className="inline-flex items-center gap-1 font-medium text-emerald-700 hover:underline">#{payment.loanId}<ExternalLink className="h-3.5 w-3.5" /></Link></td><td className="p-3">{new Date(payment.paymentDate).toLocaleDateString("th-TH")}</td><td className="p-3">฿{Number(payment.amountPaid).toLocaleString("th-TH")}</td><td className="p-3">{payment.paymentMethod}</td></tr>
                ))}</tbody>
              </table>
            </div>
          )}
        </DialogContent>
      </Dialog>
      <AlertDialog open={Boolean(confirmation)} onOpenChange={(open) => { if (!open) setConfirmation(null); }}><AlertDialogContent className="glass-panel"><AlertDialogHeader><AlertDialogTitle>ยืนยันการดำเนินการ</AlertDialogTitle><AlertDialogDescription>{confirmation?.type === "approve" ? "ยืนยันการอนุมัติคำขอกู้นี้" : confirmation?.type === "reject" ? "ยืนยันการปฏิเสธคำขอกู้นี้" : confirmation?.type === "rejectPayment" ? "ยืนยันการปฏิเสธหลักฐานการชำระเงินนี้" : "ยืนยันการชำระเงินรายการนี้"}</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>ยกเลิก</AlertDialogCancel><AlertDialogAction onClick={executeConfirmation}>ยืนยัน</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
    </DashboardLayout>
  );
}
