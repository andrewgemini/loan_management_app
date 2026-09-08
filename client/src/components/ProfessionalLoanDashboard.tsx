import React, { useEffect, useMemo, useRef, useState } from "react";
import { Bar, Doughnut } from "react-chartjs-2";
import { ArcElement, BarElement, CategoryScale, Chart as ChartJS, Legend, LinearScale, Tooltip, type ChartData } from "chart.js";
import { AlertTriangle, ArrowDownRight, ArrowUpRight, Banknote, Bookmark, BriefcaseBusiness, CalendarDays, CheckCircle2, CircleDollarSign, Clock3, FileDown, FileCheck2, Flag, Folder, ImageDown, Landmark, Loader2, Minus, Star, TrendingUp, Users } from "lucide-react";
import { DndContext, KeyboardSensor, PointerSensor, closestCenter, useDraggable, useDroppable, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { downloadChartPdf, downloadChartPng } from "../lib/chartExport";
import { downloadHistoryCSV } from "../lib/historyExport";
import { createPresetCategoryMoveHistoryCsvOptions } from "../lib/presetCategoryMoveHistoryExport";
import { toast } from "sonner";

ChartJS.register(ArcElement, BarElement, CategoryScale, LinearScale, Tooltip, Legend);

type Slice = { name: string; value: number };
type PaymentTrend = { labels: string[]; data: number[] } | null;
type Outstanding = { label: string; value: number }[] | null;
type StatusChart = { labels: string[]; data: number[] } | null;
type Activity = { id: string | number; title: string; detail: string; actorName: string; occurredAt: Date; status: string; loanId?: number | null };
type KpiMetric = "users" | "activeLoans" | "principal" | "paid" | "outstanding" | "pendingPayments";
type KpiDetail = { title: string; description: string; items: Array<{ id: string; title: string; meta: string; amount: number | null; href: string | null }> };
type KpiComparison = Partial<Record<KpiMetric, { current: number; previous: number; label: string } | null>>;
type ComparisonMode = "matching_period" | "previous_month" | "previous_quarter";
type DashboardPresetCategoryColor = "blue" | "violet" | "teal" | "amber" | "rose";
type DashboardPresetCategoryIcon = "folder" | "briefcase" | "flag" | "star" | "bookmark";
type DashboardRangePreset = { id: number; name: string; startDate: string; endDate: string; isShared: boolean; isOwner: boolean; isPinned: boolean; usageCount?: number; creatorName: string; categoryId?: number | null; categoryName?: string | null; categoryColor?: string | null; categoryIcon?: string | null; updatedAt: Date | string };
type RecentDashboardRangePreset = Omit<DashboardRangePreset, "isPinned"> & { lastUsedAt: Date | string };
type DashboardPresetCategoryMoveHistory = { id: number; presetCount: number; destinationCategoryId: number | null; undoneAt: Date | string | null; createdAt: Date | string };
type Stats = {
  users: { total: number; borrowers: number; lenders: number };
  loans: { total: number; active: number; closed: number; totalPrincipal: number; totalPaid: number; totalOutstanding: number; avgInterestRate: number };
  requests: { pending: number; approved: number; rejected: number; total: number };
  payments: { pending: number; verified: number; rejected?: number; total: number };
};

const presetCategoryAppearance: Record<DashboardPresetCategoryColor, { label: string; swatchClass: string }> = {
  blue: { label: "น้ำเงิน", swatchClass: "bg-blue-500" },
  violet: { label: "ม่วง", swatchClass: "bg-violet-500" },
  teal: { label: "เขียวอมฟ้า", swatchClass: "bg-teal-500" },
  amber: { label: "อำพัน", swatchClass: "bg-amber-500" },
  rose: { label: "ชมพู", swatchClass: "bg-rose-500" },
};

const presetCategoryIconLabel: Record<DashboardPresetCategoryIcon, string> = { folder: "โฟลเดอร์", briefcase: "กระเป๋า", flag: "ธง", star: "ดาว", bookmark: "ที่คั่น" };

function PresetCategoryIcon({ icon, className = "h-3.5 w-3.5" }: { icon: DashboardPresetCategoryIcon; className?: string }) {
  const Icon = icon === "briefcase" ? BriefcaseBusiness : icon === "flag" ? Flag : icon === "star" ? Star : icon === "bookmark" ? Bookmark : Folder;
  return <Icon className={className} aria-hidden="true" />;
}

function amount(value: number) {
  return `฿${Number(value || 0).toLocaleString("th-TH", { maximumFractionDigits: 0 })}`;
}

function ChartSkeleton({ className = "h-64", label }: { className?: string; label?: string }) {
  return <div className={`${className} flex flex-col items-center justify-center gap-3 animate-pulse rounded-xl bg-muted/80 text-sm text-muted-foreground`} role="status" aria-live="polite" aria-busy="true">{label && <><Loader2 className="h-4 w-4 animate-spin text-primary" /><span>{label}</span></>}</div>;
}

function EmptyChart({ message }: { message: string }) {
  return <div className="flex h-64 items-center justify-center rounded-xl border border-dashed border-border/80 px-6 text-center text-sm text-muted-foreground">{message}</div>;
}

function SortablePinnedPreset({ preset, onApply, disabled }: { preset: DashboardRangePreset; onApply: () => void; disabled: boolean }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: preset.id });
  return <div ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), transition }} className={`flex min-w-0 items-center gap-2 rounded-lg border border-primary/20 bg-background/80 p-2 shadow-sm ${isDragging ? "opacity-60 ring-2 ring-primary/40" : ""}`}><button type="button" aria-label={`ลากเพื่อจัดลำดับ ${preset.name}`} disabled={disabled} className="touch-none cursor-grab rounded-md border border-border bg-muted/70 px-2 py-1 text-[11px] font-semibold text-muted-foreground active:cursor-grabbing disabled:cursor-not-allowed" {...attributes} {...listeners}>ลาก</button><Button type="button" size="sm" variant="ghost" disabled={disabled} className="h-auto min-w-0 flex-1 justify-start px-1 py-1 text-left" onClick={onApply}><span className="block truncate text-xs font-semibold">{preset.name}</span>{preset.categoryName && <span className="block truncate text-[10px] font-normal text-primary/80">{preset.categoryName}</span>}</Button><span className="shrink-0 text-[10px] text-muted-foreground">ใช้ {(preset.usageCount ?? 0).toLocaleString("th-TH")} ครั้ง</span></div>;
}

function PresetFolderDropTarget({ category, disabled }: { category: { id: number; name: string; color: string; icon: string; presetCount: number }; disabled: boolean }) {
  const { isOver, setNodeRef } = useDroppable({ id: `preset-folder-${category.id}`, disabled });
  const appearance = presetCategoryAppearance[category.color as DashboardPresetCategoryColor] ?? presetCategoryAppearance.blue;
  const icon = (Object.hasOwn(presetCategoryIconLabel, category.icon) ? category.icon : "folder") as DashboardPresetCategoryIcon;
  return <div ref={setNodeRef} className={`flex min-w-36 items-center gap-1.5 rounded-md border px-2 py-1.5 text-[10px] transition-colors ${isOver ? "border-primary bg-primary/15 text-primary ring-1 ring-primary/30" : "border-primary/15 bg-primary/5 text-primary"}`}><span className={`h-2 w-2 shrink-0 rounded-full ${appearance.swatchClass}`} /><PresetCategoryIcon icon={icon} className="h-3 w-3 shrink-0" /><span className="max-w-24 truncate">{category.name}</span><span className="ml-auto shrink-0 rounded-full bg-background/75 px-1.5 py-0.5 text-[9px] font-semibold text-muted-foreground">{category.presetCount.toLocaleString("th-TH")}</span></div>;
}

function BulkPresetDragHandle({ count, disabled }: { count: number; disabled: boolean }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: "preset-bulk-move", disabled });
  return <button ref={setNodeRef} type="button" aria-label={`ลาก Preset ที่เลือก ${count} รายการไปยังโฟลเดอร์`} disabled={disabled} style={{ transform: CSS.Translate.toString(transform) }} className={`h-8 rounded-md border border-dashed border-primary/40 bg-primary/5 px-2 text-[11px] font-medium text-primary transition-opacity disabled:cursor-not-allowed disabled:opacity-50 ${isDragging ? "opacity-50" : "cursor-grab active:cursor-grabbing"}`} {...attributes} {...listeners}>ลาก Preset ที่เลือก ({count})</button>;
}

export function ProfessionalLoanDashboard({
  stats,
  paymentTrend,
  outstanding,
  loanStatus,
  loanTypes,
  paymentStatuses,
  activities,
  loading,
  chartLoading,
  timeRange,
  customRange,
  onTimeRangeChange,
  onCustomRangeApply,
  comparisonMode,
  onComparisonModeChange,
  onSaveCustomRange,
  rangePresets,
  recentRangePresets,
  onPresetApply,
  onPresetUse,
  onSavePreset,
  onDeletePreset,
  onSharePreset,
  onCopyPresetToPrivate,
  onPresetPinToggle,
  onClearRecentPresets,
  onPinnedPresetReorder,
  onResetPinnedPresetOrder,
  onSortPinnedPresetsByUsage,
  onClearAllPresetPins,
  presetCategories,
  onCreatePresetCategory,
  onUpdatePresetCategoryAppearance,
  onRenamePresetCategory,
  onDeletePresetCategory,
  onPresetCategoryChange,
  onPresetCategoriesBulkChange,
  presetCategoryMoveHistory,
  onUndoPresetCategoryMove,
  onRedoPresetCategoryMove,
  isUndoingPresetCategoryMove,
  isRedoingPresetCategoryMove,
  presetSearch,
  onPresetSearchChange,
  presetCreatorSearch,
  onPresetCreatorSearchChange,
  presetSort,
  onPresetSortChange,
  presetScope,
  onPresetScopeChange,
  onResetDashboardDefaults,
  isPresetActionPending,
  isClearingRecentPresets,
  isReorderingPresetPins,
  isClearingPresetPins,
  isResettingDefaults,
  isRefreshingPeriod,
  isSavingDefault,
  kpiComparison,
  kpiDetail,
  kpiDetailLoading,
  onKpiSelect,
  onKpiDetailClose,
  onLoanTypeSelect,
  onPaymentStatusSelect,
}: {
  stats?: Stats;
  paymentTrend: PaymentTrend;
  outstanding: Outstanding;
  loanStatus: StatusChart;
  loanTypes: Slice[];
  paymentStatuses: Slice[];
  activities: Activity[];
  loading: boolean;
  chartLoading: { trend: boolean; outstanding: boolean; loanStatus: boolean; loanTypes: boolean; paymentStatuses: boolean; activity: boolean };
  timeRange: 7 | 30 | 90 | null;
  customRange: { startDate: string; endDate: string } | null;
  onTimeRangeChange: (days: 7 | 30 | 90) => void;
  onCustomRangeApply: (range: { startDate: string; endDate: string }) => void;
  comparisonMode: ComparisonMode;
  onComparisonModeChange: (mode: ComparisonMode) => void;
  onSaveCustomRange: (range: { startDate: string; endDate: string }) => void;
  rangePresets: DashboardRangePreset[];
  recentRangePresets: RecentDashboardRangePreset[];
  onPresetApply: (range: { startDate: string; endDate: string }) => void;
  onPresetUse: (id: number) => void;
  onSavePreset: (input: { name: string; startDate: string; endDate: string }) => void;
  onDeletePreset: (id: number) => void;
  onSharePreset: (input: { id: number; isShared: boolean }) => void;
  onCopyPresetToPrivate: (id: number) => void;
  onPresetPinToggle: (input: { id: number; isPinned: boolean }) => void;
  onClearRecentPresets: () => void;
  onPinnedPresetReorder: (presetIds: number[], action?: "reorder" | "undo" | "redo") => void;
  onResetPinnedPresetOrder: () => void;
  onSortPinnedPresetsByUsage: () => void;
  onClearAllPresetPins: () => void;
  presetCategories: Array<{ id: number; name: string; color: string; icon: string; presetCount: number }>;
  onCreatePresetCategory: (input: { name: string; color: DashboardPresetCategoryColor; icon: DashboardPresetCategoryIcon }) => void;
  onUpdatePresetCategoryAppearance: (input: { id: number; color: DashboardPresetCategoryColor; icon: DashboardPresetCategoryIcon }) => void;
  onRenamePresetCategory: (input: { id: number; name: string }) => void;
  onDeletePresetCategory: (id: number) => void;
  onPresetCategoryChange: (input: { presetId: number; categoryId: number | null }) => void;
  onPresetCategoriesBulkChange: (input: { presetIds: number[]; categoryId: number | null }) => void;
  presetCategoryMoveHistory: DashboardPresetCategoryMoveHistory[];
  onUndoPresetCategoryMove: (id: number) => void;
  onRedoPresetCategoryMove: (id: number) => void;
  isUndoingPresetCategoryMove: boolean;
  isRedoingPresetCategoryMove: boolean;
  presetSearch: string;
  onPresetSearchChange: (value: string) => void;
  presetCreatorSearch: string;
  onPresetCreatorSearchChange: (value: string) => void;
  presetSort: "updated_desc" | "name_asc" | "name_desc";
  onPresetSortChange: (value: "updated_desc" | "name_asc" | "name_desc") => void;
  presetScope: "all" | "private" | "team";
  onPresetScopeChange: (value: "all" | "private" | "team") => void;
  onResetDashboardDefaults: () => void;
  isPresetActionPending: boolean;
  isClearingRecentPresets: boolean;
  isReorderingPresetPins: boolean;
  isClearingPresetPins: boolean;
  isResettingDefaults: boolean;
  isRefreshingPeriod: boolean;
  isSavingDefault: boolean;
  kpiComparison: KpiComparison | null;
  kpiDetail: KpiDetail | null;
  kpiDetailLoading: boolean;
  onKpiSelect: (metric: KpiMetric) => void;
  onKpiDetailClose: () => void;
  onLoanTypeSelect: (slice: Slice) => void;
  onPaymentStatusSelect: (slice: Slice) => void;
}) {
  const repaymentRate = stats?.loans.totalPrincipal ? Math.min(100, (stats.loans.totalPaid / stats.loans.totalPrincipal) * 100) : 0;
  const reviewCount = (stats?.requests.pending ?? 0) + (stats?.payments.pending ?? 0);
  const trendData = useMemo(() => ({ labels: paymentTrend?.labels ?? [], datasets: [{ label: "ยอดชำระ", data: paymentTrend?.data ?? [], backgroundColor: "rgba(37, 99, 235, 0.78)", hoverBackgroundColor: "rgba(30, 64, 175, 0.92)", borderRadius: 7, maxBarThickness: 42 }] }), [paymentTrend]);
  const loanStatusData = useMemo(() => ({ labels: loanStatus?.labels ?? [], datasets: [{ data: loanStatus?.data ?? [], backgroundColor: ["#2563eb", "#10b981", "#f59e0b", "#94a3b8"], borderColor: "rgba(255,255,255,.86)", borderWidth: 3, hoverOffset: 8 }] }), [loanStatus]);
  const loanTypeData = useMemo(() => ({ labels: loanTypes.map((item) => item.name), datasets: [{ data: loanTypes.map((item) => item.value), backgroundColor: ["#2563eb", "#0ea5e9", "#14b8a6", "#6366f1"], borderWidth: 0, hoverOffset: 6 }] }), [loanTypes]);
  const paymentStatusData = useMemo(() => ({ labels: paymentStatuses.map((item) => item.name), datasets: [{ data: paymentStatuses.map((item) => item.value), backgroundColor: ["#f59e0b", "#10b981", "#f43f5e", "#64748b"], borderWidth: 0, hoverOffset: 6 }] }), [paymentStatuses]);
  const maxOutstanding = Math.max(...(outstanding?.map((item) => item.value) ?? [0]), 1);
  const paymentTrendRef = useRef<ChartJS<"bar"> | null>(null);
  const loanStatusRef = useRef<ChartJS<"doughnut"> | null>(null);
  const [exporting, setExporting] = useState<"payment" | "status" | null>(null);
  const [exportingKpiCsv, setExportingKpiCsv] = useState(false);
  const [customStartDate, setCustomStartDate] = useState(customRange?.startDate ?? "");
  const [customEndDate, setCustomEndDate] = useState(customRange?.endDate ?? "");
  const [presetName, setPresetName] = useState("");
  const [copyConfirmation, setCopyConfirmation] = useState<DashboardRangePreset | null>(null);
  const [clearPinsConfirmation, setClearPinsConfirmation] = useState(false);
  const [undoPinnedOrderHistory, setUndoPinnedOrderHistory] = useState<number[][]>([]);
  const [redoPinnedOrderHistory, setRedoPinnedOrderHistory] = useState<number[][]>([]);
  const [pinnedPresetSearch, setPinnedPresetSearch] = useState("");
  const [pinnedCreatorSearch, setPinnedCreatorSearch] = useState("");
  const [pinnedCategoryId, setPinnedCategoryId] = useState<string>("all");
  const [newPresetCategoryName, setNewPresetCategoryName] = useState("");
  const [newPresetCategoryColor, setNewPresetCategoryColor] = useState<DashboardPresetCategoryColor>("blue");
  const [newPresetCategoryIcon, setNewPresetCategoryIcon] = useState<DashboardPresetCategoryIcon>("folder");
  const [selectedPinnedPresetIds, setSelectedPinnedPresetIds] = useState<number[]>([]);
  const [bulkMoveCategoryId, setBulkMoveCategoryId] = useState<string>("uncategorized");
  const [renamingPresetCategoryId, setRenamingPresetCategoryId] = useState<number | null>(null);
  const [renamingPresetCategoryName, setRenamingPresetCategoryName] = useState("");
  const [folderCountSort, setFolderCountSort] = useState<"name" | "count_desc" | "count_asc">("name");
  const [folderSearch, setFolderSearch] = useState("");
  const [folderVisibility, setFolderVisibility] = useState<"all" | "empty" | "nonempty">("all");
  const [folderColorFilter, setFolderColorFilter] = useState<"all" | DashboardPresetCategoryColor>("all");
  const [folderIconFilter, setFolderIconFilter] = useState<"all" | DashboardPresetCategoryIcon>("all");
  const [pendingBulkFolderMove, setPendingBulkFolderMove] = useState<{ presetIds: number[]; categoryId: number | null } | null>(null);
  const periodLabel = customRange ? `${customRange.startDate} ถึง ${customRange.endDate}` : `${timeRange ?? 30} วันล่าสุด`;
  const pinnedPresets = useMemo(() => rangePresets.filter((preset) => preset.isPinned), [rangePresets]);
  const sortedPresetCategories = useMemo(() => [...presetCategories].sort((left, right) => {
    if (folderCountSort === "count_desc") return right.presetCount - left.presetCount || left.name.localeCompare(right.name, "th");
    if (folderCountSort === "count_asc") return left.presetCount - right.presetCount || left.name.localeCompare(right.name, "th");
    return left.name.localeCompare(right.name, "th");
  }), [folderCountSort, presetCategories]);
  const visiblePresetCategories = useMemo(() => {
    const search = folderSearch.trim().toLocaleLowerCase("th-TH");
    return sortedPresetCategories.filter((category) => (!search || category.name.toLocaleLowerCase("th-TH").includes(search)) && (folderVisibility === "all" || (folderVisibility === "empty" ? category.presetCount === 0 : category.presetCount > 0)) && (folderColorFilter === "all" || category.color === folderColorFilter) && (folderIconFilter === "all" || category.icon === folderIconFilter));
  }, [folderColorFilter, folderIconFilter, folderSearch, folderVisibility, sortedPresetCategories]);
  useEffect(() => {
    const pinnedIds = new Set(pinnedPresets.map((preset) => preset.id));
    setSelectedPinnedPresetIds((current) => current.filter((id) => pinnedIds.has(id)));
  }, [pinnedPresets]);
  const visiblePinnedPresets = useMemo(() => {
    const search = pinnedPresetSearch.trim().toLocaleLowerCase("th-TH");
    const creatorSearch = pinnedCreatorSearch.trim().toLocaleLowerCase("th-TH");
    return pinnedPresets.filter((preset) => (!search || preset.name.toLocaleLowerCase("th-TH").includes(search)) && (!creatorSearch || preset.creatorName.toLocaleLowerCase("th-TH").includes(creatorSearch)) && (pinnedCategoryId === "all" || (pinnedCategoryId === "uncategorized" ? !preset.categoryId : preset.categoryId === Number(pinnedCategoryId))));
  }, [pinnedCategoryId, pinnedCreatorSearch, pinnedPresetSearch, pinnedPresets]);
  const isPinnedFilterActive = Boolean(pinnedPresetSearch.trim() || pinnedCreatorSearch.trim() || pinnedCategoryId !== "all" || presetSearch.trim() || presetCreatorSearch.trim() || presetScope !== "all");
  const togglePinnedPresetSelection = (presetId: number) => setSelectedPinnedPresetIds((current) => current.includes(presetId) ? current.filter((id) => id !== presetId) : [...current, presetId]);
  const toggleVisiblePinnedPresetSelection = () => setSelectedPinnedPresetIds((current) => visiblePinnedPresets.every((preset) => current.includes(preset.id)) ? current.filter((id) => !visiblePinnedPresets.some((preset) => preset.id === id)) : Array.from(new Set([...current, ...visiblePinnedPresets.map((preset) => preset.id)])));
  const dndSensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }));
  const requestBulkFolderMove = (input: { presetIds: number[]; categoryId: number | null }) => {
    if (isPresetActionPending || input.presetIds.length === 0) return;
    const currentPinnedIds = new Set(pinnedPresets.map((preset) => preset.id));
    if (input.presetIds.some((presetId) => !currentPinnedIds.has(presetId))) return toast.error("รายการ Preset ที่เลือกเปลี่ยนแปลง กรุณาเลือกใหม่");
    const crossesFolders = input.presetIds.some((presetId) => (pinnedPresets.find((preset) => preset.id === presetId)?.categoryId ?? null) !== input.categoryId);
    if (input.presetIds.length > 1 && crossesFolders) return setPendingBulkFolderMove(input);
    onPresetCategoriesBulkChange(input);
  };
  const confirmBulkFolderMove = () => {
    if (!pendingBulkFolderMove || isPresetActionPending) return;
    const currentPinnedIds = new Set(pinnedPresets.map((preset) => preset.id));
    if (pendingBulkFolderMove.presetIds.some((presetId) => !currentPinnedIds.has(presetId))) {
      setPendingBulkFolderMove(null);
      return toast.error("รายการ Preset ที่เลือกเปลี่ยนแปลง กรุณาเลือกใหม่");
    }
    if (pendingBulkFolderMove.categoryId !== null && !presetCategories.some((category) => category.id === pendingBulkFolderMove.categoryId)) {
      setPendingBulkFolderMove(null);
      return toast.error("ไม่พบโฟลเดอร์ปลายทาง กรุณาเลือกใหม่");
    }
    onPresetCategoriesBulkChange(pendingBulkFolderMove);
    setPendingBulkFolderMove(null);
  };
  const moveSelectedPresetsToDroppedFolder = ({ active, over }: DragEndEvent) => {
    if (active.id !== "preset-bulk-move" || !over || isPresetActionPending || selectedPinnedPresetIds.length === 0) return;
    const categoryId = Number(String(over.id).replace("preset-folder-", ""));
    if (!Number.isInteger(categoryId) || !presetCategories.some((category) => category.id === categoryId)) return;
    requestBulkFolderMove({ presetIds: selectedPinnedPresetIds, categoryId });
  };
  const exportPresetCategoryMoveHistory = () => {
    if (presetCategoryMoveHistory.length === 0) return;
    try {
      downloadHistoryCSV(createPresetCategoryMoveHistoryCsvOptions(presetCategoryMoveHistory, presetCategories));
      toast.success("ส่งออกประวัติการย้าย Preset เป็น CSV แล้ว");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "ส่งออกประวัติการย้าย Preset ไม่สำเร็จ");
    }
  };
  const presetUpdatedLabel = (updatedAt: Date | string) => {
    const date = new Date(updatedAt);
    return Number.isNaN(date.getTime()) ? "ไม่ระบุเวลา" : date.toLocaleString("th-TH", { dateStyle: "medium", timeStyle: "short" });
  };
  const applyPreset = (preset: Pick<DashboardRangePreset, "id" | "startDate" | "endDate">) => {
    setCustomStartDate(preset.startDate);
    setCustomEndDate(preset.endDate);
    onPresetApply({ startDate: preset.startDate, endDate: preset.endDate });
    onPresetUse(preset.id);
  };
  const reorderPinnedPresets = ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id || isReorderingPresetPins || isPinnedFilterActive) return;
    const oldIndex = pinnedPresets.findIndex((preset) => preset.id === active.id);
    const newIndex = pinnedPresets.findIndex((preset) => preset.id === over.id);
    if (oldIndex < 0 || newIndex < 0) return;
    setUndoPinnedOrderHistory((history) => [...history, pinnedPresets.map((preset) => preset.id)].slice(-5));
    setRedoPinnedOrderHistory([]);
    onPinnedPresetReorder(arrayMove(pinnedPresets, oldIndex, newIndex).map((preset) => preset.id), "reorder");
  };
  const restorePinnedOrder = () => {
    const undoPinnedOrder = undoPinnedOrderHistory.at(-1);
    if (!undoPinnedOrder || isPinnedFilterActive || isReorderingPresetPins || undoPinnedOrder.length !== pinnedPresets.length) return;
    const currentIds = new Set(pinnedPresets.map((preset) => preset.id));
    if (undoPinnedOrder.some((id) => !currentIds.has(id))) {
      setUndoPinnedOrderHistory([]);
      setRedoPinnedOrderHistory([]);
      return toast.error("ไม่สามารถคืนลำดับเดิมได้ เนื่องจากรายการหมุดเปลี่ยนแปลง");
    }
    onPinnedPresetReorder(undoPinnedOrder, "undo");
    setUndoPinnedOrderHistory((history) => history.slice(0, -1));
    setRedoPinnedOrderHistory((history) => [...history, pinnedPresets.map((preset) => preset.id)].slice(-5));
  };
  const redoPinnedOrder = () => {
    const redoPinnedOrder = redoPinnedOrderHistory.at(-1);
    if (!redoPinnedOrder || isPinnedFilterActive || isReorderingPresetPins || redoPinnedOrder.length !== pinnedPresets.length) return;
    const currentIds = new Set(pinnedPresets.map((preset) => preset.id));
    if (redoPinnedOrder.some((id) => !currentIds.has(id))) {
      setUndoPinnedOrderHistory([]);
      setRedoPinnedOrderHistory([]);
      return toast.error("ไม่สามารถทำซ้ำลำดับได้ เนื่องจากรายการหมุดเปลี่ยนแปลง");
    }
    onPinnedPresetReorder(redoPinnedOrder, "redo");
    setRedoPinnedOrderHistory((history) => history.slice(0, -1));
    setUndoPinnedOrderHistory((history) => [...history, pinnedPresets.map((preset) => preset.id)].slice(-5));
  };
  const resetPinnedOrder = () => {
    if (isPinnedFilterActive || isReorderingPresetPins) return;
    setUndoPinnedOrderHistory((history) => [...history, pinnedPresets.map((preset) => preset.id)].slice(-5));
    setRedoPinnedOrderHistory([]);
    onResetPinnedPresetOrder();
  };
  const sortPinnedPresetsByUsage = () => {
    if (isPinnedFilterActive || isReorderingPresetPins) return;
    setUndoPinnedOrderHistory((history) => [...history, pinnedPresets.map((preset) => preset.id)].slice(-5));
    setRedoPinnedOrderHistory([]);
    onSortPinnedPresetsByUsage();
  };

  useEffect(() => {
    if (!customRange) return;
    setCustomStartDate(customRange.startDate);
    setCustomEndDate(customRange.endDate);
  }, [customRange?.startDate, customRange?.endDate]);

  const applyCustomRange = () => {
    if (!customStartDate || !customEndDate || customStartDate > customEndDate) return toast.error("กรุณาระบุช่วงวันที่ให้ถูกต้อง");
    const days = (Date.parse(`${customEndDate}T00:00:00.000Z`) - Date.parse(`${customStartDate}T00:00:00.000Z`)) / 86400000;
    if (days > 365) return toast.error("Custom Date Range ต้องไม่เกิน 366 วัน");
    onCustomRangeApply({ startDate: customStartDate, endDate: customEndDate });
  };

  const exportKpiDetailCsv = () => {
    if (!kpiDetail?.items.length || exportingKpiCsv) return;
    setExportingKpiCsv(true);
    setTimeout(() => {
      try {
        downloadHistoryCSV({ title: kpiDetail.title, subtitle: `จำนวน ${kpiDetail.items.length} รายการ · ส่งออก ${new Date().toLocaleString("th-TH")}`, filenamePrefix: "dashboard_kpi_detail", columns: [{ header: "รายการ", value: (item) => item.title }, { header: "รายละเอียด", value: (item) => item.meta }, { header: "จำนวนเงิน", value: (item) => item.amount ?? "-" }, { header: "ลิงก์สัญญา", value: (item) => item.href ?? "-" }], rows: kpiDetail.items });
        toast.success("ส่งออก CSV รายละเอียด KPI เรียบร้อยแล้ว");
      } catch {
        toast.error("ส่งออก CSV รายละเอียด KPI ไม่สำเร็จ");
      } finally {
        setExportingKpiCsv(false);
      }
    }, 0);
  };

  const exportChart = async (kind: "payment" | "status", format: "png" | "pdf") => {
    const chart = kind === "payment" ? paymentTrendRef.current : loanStatusRef.current;
    if (!chart) return toast.error("ยังไม่มีข้อมูลกราฟให้ส่งออก");
    const title = kind === "payment" ? "แนวโน้มการชำระเงิน" : "สถานะสัญญา";
    const prefix = kind === "payment" ? `payment_trend_${customRange ? "custom" : `${timeRange ?? 30}d`}` : "loan_status";
    try {
      setExporting(kind);
      const dataUrl = chart.toBase64Image("image/png", 1);
      if (format === "png") downloadChartPng(dataUrl, prefix);
      else await downloadChartPdf(dataUrl, title, `ช่วง ${periodLabel} · ส่งออก ${new Date().toLocaleString("th-TH")}`, prefix);
      toast.success(`ส่งออก${format.toUpperCase()} เรียบร้อยแล้ว`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "ไม่สามารถส่งออกกราฟได้");
    } finally {
      setExporting(null);
    }
  };

  if (loading) return <div className="space-y-5" role="status" aria-live="polite" aria-busy="true"><div className="h-32 animate-pulse rounded-2xl bg-muted" /><div className="grid gap-4 md:grid-cols-3 xl:grid-cols-6">{Array.from({ length: 6 }, (_, index) => <div key={index} className="h-28 animate-pulse rounded-2xl bg-muted" />)}</div><div className="grid gap-5 xl:grid-cols-3"><ChartSkeleton className="h-80 xl:col-span-2" /><ChartSkeleton className="h-80" /></div></div>;

  return <section className="space-y-5" aria-label="ภาพรวมพอร์ตสินเชื่อ">
    <header className="relative overflow-hidden rounded-2xl border border-primary/15 bg-gradient-to-br from-primary/15 via-background to-sky-500/10 p-5 sm:p-6"><div className="absolute -right-10 -top-16 h-40 w-40 rounded-full bg-primary/10 blur-2xl" /><div className="relative flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between"><div><p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">Loan Operations Planning</p><h1 className="mt-2 text-2xl font-bold tracking-tight sm:text-3xl">ภาพรวมการดำเนินงานสินเชื่อ</h1><p className="mt-2 max-w-2xl text-sm text-muted-foreground">ติดตามพอร์ตสินเชื่อ การชำระเงิน งานรอตรวจสอบ และกิจกรรมล่าสุดจากข้อมูลระบบ</p></div><div className="inline-flex items-center gap-3 rounded-xl border border-primary/15 bg-background/70 px-4 py-3 text-sm shadow-sm backdrop-blur"><div className="rounded-lg bg-primary/10 p-2 text-primary"><Clock3 className="h-4 w-4" /></div><div><p className="text-xs text-muted-foreground">งานรอตรวจสอบ</p><p className="font-semibold">{reviewCount.toLocaleString("th-TH")} รายการ</p></div></div></div></header>

    <div className="flex flex-col gap-3 rounded-xl border border-border/70 bg-card/50 p-3"><div className="flex flex-wrap items-center justify-between gap-3"><div><div className="flex items-center gap-2"><p className="text-sm font-semibold">ช่วงเวลาวิเคราะห์</p>{isRefreshingPeriod && <span className="inline-flex items-center gap-1 text-xs text-primary" role="status" aria-live="polite"><Loader2 className="h-3.5 w-3.5 animate-spin" />กำลังอัปเดต</span>}</div><p className="text-xs text-muted-foreground">ใช้กับแนวโน้มยอดชำระรายวันและ comparison ของ KPI</p></div><div className="flex rounded-lg bg-muted/70 p-1" role="group" aria-label="เลือกช่วงเวลา dashboard">{([7, 30, 90] as const).map((days) => <Button key={days} type="button" size="sm" variant={timeRange === days ? "default" : "ghost"} disabled={isRefreshingPeriod} className="h-8 px-3" onClick={() => onTimeRangeChange(days)}>{days} วัน</Button>)}</div></div><div className="flex flex-wrap items-end gap-2 border-t border-border/60 pt-3"><label className="grid gap-1 text-xs font-medium text-muted-foreground">เริ่มต้น<input type="date" value={customStartDate} disabled={isRefreshingPeriod} onChange={(event) => setCustomStartDate(event.target.value)} className="h-9 rounded-md border border-input bg-background px-2 text-sm text-foreground disabled:opacity-60" /></label><label className="grid gap-1 text-xs font-medium text-muted-foreground">สิ้นสุด<input type="date" value={customEndDate} disabled={isRefreshingPeriod} onChange={(event) => setCustomEndDate(event.target.value)} className="h-9 rounded-md border border-input bg-background px-2 text-sm text-foreground disabled:opacity-60" /></label><Button type="button" size="sm" variant={customRange ? "default" : "outline"} disabled={isRefreshingPeriod} className="h-9 gap-2" onClick={applyCustomRange}><CalendarDays className="h-4 w-4" />ใช้ช่วงกำหนดเอง</Button><label className="grid gap-1 text-xs font-medium text-muted-foreground">เปรียบเทียบ<select value={comparisonMode} disabled={isRefreshingPeriod} onChange={(event) => onComparisonModeChange(event.target.value as ComparisonMode)} className="h-9 rounded-md border border-input bg-background px-2 text-sm text-foreground disabled:opacity-60"><option value="matching_period">ช่วงก่อนหน้าเท่ากัน</option><option value="previous_month">เดือนก่อน</option><option value="previous_quarter">ไตรมาสก่อน</option></select></label>{customRange && <><Button type="button" size="sm" variant="outline" disabled={isSavingDefault} className="h-9 gap-2" onClick={() => onSaveCustomRange(customRange)}>{isSavingDefault && <Loader2 className="h-4 w-4 animate-spin" />}{isSavingDefault ? "กำลังบันทึก" : "บันทึกเป็นค่าเริ่มต้น"}</Button><span className="text-xs text-primary">กำลังแสดง {periodLabel}</span></>}</div></div>

    <div className="rounded-xl border border-border/70 bg-card/40 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div><p className="text-sm font-semibold">ช่วงเวลาที่บันทึกไว้</p><p className="text-xs text-muted-foreground">ค้นหา จัดเรียง และแชร์เฉพาะ Preset ของคุณให้ทีม Admin ใช้ได้</p></div>
        <Button type="button" size="sm" variant="ghost" disabled={isResettingDefaults} className="gap-2 text-muted-foreground" onClick={() => { onResetDashboardDefaults(); setCustomStartDate(""); setCustomEndDate(""); setPresetName(""); }}>{isResettingDefaults && <Loader2 className="h-4 w-4 animate-spin" />}{isResettingDefaults ? "กำลังรีเซ็ต" : "รีเซ็ตการตั้งค่า"}</Button>
      </div>
      <div className="mt-3 flex flex-wrap items-end gap-2">
        <label className="grid min-w-44 flex-1 gap-1 text-xs font-medium text-muted-foreground">ชื่อ Preset<input value={presetName} maxLength={80} disabled={!customRange || isPresetActionPending} onChange={(event) => setPresetName(event.target.value)} placeholder="เช่น รอบติดตามสิ้นเดือน" className="h-9 rounded-md border border-input bg-background px-2 text-sm text-foreground disabled:opacity-60" /></label>
        <Button type="button" size="sm" variant="outline" disabled={!customRange || !presetName.trim() || isPresetActionPending} className="h-9 gap-2" onClick={() => { if (!customRange) return; onSavePreset({ name: presetName.trim(), ...customRange }); setPresetName(""); }}>{isPresetActionPending && <Loader2 className="h-4 w-4 animate-spin" />}บันทึก Preset</Button>
      </div>
      {pinnedPresets.length > 0 && <div className="mt-3 rounded-lg border border-primary/20 bg-primary/5 p-2.5"><div className="flex flex-wrap items-center justify-between gap-2"><div><p className="text-xs font-semibold text-primary">Preset ที่ปักหมุด</p><p className="text-[11px] text-muted-foreground">ลากเพื่อจัดลำดับส่วนตัวของคุณ · Undo {undoPinnedOrderHistory.length}/5 · Redo {redoPinnedOrderHistory.length}/5 ขั้น</p></div><div className="flex flex-wrap items-center gap-1"><Button type="button" size="sm" variant="ghost" aria-label="ย้อนกลับลำดับ Preset ที่ปักหมุดก่อนหน้า" disabled={isPinnedFilterActive || undoPinnedOrderHistory.length === 0 || isClearingPresetPins || isReorderingPresetPins} className="h-7 px-2 text-[11px] text-primary disabled:text-muted-foreground" onClick={restorePinnedOrder}>{isReorderingPresetPins && <Loader2 className="h-3 w-3 animate-spin" />}ย้อนกลับ</Button><Button type="button" size="sm" variant="ghost" aria-label="ทำซ้ำลำดับ Preset ที่ปักหมุดที่ย้อนกลับไป" disabled={isPinnedFilterActive || redoPinnedOrderHistory.length === 0 || isClearingPresetPins || isReorderingPresetPins} className="h-7 px-2 text-[11px] text-primary disabled:text-muted-foreground" onClick={redoPinnedOrder}>ทำซ้ำ</Button><Button type="button" size="sm" variant="ghost" aria-label="จัดเรียง Preset ที่ปักหมุดตามความถี่การใช้" disabled={isPinnedFilterActive || isClearingPresetPins || isReorderingPresetPins} className="h-7 px-2 text-[11px] text-primary/80 hover:text-primary" onClick={sortPinnedPresetsByUsage}>เรียงตามการใช้</Button><Button type="button" size="sm" variant="ghost" aria-label="รีเซ็ตลำดับ Preset ที่ปักหมุดเป็นค่าเริ่มต้น" disabled={isPinnedFilterActive || isClearingPresetPins || isReorderingPresetPins} className="h-7 px-2 text-[11px] text-primary/80 hover:text-primary" onClick={resetPinnedOrder}>รีเซ็ตลำดับ</Button><Button type="button" size="sm" variant="ghost" disabled={isClearingPresetPins || isReorderingPresetPins} className="h-7 px-2 text-[11px] text-muted-foreground hover:text-destructive" onClick={() => setClearPinsConfirmation(true)}>{isClearingPresetPins && <Loader2 className="h-3 w-3 animate-spin" />}{isClearingPresetPins ? "กำลังยกเลิก" : "ยกเลิกหมุดทั้งหมด"}</Button></div></div><label className="mt-2 grid gap-1 text-[11px] font-medium text-muted-foreground">ค้นหา Preset ที่ปักหมุด<input value={pinnedPresetSearch} maxLength={80} onChange={(event) => setPinnedPresetSearch(event.target.value)} placeholder="ค้นหาจากชื่อ Preset" className="h-8 rounded-md border border-input bg-background px-2 text-xs text-foreground" /></label>{isPinnedFilterActive && <p className="mt-1 text-[10px] text-muted-foreground">ล้างตัวกรองเพื่อจัดลำดับด้วยการลากวาง</p>}<DndContext sensors={dndSensors} collisionDetection={closestCenter} onDragEnd={reorderPinnedPresets}><SortableContext items={visiblePinnedPresets.map((preset) => preset.id)} strategy={verticalListSortingStrategy}><div className="mt-2 grid gap-1.5 sm:grid-cols-2">{visiblePinnedPresets.length > 0 ? visiblePinnedPresets.map((preset) => <SortablePinnedPreset key={preset.id} preset={preset} disabled={isReorderingPresetPins || isClearingPresetPins || isPresetActionPending || isPinnedFilterActive} onApply={() => applyPreset(preset)} />) : <p className="col-span-full rounded-md border border-dashed border-primary/20 bg-background/50 px-3 py-2 text-xs text-muted-foreground">ไม่พบ Preset ที่ปักหมุดตรงกับตัวกรอง</p>}</div></SortableContext></DndContext></div>}
      {recentRangePresets.length > 0 && <div className="mt-3 rounded-lg border border-primary/15 bg-primary/5 p-2.5"><div className="flex flex-wrap items-center justify-between gap-2"><div className="flex items-center gap-2"><Clock3 className="h-3.5 w-3.5 text-primary" /><p className="text-xs font-semibold">Preset ที่ใช้ล่าสุด</p></div><Button type="button" size="sm" variant="ghost" disabled={isClearingRecentPresets} className="h-7 px-2 text-[11px] text-muted-foreground hover:text-destructive" onClick={onClearRecentPresets}>{isClearingRecentPresets && <Loader2 className="h-3 w-3 animate-spin" />}{isClearingRecentPresets ? "กำลังล้าง" : "ล้างประวัติ"}</Button></div><div className="mt-2 flex flex-wrap gap-1.5">{recentRangePresets.map((preset) => <Button key={preset.id} type="button" size="sm" variant="outline" disabled={isRefreshingPeriod || isPresetActionPending} className="h-auto max-w-full gap-1 px-2 py-1 text-left text-[11px]" onClick={() => applyPreset(preset)}><span className="truncate">{preset.name}</span><span className="shrink-0 text-muted-foreground">· {preset.creatorName}</span></Button>)}</div></div>}
      {pinnedPresets.length > 0 && (
        <div className="mt-3 rounded-lg border border-primary/15 bg-background/45 p-2.5">
          <DndContext sensors={dndSensors} collisionDetection={closestCenter} onDragEnd={moveSelectedPresetsToDroppedFolder}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div><p className="text-xs font-semibold">โฟลเดอร์และตัวกรอง Preset หมุด</p><p className="text-[11px] text-muted-foreground">โฟลเดอร์เป็นของบัญชีคุณ แม้ Preset ต้นทางจะเป็นของทีม</p></div>
              <div className="flex flex-wrap gap-1.5">
              {visiblePresetCategories.map((category) => {
                const appearance = presetCategoryAppearance[category.color as DashboardPresetCategoryColor] ?? presetCategoryAppearance.blue;
                const icon = (Object.hasOwn(presetCategoryIconLabel, category.icon) ? category.icon : "folder") as DashboardPresetCategoryIcon;
                return <div key={category.id} className="inline-flex max-w-full items-center gap-1 rounded-full border border-primary/15 bg-primary/5 px-2 py-1 text-[10px] text-primary"><span className={`h-2 w-2 shrink-0 rounded-full ${appearance.swatchClass}`} /><PresetCategoryIcon icon={icon} className="h-3 w-3 shrink-0" />{renamingPresetCategoryId === category.id ? <><input aria-label={`ชื่อใหม่ของโฟลเดอร์ ${category.name}`} value={renamingPresetCategoryName} maxLength={80} disabled={isPresetActionPending} onChange={(event) => setRenamingPresetCategoryName(event.target.value)} className="h-5 w-24 rounded border border-primary/20 bg-background px-1 text-[9px] text-foreground" /><button type="button" disabled={!renamingPresetCategoryName.trim() || isPresetActionPending} className="text-primary/80 hover:text-primary disabled:opacity-60" onClick={() => { onRenamePresetCategory({ id: category.id, name: renamingPresetCategoryName.trim() }); setRenamingPresetCategoryId(null); setRenamingPresetCategoryName(""); }}>บันทึก</button><button type="button" disabled={isPresetActionPending} className="text-muted-foreground hover:text-foreground disabled:opacity-60" onClick={() => { setRenamingPresetCategoryId(null); setRenamingPresetCategoryName(""); }}>ยกเลิก</button></> : <><span className="max-w-28 truncate">{category.name}</span><span className="rounded-full bg-background/70 px-1 py-0.5 text-[9px] text-muted-foreground">{category.presetCount.toLocaleString("th-TH")}</span><button type="button" aria-label={`เปลี่ยนชื่อโฟลเดอร์ ${category.name}`} disabled={isPresetActionPending} className="text-primary/70 hover:text-primary disabled:opacity-60" onClick={() => { setRenamingPresetCategoryId(category.id); setRenamingPresetCategoryName(category.name); }}>เปลี่ยนชื่อ</button></>}<select aria-label={`สีโฟลเดอร์ ${category.name}`} value={category.color} disabled={isPresetActionPending} onChange={(event) => onUpdatePresetCategoryAppearance({ id: category.id, color: event.target.value as DashboardPresetCategoryColor, icon })} className="h-5 max-w-16 rounded border border-primary/15 bg-background px-0.5 text-[9px] text-foreground disabled:opacity-60">{Object.entries(presetCategoryAppearance).map(([value, item]) => <option key={value} value={value}>{item.label}</option>)}</select><select aria-label={`ไอคอนโฟลเดอร์ ${category.name}`} value={icon} disabled={isPresetActionPending} onChange={(event) => onUpdatePresetCategoryAppearance({ id: category.id, color: category.color as DashboardPresetCategoryColor, icon: event.target.value as DashboardPresetCategoryIcon })} className="h-5 max-w-16 rounded border border-primary/15 bg-background px-0.5 text-[9px] text-foreground disabled:opacity-60">{Object.entries(presetCategoryIconLabel).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select><button type="button" aria-label={`ลบโฟลเดอร์ ${category.name}`} disabled={isPresetActionPending} className="text-primary/70 hover:text-destructive disabled:opacity-60" onClick={() => { if (pinnedCategoryId === String(category.id)) setPinnedCategoryId("all"); onDeletePresetCategory(category.id); }}>ลบ</button></div>;
              })}
              </div>
            </div>
          <div className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-6 xl:grid-cols-10">
            <label className="grid gap-1 text-[11px] font-medium text-muted-foreground">ค้นหาผู้สร้าง Preset ที่ปักหมุด<input value={pinnedCreatorSearch} maxLength={80} onChange={(event) => setPinnedCreatorSearch(event.target.value)} placeholder="ชื่อผู้สร้าง" className="h-8 rounded-md border border-input bg-background px-2 text-xs text-foreground" /></label>
            <label className="grid gap-1 text-[11px] font-medium text-muted-foreground">โฟลเดอร์<select value={pinnedCategoryId} onChange={(event) => setPinnedCategoryId(event.target.value)} className="h-8 rounded-md border border-input bg-background px-2 text-xs text-foreground"><option value="all">ทุกโฟลเดอร์</option><option value="uncategorized">ยังไม่จัดโฟลเดอร์</option>{sortedPresetCategories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select></label>
            <label className="grid gap-1 text-[11px] font-medium text-muted-foreground">เรียงโฟลเดอร์<select value={folderCountSort} onChange={(event) => setFolderCountSort(event.target.value as "name" | "count_desc" | "count_asc")} className="h-8 rounded-md border border-input bg-background px-2 text-xs text-foreground"><option value="name">ตามชื่อ</option><option value="count_desc">Preset มากไปน้อย</option><option value="count_asc">Preset น้อยไปมาก</option></select></label>
            <label className="grid gap-1 text-[11px] font-medium text-muted-foreground">ค้นหาโฟลเดอร์<input value={folderSearch} maxLength={80} onChange={(event) => setFolderSearch(event.target.value)} placeholder="ชื่อโฟลเดอร์" className="h-8 rounded-md border border-input bg-background px-2 text-xs text-foreground" /></label>
            <label className="grid gap-1 text-[11px] font-medium text-muted-foreground">แสดงโฟลเดอร์<select value={folderVisibility} onChange={(event) => setFolderVisibility(event.target.value as "all" | "empty" | "nonempty")} className="h-8 rounded-md border border-input bg-background px-2 text-xs text-foreground"><option value="all">ทั้งหมด</option><option value="empty">เฉพาะโฟลเดอร์ว่าง</option><option value="nonempty">เฉพาะโฟลเดอร์ที่มี Preset</option></select></label>
            <label className="grid gap-1 text-[11px] font-medium text-muted-foreground">กรองสี<select value={folderColorFilter} onChange={(event) => setFolderColorFilter(event.target.value as "all" | DashboardPresetCategoryColor)} className="h-8 rounded-md border border-input bg-background px-2 text-xs text-foreground"><option value="all">ทุกสี</option>{Object.entries(presetCategoryAppearance).map(([value, item]) => <option key={value} value={value}>{item.label}</option>)}</select></label>
            <label className="grid gap-1 text-[11px] font-medium text-muted-foreground">กรองไอคอน<select value={folderIconFilter} onChange={(event) => setFolderIconFilter(event.target.value as "all" | DashboardPresetCategoryIcon)} className="h-8 rounded-md border border-input bg-background px-2 text-xs text-foreground"><option value="all">ทุกไอคอน</option>{Object.entries(presetCategoryIconLabel).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
            <label className="grid gap-1 text-[11px] font-medium text-muted-foreground">ชื่อโฟลเดอร์ใหม่<input value={newPresetCategoryName} maxLength={80} disabled={isPresetActionPending} onChange={(event) => setNewPresetCategoryName(event.target.value)} placeholder="เช่น ติดตามสิ้นเดือน" className="h-8 rounded-md border border-input bg-background px-2 text-xs text-foreground disabled:opacity-60" /></label>
            <label className="grid gap-1 text-[11px] font-medium text-muted-foreground">สีโฟลเดอร์<select value={newPresetCategoryColor} disabled={isPresetActionPending} onChange={(event) => setNewPresetCategoryColor(event.target.value as DashboardPresetCategoryColor)} className="h-8 rounded-md border border-input bg-background px-2 text-xs text-foreground disabled:opacity-60">{Object.entries(presetCategoryAppearance).map(([value, item]) => <option key={value} value={value}>{item.label}</option>)}</select></label>
            <label className="grid gap-1 text-[11px] font-medium text-muted-foreground">ไอคอนโฟลเดอร์<select value={newPresetCategoryIcon} disabled={isPresetActionPending} onChange={(event) => setNewPresetCategoryIcon(event.target.value as DashboardPresetCategoryIcon)} className="h-8 rounded-md border border-input bg-background px-2 text-xs text-foreground disabled:opacity-60">{Object.entries(presetCategoryIconLabel).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-2"><span className={`h-3 w-3 rounded-full ${presetCategoryAppearance[newPresetCategoryColor].swatchClass}`} /><PresetCategoryIcon icon={newPresetCategoryIcon} /><Button type="button" size="sm" variant="outline" disabled={!newPresetCategoryName.trim() || isPresetActionPending} className="h-8 text-[11px]" onClick={() => { onCreatePresetCategory({ name: newPresetCategoryName.trim(), color: newPresetCategoryColor, icon: newPresetCategoryIcon }); setNewPresetCategoryName(""); }}>สร้างโฟลเดอร์</Button>{isPinnedFilterActive && <p className="text-[10px] text-muted-foreground">ล้างตัวกรองชื่อ ผู้สร้าง และโฟลเดอร์เพื่อจัดลำดับด้วยการลากวาง</p>}</div>
          <div className="mt-3 rounded-md border border-border/60 bg-background/55 p-2"><div className="flex flex-wrap items-center justify-between gap-2"><div className="flex items-center gap-2"><input type="checkbox" aria-label="เลือก Preset ที่ปักหมุดทั้งหมดที่แสดง" checked={visiblePinnedPresets.length > 0 && visiblePinnedPresets.every((preset) => selectedPinnedPresetIds.includes(preset.id))} disabled={visiblePinnedPresets.length === 0 || isPresetActionPending} onChange={toggleVisiblePinnedPresetSelection} className="h-3.5 w-3.5 accent-primary" /><p className="text-[11px] font-medium">เลือก {selectedPinnedPresetIds.length} Preset เพื่อย้ายพร้อมกัน</p><Button type="button" size="sm" variant="ghost" disabled={selectedPinnedPresetIds.length === 0 || isPresetActionPending} className="h-7 px-2 text-[10px] text-muted-foreground" onClick={() => setSelectedPinnedPresetIds([])}>ยกเลิกการเลือก</Button></div><div className="flex flex-wrap items-center gap-2"><select aria-label="เลือกโฟลเดอร์ปลายทางสำหรับ Preset ที่เลือก" value={bulkMoveCategoryId} disabled={selectedPinnedPresetIds.length === 0 || isPresetActionPending} onChange={(event) => setBulkMoveCategoryId(event.target.value)} className="h-8 rounded-md border border-input bg-background px-2 text-[11px] text-foreground disabled:opacity-60"><option value="uncategorized">ไม่จัดโฟลเดอร์</option>{sortedPresetCategories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select><Button type="button" size="sm" disabled={selectedPinnedPresetIds.length === 0 || isPresetActionPending} className="h-8 text-[11px]" onClick={() => requestBulkFolderMove({ presetIds: selectedPinnedPresetIds, categoryId: bulkMoveCategoryId === "uncategorized" ? null : Number(bulkMoveCategoryId) })}>ย้าย Preset ที่เลือก</Button><BulkPresetDragHandle count={selectedPinnedPresetIds.length} disabled={selectedPinnedPresetIds.length === 0 || visiblePresetCategories.length === 0 || isPresetActionPending} /></div></div><div className="mt-2"><p className="text-[10px] text-muted-foreground">ลาก Preset ที่เลือกไปวางบนโฟลเดอร์เป้าหมายเพื่อย้ายโดยตรง</p><div className="mt-1.5 grid gap-1.5 sm:grid-cols-2 lg:grid-cols-3">{visiblePresetCategories.length > 0 ? visiblePresetCategories.map((category) => <PresetFolderDropTarget key={category.id} category={category} disabled={selectedPinnedPresetIds.length === 0 || isPresetActionPending} />) : <p className="text-[10px] text-muted-foreground">ไม่พบโฟลเดอร์ที่ตรงกับตัวกรอง</p>}</div></div></div>
          <div className="mt-2 grid gap-1.5 sm:grid-cols-2"><p className="sm:col-span-2 text-[11px] font-medium text-muted-foreground">จัดโฟลเดอร์ราย Preset หรือเลือกหลายรายการด้านบน</p>{pinnedPresets.map((preset) => <label key={preset.id} className="flex min-w-0 items-center gap-2 rounded-md border border-border/60 bg-background/55 px-2 py-1.5 text-[11px]"><input type="checkbox" aria-label={`เลือก ${preset.name} เพื่อย้ายพร้อมกัน`} checked={selectedPinnedPresetIds.includes(preset.id)} disabled={isPresetActionPending} onChange={() => togglePinnedPresetSelection(preset.id)} className="h-3.5 w-3.5 accent-primary" /><span className="min-w-0 flex-1 truncate">{preset.name}</span><select aria-label={`เลือกโฟลเดอร์สำหรับ ${preset.name}`} value={preset.categoryId ? String(preset.categoryId) : "uncategorized"} disabled={isPresetActionPending} onChange={(event) => onPresetCategoryChange({ presetId: preset.id, categoryId: event.target.value === "uncategorized" ? null : Number(event.target.value) })} className="h-7 max-w-40 rounded border border-input bg-background px-1 text-[10px] text-foreground disabled:opacity-60"><option value="uncategorized">ไม่จัดโฟลเดอร์</option>{presetCategories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select></label>)}</div>
          </DndContext>
          <div className="mt-3 rounded-md border border-primary/15 bg-primary/5 p-2.5"><div className="flex flex-wrap items-center justify-between gap-2"><div><p className="text-[11px] font-semibold text-primary">ประวัติการย้าย Preset</p><p className="text-[10px] text-muted-foreground">แสดงรายการล่าสุดของบัญชีคุณ และย้อนกลับหรือทำซ้ำได้หนึ่งรายการล่าสุด</p></div><Button type="button" size="sm" variant="outline" aria-label="ส่งออกประวัติการย้าย Preset เป็น CSV" disabled={presetCategoryMoveHistory.length === 0} className="h-7 gap-1 px-2 text-[10px]" onClick={exportPresetCategoryMoveHistory}><FileDown className="h-3 w-3" />CSV</Button></div>{presetCategoryMoveHistory.length > 0 ? <div className="mt-2 grid gap-1.5">{presetCategoryMoveHistory.map((move, index) => <div key={move.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-primary/10 bg-background/55 px-2 py-1.5 text-[10px]"><span>ย้าย {move.presetCount.toLocaleString("th-TH")} Preset ไปยัง {move.destinationCategoryId === null ? "ไม่จัดโฟลเดอร์" : `โฟลเดอร์ ${presetCategories.find((category) => category.id === move.destinationCategoryId)?.name ?? "ที่ลบแล้ว"}`} · {presetUpdatedLabel(move.createdAt)}</span>{index === 0 ? move.undoneAt ? <Button type="button" size="sm" variant="ghost" aria-label="ทำซ้ำการย้าย Preset ล่าสุด" disabled={isRedoingPresetCategoryMove || isPresetActionPending} className="h-7 px-2 text-[10px] text-primary" onClick={() => onRedoPresetCategoryMove(move.id)}>{isRedoingPresetCategoryMove && <Loader2 className="h-3 w-3 animate-spin" />}Redo</Button> : <Button type="button" size="sm" variant="ghost" aria-label="ย้อนกลับการย้าย Preset ล่าสุด" disabled={isUndoingPresetCategoryMove || isPresetActionPending} className="h-7 px-2 text-[10px] text-primary" onClick={() => onUndoPresetCategoryMove(move.id)}>{isUndoingPresetCategoryMove && <Loader2 className="h-3 w-3 animate-spin" />}Undo</Button> : <span className="text-muted-foreground">{move.undoneAt ? "ย้อนกลับแล้ว" : "ย้อนหลัง"}</span>}</div>)}</div> : <p className="mt-2 text-[10px] text-muted-foreground">ยังไม่มีประวัติการย้าย Preset</p>}</div>
        </div>
      )}
      <div className="mt-3 flex flex-wrap items-end gap-2 border-t border-border/60 pt-3">
        <label className="grid min-w-44 flex-1 gap-1 text-xs font-medium text-muted-foreground">ค้นหา Preset<input value={presetSearch} maxLength={80} onChange={(event) => onPresetSearchChange(event.target.value)} placeholder="ค้นหาตามชื่อ" className="h-9 rounded-md border border-input bg-background px-2 text-sm text-foreground" /></label>
        <label className="grid min-w-40 flex-1 gap-1 text-xs font-medium text-muted-foreground">ชื่อผู้สร้าง<input value={presetCreatorSearch} maxLength={80} onChange={(event) => onPresetCreatorSearchChange(event.target.value)} placeholder="ค้นหาผู้สร้าง" className="h-9 rounded-md border border-input bg-background px-2 text-sm text-foreground" /></label>
        <label className="grid gap-1 text-xs font-medium text-muted-foreground">แสดง<select value={presetScope} onChange={(event) => onPresetScopeChange(event.target.value as "all" | "private" | "team")} className="h-9 rounded-md border border-input bg-background px-2 text-sm text-foreground"><option value="all">ทั้งหมด</option><option value="private">ของฉัน</option><option value="team">ของทีม</option></select></label>
        <label className="grid gap-1 text-xs font-medium text-muted-foreground">เรียงลำดับ<select value={presetSort} onChange={(event) => onPresetSortChange(event.target.value as "updated_desc" | "name_asc" | "name_desc")} className="h-9 rounded-md border border-input bg-background px-2 text-sm text-foreground"><option value="updated_desc">ล่าสุดก่อน</option><option value="name_asc">ชื่อ ก-ฮ</option><option value="name_desc">ชื่อ ฮ-ก</option></select></label>
      </div>
      {rangePresets.length > 0 ? <div className="mt-3 grid gap-2 sm:grid-cols-2" aria-label="รายการ Custom Date Range presets">{rangePresets.map((preset) => <div key={preset.id} className={`flex min-w-0 flex-col gap-2 rounded-lg border bg-background/60 p-2 ${preset.isPinned ? "border-primary/45 shadow-sm shadow-primary/10" : "border-border/70"}`}><div className="flex min-w-0 items-start justify-between gap-2"><Button type="button" size="sm" variant="ghost" disabled={isRefreshingPeriod || isPresetActionPending} className="h-auto min-w-0 flex-1 justify-start px-1.5 py-1 text-left" onClick={() => applyPreset(preset)}><span className="block min-w-0"><span className="block truncate text-xs font-semibold">{preset.isPinned ? "ปักหมุด · " : ""}{preset.name}</span><span className="mt-0.5 block text-[11px] font-normal text-muted-foreground">สร้างโดย {preset.creatorName}</span></span></Button><span className={`shrink-0 px-1 text-[10px] font-medium ${preset.isShared ? "text-primary" : "text-muted-foreground"}`}>{preset.isShared ? "ทีม Admin" : "ส่วนตัว"}</span></div><div className="flex flex-wrap items-center justify-between gap-1 border-t border-border/50 pt-1.5"><span className="text-[10px] text-muted-foreground">แก้ไขล่าสุด {presetUpdatedLabel(preset.updatedAt)} · ใช้ {(preset.usageCount ?? 0).toLocaleString("th-TH")} ครั้ง</span><span className="flex items-center gap-1"><Button type="button" size="sm" variant="ghost" aria-label={`${preset.isPinned ? "ยกเลิกการปักหมุด" : "ปักหมุด"} Preset ${preset.name}`} disabled={isPresetActionPending} className={`h-7 px-2 text-[11px] ${preset.isPinned ? "text-primary" : "text-muted-foreground"}`} onClick={() => onPresetPinToggle({ id: preset.id, isPinned: !preset.isPinned })}>{preset.isPinned ? "ยกเลิกหมุด" : "ปักหมุด"}</Button>{preset.isOwner ? <><Button type="button" size="sm" variant="ghost" aria-label={`${preset.isShared ? "ยกเลิกแชร์" : "แชร์"} Preset ${preset.name}`} disabled={isPresetActionPending} className="h-7 px-2 text-[11px] text-primary" onClick={() => onSharePreset({ id: preset.id, isShared: !preset.isShared })}>{preset.isShared ? "ยกเลิกแชร์" : "แชร์"}</Button><Button type="button" size="sm" variant="ghost" aria-label={`ลบ Preset ${preset.name}`} disabled={isPresetActionPending} className="h-7 px-2 text-[11px] text-muted-foreground hover:text-destructive" onClick={() => onDeletePreset(preset.id)}>ลบ</Button></> : <><Button type="button" size="sm" variant="ghost" aria-label={`คัดลอก Preset ${preset.name} เป็นส่วนตัว`} disabled={isPresetActionPending} className="h-7 px-2 text-[11px] text-primary" onClick={() => setCopyConfirmation(preset)}>คัดลอก</Button><span className="px-1 text-[10px] text-muted-foreground">จากทีม</span></>}</span></div></div>)}</div> : <p className="mt-3 text-xs text-muted-foreground">ไม่พบ Preset ที่ตรงเงื่อนไข</p>}
      <Dialog open={Boolean(pendingBulkFolderMove)} onOpenChange={(open) => { if (!open) setPendingBulkFolderMove(null); }}><DialogContent><DialogHeader><DialogTitle>ยืนยันการย้าย Preset หลายรายการ</DialogTitle><DialogDescription>{pendingBulkFolderMove ? `ต้องการย้าย Preset ที่เลือก ${pendingBulkFolderMove.presetIds.length} รายการไปยัง ${pendingBulkFolderMove.categoryId === null ? "สถานะไม่จัดโฟลเดอร์" : `โฟลเดอร์ “${presetCategories.find((category) => category.id === pendingBulkFolderMove.categoryId)?.name ?? "ที่เลือก"}”`} หรือไม่? การจัดกลุ่มของบัญชีคุณจะถูกเปลี่ยนแปลง` : ""}</DialogDescription></DialogHeader><div className="flex justify-end gap-2"><Button type="button" variant="outline" disabled={isPresetActionPending} onClick={() => setPendingBulkFolderMove(null)}>ยกเลิก</Button><Button type="button" disabled={!pendingBulkFolderMove || isPresetActionPending} onClick={confirmBulkFolderMove}>{isPresetActionPending && <Loader2 className="h-4 w-4 animate-spin" />}ยืนยันการย้าย</Button></div></DialogContent></Dialog>
      <Dialog open={Boolean(copyConfirmation)} onOpenChange={(open) => { if (!open) setCopyConfirmation(null); }}><DialogContent><DialogHeader><DialogTitle>คัดลอก Preset ของทีม</DialogTitle><DialogDescription>{copyConfirmation ? `ต้องการคัดลอก “${copyConfirmation.name}” เป็น Preset ส่วนตัวหรือไม่? คุณสามารถแก้ไขและแชร์สำเนาของตนเองได้ โดย Preset ต้นฉบับของทีมจะไม่เปลี่ยนแปลง` : ""}</DialogDescription></DialogHeader><div className="flex justify-end gap-2"><Button type="button" variant="outline" onClick={() => setCopyConfirmation(null)}>ยกเลิก</Button><Button type="button" disabled={!copyConfirmation || isPresetActionPending} onClick={() => { if (!copyConfirmation) return; onCopyPresetToPrivate(copyConfirmation.id); setCopyConfirmation(null); }}>ยืนยันการคัดลอก</Button></div></DialogContent></Dialog>
      <Dialog open={clearPinsConfirmation} onOpenChange={setClearPinsConfirmation}><DialogContent><DialogHeader><DialogTitle>ยกเลิกการปักหมุดทั้งหมด</DialogTitle><DialogDescription>ต้องการยกเลิกหมุด Preset ทั้งหมดของบัญชีนี้หรือไม่? Preset และประวัติการใช้งานจะยังคงอยู่</DialogDescription></DialogHeader><div className="flex justify-end gap-2"><Button type="button" variant="outline" onClick={() => setClearPinsConfirmation(false)}>ยกเลิก</Button><Button type="button" variant="destructive" disabled={isClearingPresetPins} onClick={() => { onClearAllPresetPins(); setClearPinsConfirmation(false); }}>{isClearingPresetPins && <Loader2 className="h-4 w-4 animate-spin" />}ยืนยันยกเลิกหมุดทั้งหมด</Button></div></DialogContent></Dialog>
    </div>

    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-6">
      <Kpi comparison={kpiComparison?.users ?? null} onClick={() => onKpiSelect("users")} icon={<Users />} tone="blue" label="ผู้ใช้งาน" value={(stats?.users.total ?? 0).toLocaleString("th-TH")} detail={`ผู้กู้ ${stats?.users.borrowers ?? 0} · ผู้ให้กู้ ${stats?.users.lenders ?? 0}`} />
      <Kpi comparison={kpiComparison?.activeLoans ?? null} onClick={() => onKpiSelect("activeLoans")} icon={<Landmark />} tone="indigo" label="สัญญาที่ดำเนินอยู่" value={(stats?.loans.active ?? 0).toLocaleString("th-TH")} detail={`รวม ${stats?.loans.total ?? 0} · ปิดแล้ว ${stats?.loans.closed ?? 0}`} />
      <Kpi comparison={kpiComparison?.principal ?? null} onClick={() => onKpiSelect("principal")} icon={<CircleDollarSign />} tone="cyan" label="เงินต้นรวม" value={amount(stats?.loans.totalPrincipal ?? 0)} detail={`ดอกเบี้ยเฉลี่ย ${stats?.loans.avgInterestRate ?? 0}%`} />
      <Kpi comparison={kpiComparison?.paid ?? null} onClick={() => onKpiSelect("paid")} icon={<TrendingUp />} tone="emerald" label="ชำระสะสม" value={amount(stats?.loans.totalPaid ?? 0)} detail={`คิดเป็น ${repaymentRate.toFixed(1)}% ของเงินต้น`} />
      <Kpi comparison={kpiComparison?.outstanding ?? null} onClick={() => onKpiSelect("outstanding")} icon={<AlertTriangle />} tone="amber" label="ยอดคงค้าง" value={amount(stats?.loans.totalOutstanding ?? 0)} detail={`คำขอกู้รออนุมัติ ${stats?.requests.pending ?? 0}`} />
      <Kpi comparison={kpiComparison?.pendingPayments ?? null} onClick={() => onKpiSelect("pendingPayments")} icon={<FileCheck2 />} tone="rose" label="รอตรวจหลักฐาน" value={(stats?.payments.pending ?? 0).toLocaleString("th-TH")} detail={`ตรวจแล้ว ${stats?.payments.verified ?? 0} รายการ`} />
    </div>

    <div className="grid gap-5 xl:grid-cols-3">
      <Card className="glass-panel xl:col-span-2"><CardHeader className="flex-row items-start justify-between gap-4"><div><CardTitle>แนวโน้มการชำระเงิน</CardTitle><CardDescription>ยอดชำระรายวันย้อนหลัง {timeRange} วัน · ชี้ที่แท่งเพื่อดูยอดที่แน่นอน</CardDescription></div><div className="flex items-center gap-1"><Button type="button" size="icon" variant="ghost" aria-label="ส่งออกกราฟยอดชำระเป็น PNG" disabled={exporting === "payment" || !paymentTrend?.data.some((value) => value > 0)} onClick={() => void exportChart("payment", "png")}><ImageDown className="h-4 w-4" /></Button><Button type="button" size="icon" variant="ghost" aria-label="ส่งออกกราฟยอดชำระเป็น PDF" disabled={exporting === "payment" || !paymentTrend?.data.some((value) => value > 0)} onClick={() => void exportChart("payment", "pdf")}><FileDown className="h-4 w-4" /></Button><div className="rounded-lg bg-primary/10 p-2 text-primary"><TrendingUp className="h-5 w-5" /></div></div></CardHeader><CardContent>{chartLoading.trend ? <ChartSkeleton label="กำลังโหลดข้อมูลแนวโน้มการชำระเงิน..." /> : paymentTrend?.data.some((value) => value > 0) ? <div className="h-64"><Bar ref={paymentTrendRef} data={trendData} options={{ responsive: true, maintainAspectRatio: false, interaction: { intersect: false, mode: "index" }, plugins: { legend: { display: false }, tooltip: { displayColors: false, callbacks: { title: (items) => `วันที่ ${items[0]?.label ?? "-"}`, label: (context) => `ยอดชำระ ${amount(Number(context.parsed.y))}` } } }, scales: { x: { grid: { display: false }, ticks: { maxRotation: 0, autoSkip: true } }, y: { beginAtZero: true, grid: { color: "rgba(148,163,184,.16)" }, ticks: { callback: (value) => amount(Number(value)) } } } }} /></div> : <EmptyChart message="ยังไม่มีข้อมูลการชำระเงินในช่วงเวลานี้" />}</CardContent></Card>
      <Card className="glass-panel"><CardHeader className="flex-row items-start justify-between gap-3"><div><CardTitle>สถานะสัญญา</CardTitle><CardDescription>สัดส่วนสัญญาในพอร์ตปัจจุบัน</CardDescription></div><div className="flex gap-1"><Button type="button" size="icon" variant="ghost" aria-label="ส่งออกกราฟสถานะสัญญาเป็น PNG" disabled={exporting === "status" || !loanStatus?.data.some((value) => value > 0)} onClick={() => void exportChart("status", "png")}><ImageDown className="h-4 w-4" /></Button><Button type="button" size="icon" variant="ghost" aria-label="ส่งออกกราฟสถานะสัญญาเป็น PDF" disabled={exporting === "status" || !loanStatus?.data.some((value) => value > 0)} onClick={() => void exportChart("status", "pdf")}><FileDown className="h-4 w-4" /></Button></div></CardHeader><CardContent>{chartLoading.loanStatus ? <ChartSkeleton /> : loanStatus?.data.some((value) => value > 0) ? <><div className="mx-auto h-48 max-w-xs"><Doughnut ref={loanStatusRef} data={loanStatusData} options={{ responsive: true, maintainAspectRatio: false, cutout: "67%", plugins: { legend: { position: "bottom", labels: { boxWidth: 9, usePointStyle: true } }, tooltip: { displayColors: false, callbacks: { label: (context) => `${context.label}: ${Number(context.parsed).toLocaleString("th-TH")} สัญญา` } } } }} /></div><div className="mt-2 grid grid-cols-2 gap-2 text-xs">{loanStatus.labels.map((label, index) => <div key={label} className="rounded-lg bg-muted/60 p-2"><p className="text-muted-foreground">{label}</p><p className="mt-1 font-semibold">{loanStatus.data[index].toLocaleString("th-TH")} สัญญา</p></div>)}</div></> : <EmptyChart message="ยังไม่มีข้อมูลสถานะสัญญา" />}</CardContent></Card>
    </div>

    <div className="grid gap-5 xl:grid-cols-3">
      <Card className="glass-panel xl:col-span-2"><CardHeader className="flex-row items-start justify-between gap-4"><div><CardTitle>ยอดคงค้างตามสัญญา</CardTitle><CardDescription>สัญญาที่ยังดำเนินอยู่ เรียงตามยอดคงค้าง</CardDescription></div><Banknote className="h-5 w-5 text-amber-500" /></CardHeader><CardContent>{chartLoading.outstanding ? <ChartSkeleton /> : outstanding?.length ? <div className="space-y-4">{outstanding.slice(0, 6).map((item, index) => <div key={item.label} className="grid grid-cols-[3.2rem_1fr_5.5rem] items-center gap-3 text-xs sm:grid-cols-[4rem_1fr_7rem]"><span className="font-medium text-muted-foreground">{item.label}</span><div className="h-2.5 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-gradient-to-r from-primary to-sky-400" style={{ width: `${Math.max(3, (item.value / maxOutstanding) * 100)}%`, opacity: 1 - index * 0.06 }} /></div><span className="text-right font-semibold">{amount(item.value)}</span></div>)}</div> : <EmptyChart message="ยังไม่มีข้อมูลยอดคงค้าง" />}</CardContent></Card>
      <Card className="glass-panel"><CardHeader><CardTitle>ความคืบหน้าการชำระ</CardTitle><CardDescription>เทียบยอดชำระสะสมกับเงินต้นรวม</CardDescription></CardHeader><CardContent><div className="flex flex-col items-center py-2"><div className="relative grid h-40 w-40 place-items-center rounded-full" style={{ background: `conic-gradient(#2563eb ${repaymentRate * 3.6}deg, rgba(148,163,184,.18) 0deg)` }}><div className="grid h-28 w-28 place-items-center rounded-full bg-card text-center"><span className="text-2xl font-bold text-primary">{repaymentRate.toFixed(1)}%</span><span className="text-[11px] text-muted-foreground">ชำระสะสม</span></div></div><div className="mt-5 grid w-full grid-cols-2 gap-3 text-center text-sm"><div className="rounded-xl bg-emerald-500/10 p-3"><p className="text-xs text-muted-foreground">ชำระแล้ว</p><p className="mt-1 font-semibold text-emerald-700 dark:text-emerald-300">{amount(stats?.loans.totalPaid ?? 0)}</p></div><div className="rounded-xl bg-amber-500/10 p-3"><p className="text-xs text-muted-foreground">คงค้าง</p><p className="mt-1 font-semibold text-amber-700 dark:text-amber-300">{amount(stats?.loans.totalOutstanding ?? 0)}</p></div></div></div></CardContent></Card>
    </div>

    <div className="grid gap-5 xl:grid-cols-3">
      <DistributionCard title="ประเภทสินเชื่อ" description="แยกตามรูปแบบการผ่อน" loading={chartLoading.loanTypes} loadingLabel="กำลังโหลดสัดส่วนประเภทสินเชื่อ..." data={loanTypes} chartData={loanTypeData} colors="loan" onSelect={onLoanTypeSelect} empty="ยังไม่มีข้อมูลประเภทสินเชื่อ" />
      <DistributionCard title="สถานะการชำระเงิน" description="ติดตามรายการชำระทั้งหมด" loading={chartLoading.paymentStatuses} loadingLabel="กำลังโหลดสัดส่วนสถานะการชำระ..." data={paymentStatuses} chartData={paymentStatusData} colors="payment" onSelect={onPaymentStatusSelect} empty="ยังไม่มีข้อมูลสถานะการชำระเงิน" />
      <Card className="glass-panel"><CardHeader className="flex-row items-start justify-between gap-3"><div><CardTitle>กิจกรรมล่าสุด</CardTitle><CardDescription>อนุมัติคำขอและตรวจสอบการชำระ</CardDescription></div><CheckCircle2 className="h-5 w-5 text-emerald-500" /></CardHeader><CardContent>{chartLoading.activity ? <ChartSkeleton label="กำลังโหลดประวัติการทำรายการ..." /> : activities.length ? <div className="max-h-64 space-y-3 overflow-y-auto pr-1">{activities.slice(0, 6).map((activity) => <div key={activity.id} className="flex gap-3 rounded-xl border border-border/60 p-3"><span className={`mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full ${activity.status === "approved" || activity.status === "verified" ? "bg-emerald-500" : "bg-rose-500"}`} /><div className="min-w-0"><p className="truncate text-sm font-medium">{activity.title}</p><p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{activity.detail} · ดำเนินการโดย {activity.actorName}</p><p className="mt-1 text-[11px] text-muted-foreground">{new Date(activity.occurredAt).toLocaleString("th-TH")}</p></div></div>)}</div> : <EmptyChart message="ยังไม่มีกิจกรรมล่าสุด" />}</CardContent></Card>
    </div>
    <Dialog open={kpiDetailLoading || kpiDetail !== null} onOpenChange={(open) => { if (!open) onKpiDetailClose(); }}><DialogContent className="max-w-2xl"><DialogHeader><div className="flex items-start justify-between gap-3"><div><DialogTitle>{kpiDetail?.title ?? "กำลังเตรียมรายละเอียด"}</DialogTitle><DialogDescription>{kpiDetail?.description ?? "กำลังอ่านข้อมูลที่ได้รับอนุญาต"}</DialogDescription></div>{kpiDetail?.items.length ? <Button type="button" size="sm" variant="outline" disabled={exportingKpiCsv} className="shrink-0 gap-2" onClick={exportKpiDetailCsv}>{exportingKpiCsv ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileDown className="h-4 w-4" />}{exportingKpiCsv ? "กำลังส่งออก" : "CSV"}</Button> : null}</div></DialogHeader>{kpiDetailLoading ? <ChartSkeleton className="h-48" label="กำลังโหลดรายการที่เกี่ยวข้อง..." /> : kpiDetail?.items.length ? <div className="max-h-[55vh] space-y-2 overflow-y-auto pr-1">{kpiDetail.items.map((item) => <div key={item.id} className="flex items-center justify-between gap-4 rounded-xl border border-border/70 p-3"><div className="min-w-0"><p className="truncate text-sm font-semibold">{item.title}</p><p className="mt-1 text-xs text-muted-foreground">{item.meta}</p></div><div className="flex shrink-0 items-center gap-3">{item.amount !== null && <span className="text-sm font-semibold">{amount(item.amount)}</span>}{item.href && <a href={item.href} className="text-sm font-medium text-primary hover:underline">ดูสัญญา</a>}</div></div>)}</div> : <EmptyChart message="ไม่พบรายการที่เกี่ยวข้อง" />}</DialogContent></Dialog>
  </section>;
}

function AnimatedKpiValue({ value }: { value: string }) {
  const target = Number(value.replace(/[^\d.-]/g, "")) || 0;
  const [displayed, setDisplayed] = useState(target);
  const previous = useRef(target);
  useEffect(() => {
    const initial = previous.current;
    if (initial === target) return;
    previous.current = target;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) { setDisplayed(target); return; }
    const startedAt = performance.now();
    let frame = 0;
    const update = (now: number) => {
      const progress = Math.min(1, (now - startedAt) / 360);
      const eased = 1 - Math.pow(1 - progress, 3);
      setDisplayed(initial + (target - initial) * eased);
      if (progress < 1) frame = requestAnimationFrame(update);
    };
    frame = requestAnimationFrame(update);
    return () => cancelAnimationFrame(frame);
  }, [target]);
  const prefix = value.startsWith("฿") ? "฿" : "";
  return <span className="motion-safe:transition-all motion-safe:duration-300">{prefix}{Math.round(displayed).toLocaleString("th-TH")}</span>;
}

function Kpi({ icon, tone, label, value, detail, comparison, onClick }: { icon: React.ReactNode; tone: "blue" | "indigo" | "cyan" | "emerald" | "amber" | "rose"; label: string; value: string; detail: string; comparison: { current: number; previous: number; label: string } | null; onClick: () => void }) {
  const colors = { blue: "bg-blue-500/10 text-blue-600 dark:text-blue-300", indigo: "bg-indigo-500/10 text-indigo-600 dark:text-indigo-300", cyan: "bg-cyan-500/10 text-cyan-700 dark:text-cyan-300", emerald: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300", amber: "bg-amber-500/10 text-amber-700 dark:text-amber-300", rose: "bg-rose-500/10 text-rose-700 dark:text-rose-300" };
  const delta = comparison ? comparison.current - comparison.previous : 0;
  const percentage = comparison && comparison.previous !== 0 ? Math.abs((delta / comparison.previous) * 100) : null;
  const trendTone = delta > 0 ? "text-emerald-600 dark:text-emerald-300" : delta < 0 ? "text-rose-600 dark:text-rose-300" : "text-muted-foreground";
  const TrendIcon = delta > 0 ? ArrowUpRight : delta < 0 ? ArrowDownRight : Minus;
  const trendText = !comparison ? "ไม่มีข้อมูลย้อนหลังที่เทียบได้" : percentage === null ? `${comparison.label} ${comparison.current.toLocaleString("th-TH")} รายการ` : `${comparison.label} ${delta > 0 ? "เพิ่ม" : delta < 0 ? "ลด" : "คงที่"} ${percentage.toFixed(1)}%`;
  return <button type="button" aria-label={`ดูรายละเอียด ${label}`} onClick={onClick} className="min-w-0 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"><Card className="glass-panel min-w-0 transition-transform hover:-translate-y-0.5 hover:border-primary/30"><CardContent className="p-4"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="truncate text-xs text-muted-foreground">{label}</p><p className="mt-2 truncate text-xl font-bold tracking-tight" aria-live="polite"><AnimatedKpiValue value={value} /></p></div><div className={`rounded-xl p-2.5 ${colors[tone]}`}>{icon}</div></div><p className="mt-3 truncate text-[11px] text-muted-foreground" title={detail}>{detail}</p><p className={`mt-2 flex items-center gap-1 text-[11px] font-medium ${trendTone}`} title={trendText}><TrendIcon className="h-3.5 w-3.5" />{trendText}</p></CardContent></Card></button>;
}

function DistributionCard({ title, description, loading, loadingLabel, data, chartData, colors, onSelect, empty }: { title: string; description: string; loading: boolean; loadingLabel: string; data: Slice[]; chartData: ChartData<"doughnut", number[], string>; colors: "loan" | "payment"; onSelect: (slice: Slice) => void; empty: string }) {
  const usable = data.some((item) => item.value > 0);
  return <Card className="glass-panel"><CardHeader><CardTitle>{title}</CardTitle><CardDescription>{description}</CardDescription></CardHeader><CardContent>{loading ? <ChartSkeleton label={loadingLabel} /> : usable ? <><div className="mx-auto h-40 max-w-[190px]"><Doughnut data={chartData} options={{ responsive: true, maintainAspectRatio: false, cutout: "66%", plugins: { legend: { display: false }, tooltip: { displayColors: false } }, onClick: (_event, elements) => { const selected = data[elements[0]?.index ?? -1]; if (selected) onSelect(selected); } }} /></div><div className="mt-4 space-y-2">{data.map((item, index) => <button key={item.name} type="button" aria-label={`${item.name}: ${item.value}`} onClick={() => onSelect(item)} className="flex w-full items-center justify-between rounded-lg px-2 py-1.5 text-left text-xs hover:bg-muted/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"><span className="flex items-center gap-2"><span className={`h-2.5 w-2.5 rounded-full ${colors === "loan" ? ["bg-blue-600", "bg-sky-500", "bg-teal-500", "bg-indigo-500"][index % 4] : ["bg-amber-500", "bg-emerald-500", "bg-rose-500", "bg-slate-500"][index % 4]}`} />{item.name}</span><span className="font-semibold">{item.value.toLocaleString("th-TH")}</span></button>)}</div></> : <EmptyChart message={empty} />}</CardContent></Card>;
}
