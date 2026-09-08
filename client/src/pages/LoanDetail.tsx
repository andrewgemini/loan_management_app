import { useAuth } from "@/_core/hooks/useAuth";
import DashboardLayout from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { trpc } from "@/lib/trpc";
import { useLocation } from "wouter";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Calendar, Download, ArrowLeft, WalletCards, ArrowUpDown, FileText, Search, TriangleAlert } from "lucide-react";
import { downloadHistoryPDF } from "@/lib/historyExport";
import { calculateAmortizationTotals, filterRowsByDateRange } from "@/lib/reportingUtils";
import { ReportDatePresetControls } from "@/components/ReportDatePresetControls";
import {
  filterAndSortSchedule,
  type ScheduleStatusFilter,
  type ScheduleSortKey,
  type ScheduleTableFilters,
} from "../lib/amortizationScheduleUtils";

export default function LoanDetail() {
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  const [isExporting, setIsExporting] = useState(false);
  const [isPdfExporting, setIsPdfExporting] = useState(false);
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [scheduleFilters, setScheduleFilters] = useState<ScheduleTableFilters>({
    query: "",
    status: "all",
    sortKey: "paymentNumber",
    sortDirection: "asc",
  });

  // Get loan ID from URL
  const pathname = typeof window !== "undefined" ? window.location.pathname : "";
  const loanId = parseInt(pathname.split("/").pop() || "0");

  const { data: loan, isLoading: loanLoading, isError: loanIsError } = trpc.loan.getLoan.useQuery(
    { id: loanId },
    { enabled: Boolean(user) && loanId > 0 }
  );

  const { data: schedule, isLoading: scheduleLoading, isError: scheduleIsError } =
    trpc.loan.getAmortizationSchedule.useQuery(
      { loanId },
      { enabled: Boolean(user) && loanId > 0 }
    );

  const filteredSchedule = useMemo(
    () => filterAndSortSchedule(filterRowsByDateRange(schedule ?? [], (row) => row.dueDate, startDate, endDate), scheduleFilters),
    [schedule, scheduleFilters, startDate, endDate]
  );

  const scheduleTotals = useMemo(() => calculateAmortizationTotals(filteredSchedule), [filteredSchedule]);

  const exportCSV = trpc.export.amortizationScheduleCSV.useQuery(
    {
      loanId,
      startDate: startDate || undefined,
      endDate: endDate || undefined,
    },
    { enabled: false }
  );

  if (!user) return <DashboardLayout><div /></DashboardLayout>;

  if (loanLoading || scheduleLoading) {
    return (
      <DashboardLayout>
        <div className="space-y-4">
          <div className="h-8 bg-muted rounded animate-pulse" />
          <div className="h-64 bg-muted rounded animate-pulse" />
        </div>
      </DashboardLayout>
    );
  }

  if (loanIsError || scheduleIsError || !loan) {
    return (
      <DashboardLayout>
        <div className="mx-auto max-w-md space-y-4 rounded-2xl border border-amber-200 bg-amber-50/80 p-8 text-center shadow-sm">
          <TriangleAlert className="mx-auto h-8 w-8 text-amber-600" aria-hidden="true" />
          <h1 className="text-lg font-semibold text-amber-950">ไม่สามารถเปิดรายละเอียดสัญญา</h1>
          <p className="text-sm text-amber-800">ไม่พบสัญญา หรือบัญชีของคุณไม่มีสิทธิ์เข้าถึงรายการนี้</p>
          <Button onClick={() => setLocation("/dashboard")}>
            กลับไปยัง Dashboard
          </Button>
        </div>
      </DashboardLayout>
    );
  }

  const handleExportCSV = async () => {
    if (startDate && endDate && startDate > endDate) {
      toast.error("วันสิ้นสุดต้องไม่น้อยกว่าวันเริ่มต้น");
      return;
    }

    try {
      setIsExporting(true);
      const result = await exportCSV.refetch();

      if (result.data?.csvContent) {
        // Create blob and download with UTF-8 BOM for Thai text.
        const BOM = "\uFEFF";
        const blob = new Blob([BOM + result.data.csvContent], {
          type: result.data.contentType,
        });

        const link = document.createElement("a");
        const url = URL.createObjectURL(blob);
        link.setAttribute("href", url);
        link.setAttribute("download", result.data.filename);
        link.style.visibility = "hidden";

        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);

        if (result.data.rowCount === 0 && (startDate || endDate)) {
          toast.info("ไม่พบงวดที่อยู่ในช่วงวันที่ที่เลือก จึงส่งออกเฉพาะหัวตาราง");
        } else {
          toast.success(`ดาวน์โหลด CSV สำเร็จ (${result.data.rowCount} งวด)`);
        }
      }
    } catch (error) {
      toast.error("เกิดข้อผิดพลาดในการ export CSV");
      console.error(error);
    } finally {
      setIsExporting(false);
    }
  };

  const handleExportPDF = async () => {
    if (startDate && endDate && startDate > endDate) {
      toast.error("วันสิ้นสุดต้องไม่น้อยกว่าวันเริ่มต้น");
      return;
    }

    try {
      setIsPdfExporting(true);
      await downloadHistoryPDF({
        title: `ตารางผ่อนชำระสัญญา #${loan.id}`,
        subtitle: `จำนวน ${filteredSchedule.length} งวด • ส่งออกเมื่อ ${new Date().toLocaleDateString("th-TH")}`,
        filenamePrefix: `amortization_schedule_loan_${loan.id}`,
        columns: [
          { header: "งวดที่", value: (row) => row.paymentNumber },
          { header: "ครบกำหนด", value: (row) => new Date(row.dueDate).toLocaleDateString("th-TH") },
          { header: "สถานะ", value: (row) => (row.isPaid ? "ชำระแล้ว" : "ยังไม่ชำระ") },
          { header: "ชำระต้น", value: (row) => Number(row.principalDue).toLocaleString("th-TH", { maximumFractionDigits: 2 }) },
          { header: "ชำระดอก", value: (row) => Number(row.interestDue).toLocaleString("th-TH", { maximumFractionDigits: 2 }) },
          { header: "รวมชำระ", value: (row) => Number(row.totalPaymentDue).toLocaleString("th-TH", { maximumFractionDigits: 2 }) },
          { header: "ยอดคงเหลือ", value: (row) => Number(row.endingBalance).toLocaleString("th-TH", { maximumFractionDigits: 2 }) },
        ],
        rows: filteredSchedule,
      });
      toast.success(`ดาวน์โหลด PDF สำเร็จ (${filteredSchedule.length} งวด)`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "เกิดข้อผิดพลาดในการ export PDF");
    } finally {
      setIsPdfExporting(false);
    }
  };

  const principal = parseFloat(loan.principalAmount);
  const paid = parseFloat(loan.totalPaid || "0");
  const remaining = principal - paid;
  const progress = (paid / principal) * 100;

  return (
    <DashboardLayout>
      <div className="space-y-8">
        {/* Header */}
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <Button
              variant="ghost"
              onClick={() => setLocation("/dashboard")}
              className="gap-2"
            >
              <ArrowLeft className="w-4 h-4" />
              กลับไป
            </Button>
            {user.id === loan.borrowerId && !loan.isClosed && (
              <Button onClick={() => setLocation(`/loan/${loan.id}/payment`)} className="gap-2 gradient-accent">
                <WalletCards className="w-4 h-4" />
                ชำระเงิน / ส่งสลิป
              </Button>
            )}
          </div>

          <div className="space-y-2">
            <h1 className="text-3xl font-bold">สัญญาเงินกู้ #{loan.id}</h1>
            <p className="text-muted-foreground">
              ผู้กู้: {user.name} • สถานะ: {loan.isClosed ? "ปิดแล้ว" : "กำลังดำเนิน"}
            </p>
          </div>
        </div>

        {/* Loan Summary */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card className="p-6 border border-border rounded-lg">
            <div className="space-y-2">
              <p className="text-sm text-muted-foreground">เงินต้น</p>
              <p className="text-2xl font-bold text-accent">
                ฿{principal.toLocaleString("th-TH", { maximumFractionDigits: 2 })}
              </p>
            </div>
          </Card>

          <Card className="p-6 border border-border rounded-lg">
            <div className="space-y-2">
              <p className="text-sm text-muted-foreground">ชำระแล้ว</p>
              <p className="text-2xl font-bold text-green-600">
                ฿{paid.toLocaleString("th-TH", { maximumFractionDigits: 2 })}
              </p>
            </div>
          </Card>

          <Card className="p-6 border border-border rounded-lg">
            <div className="space-y-2">
              <p className="text-sm text-muted-foreground">คงค้าง</p>
              <p className="text-2xl font-bold text-orange-600">
                ฿{remaining.toLocaleString("th-TH", { maximumFractionDigits: 2 })}
              </p>
            </div>
          </Card>

          <Card className="p-6 border border-border rounded-lg">
            <div className="space-y-2">
              <p className="text-sm text-muted-foreground">ความคืบหน้า</p>
              <p className="text-2xl font-bold text-accent">
                {progress.toFixed(1)}%
              </p>
            </div>
          </Card>
        </div>

        {/* Loan Details */}
        <Card className="p-6 border border-border rounded-lg">
          <h2 className="text-xl font-bold mb-4">รายละเอียดสัญญา</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-4">
              <div>
                <p className="text-sm text-muted-foreground">อัตราดอกเบี้ย</p>
                <p className="text-lg font-semibold">{loan.interestRate}% ต่อปี</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">ประเภทดอกเบี้ย</p>
                <p className="text-lg font-semibold">
                  {loan.interestType === "simple" ? "Simple Interest" : "Compound Interest"}
                </p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">ระยะเวลาผ่อน</p>
                <p className="text-lg font-semibold">{loan.loanTermMonths} เดือน</p>
              </div>
            </div>

            <div className="space-y-4">
              <div>
                <p className="text-sm text-muted-foreground">ประเภทการผ่อน</p>
                <p className="text-lg font-semibold">
                  {loan.paymentType === "fixed" ? "Fixed Payment" : "Reducing Balance"}
                </p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">วันเริ่มต้น</p>
                <p className="text-lg font-semibold">
                  {new Date(loan.startDate).toLocaleDateString("th-TH")}
                </p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">วันครบกำหนดชำระถัดไป</p>
                <p className="text-lg font-semibold">
                  {new Date(loan.nextPaymentDate).toLocaleDateString("th-TH")}
                </p>
              </div>
            </div>
          </div>
        </Card>

        {/* Progress Bar */}
        <Card className="p-6 border border-border rounded-lg">
          <h2 className="text-xl font-bold mb-4">ความคืบหน้าการชำระเงิน</h2>
          <div className="space-y-4">
            <div className="w-full bg-muted rounded-full h-4">
              <div
                className="bg-gradient-to-r from-emerald-400 to-green-600 h-4 rounded-full transition-all"
                style={{ width: `${progress}%` }}
              />
            </div>
            <div className="flex justify-between text-sm text-muted-foreground">
              <span>ชำระแล้ว: ฿{paid.toLocaleString("th-TH", { maximumFractionDigits: 2 })}</span>
              <span>คงค้าง: ฿{remaining.toLocaleString("th-TH", { maximumFractionDigits: 2 })}</span>
            </div>
          </div>
        </Card>

        {/* Amortization Chart */}
        <Card className="p-6 border border-border rounded-lg">
          <h2 className="text-xl font-bold mb-2">กราฟการลดหนี้</h2>
          <p className="text-sm text-muted-foreground mb-5">สัดส่วนยอดคงเหลือหลังชำระในแต่ละงวด</p>
          {schedule && schedule.length > 0 ? (
            <div className="space-y-3">
              {schedule.map((row) => {
                const endingBalance = Math.max(parseFloat(row.endingBalance), 0);
                const remainingPercent = principal > 0 ? Math.min((endingBalance / principal) * 100, 100) : 0;
                return (
                  <div key={`chart-${row.id}`} className="grid grid-cols-[3.5rem_1fr_5.5rem] items-center gap-3 text-xs">
                    <span className="text-muted-foreground">งวด {row.paymentNumber}</span>
                    <div className="h-3 overflow-hidden rounded-full bg-muted">
                      <div className="h-full rounded-full bg-gradient-to-r from-emerald-400 to-green-600 transition-all" style={{ width: `${remainingPercent}%` }} />
                    </div>
                    <span className="text-right font-medium">฿{endingBalance.toLocaleString("th-TH", { maximumFractionDigits: 0 })}</span>
                  </div>
                );
              })}
            </div>
          ) : <p className="py-6 text-center text-sm text-muted-foreground">ยังไม่มีข้อมูลกราฟการลดหนี้</p>}
        </Card>

        {/* Amortization Schedule */}
        <Card className="p-6 border border-border rounded-lg">
          <div className="flex flex-col gap-4 mb-6">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="text-xl font-bold">ตารางผ่อนชำระ</h2>
                <p className="text-sm text-muted-foreground mt-1">
                  เลือกช่วงวันที่เพื่อกรองตารางและส่งออกเฉพาะงวดที่ต้องการ หรือเว้นว่างเพื่อแสดงทั้งหมด
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  onClick={handleExportCSV}
                  disabled={isExporting || isPdfExporting}
                  className="gap-2 gradient-accent shrink-0"
                >
                  <Download className="w-4 h-4" />
                  {isExporting ? "กำลังดาวน์โหลด..." : "Export CSV"}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleExportPDF}
                  disabled={isExporting || isPdfExporting}
                  className="gap-2 shrink-0"
                >
                  <FileText className="w-4 h-4" />
                  {isPdfExporting ? "กำลังสร้าง PDF..." : "Export PDF"}
                </Button>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-[1fr_1fr_auto] gap-3 items-end rounded-lg bg-muted/40 p-4">
              <div className="space-y-2">
                <label htmlFor="export-start-date" className="text-sm font-medium">
                  วันเริ่มต้น
                </label>
                <div className="relative">
                  <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <input
                    id="export-start-date"
                    type="date"
                    value={startDate}
                    onChange={(event) => setStartDate(event.target.value)}
                    className="w-full h-10 rounded-md border border-input bg-background pl-9 pr-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <label htmlFor="export-end-date" className="text-sm font-medium">
                  วันสิ้นสุด
                </label>
                <div className="relative">
                  <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <input
                    id="export-end-date"
                    type="date"
                    value={endDate}
                    min={startDate || undefined}
                    onChange={(event) => setEndDate(event.target.value)}
                    className="w-full h-10 rounded-md border border-input bg-background pl-9 pr-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  />
                </div>
              </div>

              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setStartDate("");
                  setEndDate("");
                }}
                disabled={isExporting || (!startDate && !endDate)}
                className="h-10"
              >
                ล้างตัวกรอง
              </Button>
            </div>
            <ReportDatePresetControls
              scope={`amortization:${loanId}`}
              startDate={startDate}
              endDate={endDate}
              onRangeChange={({ startDate: nextStartDate, endDate: nextEndDate }) => {
                setStartDate(nextStartDate);
                setEndDate(nextEndDate);
              }}
            />

            <div className="space-y-3 rounded-lg border border-border/70 bg-background/60 p-4">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h3 className="font-semibold">ค้นหาประวัติการผ่อนชำระ</h3>
                  <p className="text-xs text-muted-foreground">ค้นหาด้วยเลขงวด วันที่ หรือสถานะการชำระ</p>
                </div>
                <span className="text-xs text-muted-foreground" aria-live="polite">
                  แสดง {filteredSchedule.length} จาก {schedule?.length || 0} งวด
                </span>
              </div>

              <div className="grid grid-cols-1 gap-3 md:grid-cols-[minmax(0,1.6fr)_minmax(10rem,1fr)_minmax(12rem,1fr)_auto] md:items-end">
                <div className="space-y-2">
                  <label htmlFor="schedule-search" className="text-sm font-medium">ค้นหา</label>
                  <div className="relative">
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <input
                      id="schedule-search"
                      type="search"
                      value={scheduleFilters.query}
                      onChange={(event) => setScheduleFilters((current) => ({ ...current, query: event.target.value }))}
                      placeholder="เช่น งวดที่ 3 หรือ 15/08/2569"
                      className="h-10 w-full rounded-md border border-input bg-background pl-9 pr-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <label htmlFor="schedule-status" className="text-sm font-medium">สถานะ</label>
                  <select
                    id="schedule-status"
                    value={scheduleFilters.status}
                    onChange={(event) => setScheduleFilters((current) => ({ ...current, status: event.target.value as ScheduleStatusFilter }))}
                    className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <option value="all">ทุกสถานะ</option>
                    <option value="paid">ชำระแล้ว</option>
                    <option value="unpaid">ยังไม่ชำระ</option>
                  </select>
                </div>

                <div className="space-y-2">
                  <label htmlFor="schedule-sort" className="text-sm font-medium">จัดเรียงตาม</label>
                  <select
                    id="schedule-sort"
                    value={scheduleFilters.sortKey}
                    onChange={(event) => setScheduleFilters((current) => ({ ...current, sortKey: event.target.value as ScheduleSortKey }))}
                    className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <option value="paymentNumber">เลขงวด</option>
                    <option value="dueDate">วันครบกำหนด</option>
                    <option value="totalPaymentDue">ยอดชำระรวม</option>
                    <option value="endingBalance">ยอดคงเหลือ</option>
                    <option value="status">สถานะการชำระ</option>
                  </select>
                </div>

                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setScheduleFilters((current) => ({ ...current, sortDirection: current.sortDirection === "asc" ? "desc" : "asc" }))}
                  className="h-10 gap-2"
                  aria-label={`จัดเรียง${scheduleFilters.sortDirection === "asc" ? "จากน้อยไปมาก" : "จากมากไปน้อย"}`}
                  title={scheduleFilters.sortDirection === "asc" ? "จากน้อยไปมาก" : "จากมากไปน้อย"}
                >
                  <ArrowUpDown className="h-4 w-4" />
                  {scheduleFilters.sortDirection === "asc" ? "น้อย → มาก" : "มาก → น้อย"}
                </Button>
              </div>

              {(scheduleFilters.query || scheduleFilters.status !== "all" || scheduleFilters.sortKey !== "paymentNumber" || scheduleFilters.sortDirection !== "asc") && (
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => setScheduleFilters({ query: "", status: "all", sortKey: "paymentNumber", sortDirection: "asc" })}
                  className="h-8 px-2 text-xs text-muted-foreground"
                >
                  รีเซ็ตการค้นหาและการจัดเรียง
                </Button>
              )}
            </div>
          </div>

          {schedule && schedule.length > 0 ? (
            filteredSchedule.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b border-border">
                  <tr>
                    <th className="text-left py-2 px-2">งวดที่</th>
                    <th className="text-left py-2 px-2">วันครบกำหนด</th>
                    <th className="text-center py-2 px-2">สถานะ</th>
                    <th className="text-right py-2 px-2">ยอดคงเหลือต้น</th>
                    <th className="text-right py-2 px-2">ชำระต้น</th>
                    <th className="text-right py-2 px-2">ชำระดอก</th>
                    <th className="text-right py-2 px-2">รวมชำระ</th>
                    <th className="text-right py-2 px-2">ยอดคงเหลือสิ้น</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredSchedule.map((row) => (
                    <tr
                      key={row.id}
                      className="border-b border-border hover:bg-muted/50"
                    >
                      <td className="py-2 px-2">{row.paymentNumber}</td>
                      <td className="py-2 px-2">
                        {new Date(row.dueDate).toLocaleDateString("th-TH")}
                      </td>
                      <td className="py-2 px-2 text-center">
                        <span className={`inline-flex rounded-full px-2 py-1 text-xs font-medium ${row.isPaid ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800"}`}>
                          {row.isPaid ? "ชำระแล้ว" : "ยังไม่ชำระ"}
                        </span>
                      </td>
                      <td className="text-right py-2 px-2">
                        ฿{parseFloat(row.startingBalance).toLocaleString("th-TH", {
                          maximumFractionDigits: 2,
                        })}
                      </td>
                      <td className="text-right py-2 px-2">
                        ฿{parseFloat(row.principalDue).toLocaleString("th-TH", {
                          maximumFractionDigits: 2,
                        })}
                      </td>
                      <td className="text-right py-2 px-2">
                        ฿{parseFloat(row.interestDue).toLocaleString("th-TH", {
                          maximumFractionDigits: 2,
                        })}
                      </td>
                      <td className="text-right py-2 px-2 font-semibold">
                        ฿{parseFloat(row.totalPaymentDue).toLocaleString("th-TH", {
                          maximumFractionDigits: 2,
                        })}
                      </td>
                      <td className="text-right py-2 px-2">
                        ฿{parseFloat(row.endingBalance).toLocaleString("th-TH", {
                          maximumFractionDigits: 2,
                        })}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="border-t-2 border-emerald-500 bg-emerald-50/70 font-semibold">
                  <tr>
                    <td colSpan={3} className="px-2 py-3">
                      รวม {filteredSchedule.length} งวด <span className="ml-1 text-xs font-normal text-muted-foreground">(ชำระแล้ว {scheduleTotals.paidCount} งวด)</span>
                    </td>
                    <td className="px-2 py-3 text-right text-muted-foreground">—</td>
                    <td className="px-2 py-3 text-right">฿{scheduleTotals.principalDue.toLocaleString("th-TH", { maximumFractionDigits: 2 })}</td>
                    <td className="px-2 py-3 text-right">฿{scheduleTotals.interestDue.toLocaleString("th-TH", { maximumFractionDigits: 2 })}</td>
                    <td className="px-2 py-3 text-right text-emerald-800">฿{scheduleTotals.totalPaymentDue.toLocaleString("th-TH", { maximumFractionDigits: 2 })}</td>
                    <td className="px-2 py-3 text-right">฿{scheduleTotals.endingBalance.toLocaleString("th-TH", { maximumFractionDigits: 2 })}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
            ) : (
              <p className="text-muted-foreground text-center py-8">
                ไม่พบงวดที่ตรงกับตัวกรองที่เลือก
              </p>
            )
          ) : (
            <p className="text-muted-foreground text-center py-8">
              ไม่มีข้อมูลตารางผ่อนชำระ
            </p>
          )}
        </Card>
      </div>
    </DashboardLayout>
  );
}
