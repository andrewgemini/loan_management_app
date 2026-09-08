import { useEffect, useMemo, useState } from "react";
import { Link, useRoute } from "wouter";
import DashboardLayout from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { trpc } from "@/lib/trpc";
import { ArrowLeft, ArrowUpDown, CheckCircle2, Download, FileText, FileUp, Search, WalletCards } from "lucide-react";
import { toast } from "sonner";
import QRCode from "qrcode";
import generatePromptPayPayload from "promptpay-qr";
import {
  filterAndSortPayments,
  getPaymentStatusLabel,
  type PaymentHistoryFilters,
  type PaymentSortKey,
  type PaymentStatusFilter,
} from "../lib/paymentHistoryUtils";
import { downloadHistoryCSV, downloadHistoryPDF } from "../lib/historyExport";
import { getPaymentRowsForExport } from "@/lib/paymentHistoryExportUtils";
import { ReportDatePresetControls } from "@/components/ReportDatePresetControls";

const MAX_FILE_SIZE = 5 * 1024 * 1024;
const ACCEPTED_TYPES = ["image/jpeg", "image/png", "application/pdf"] as const;
type AcceptedMimeType = (typeof ACCEPTED_TYPES)[number];

function readFileAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const value = String(reader.result || "");
      resolve(value.includes(",") ? value.split(",", 2)[1] : value);
    };
    reader.onerror = () => reject(new Error("อ่านไฟล์ไม่สำเร็จ"));
    reader.readAsDataURL(file);
  });
}

export default function PaymentPage() {
  const [, params] = useRoute<{ id: string }>("/loan/:id/payment");
  const loanId = Number(params?.id || 0);
  const [amountPaid, setAmountPaid] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<"promptpay" | "bank_transfer" | "cash">("promptpay");
  const [promptPayId, setPromptPayId] = useState("");
  const [promptPayQr, setPromptPayQr] = useState("");
  const [scheduleId, setScheduleId] = useState("");
  const [slip, setSlip] = useState<File | null>(null);
  const [paymentFilters, setPaymentFilters] = useState<PaymentHistoryFilters>({
    query: "",
    status: "all",
    sortKey: "paymentDate",
    sortDirection: "desc",
  });
  const [isHistoryCsvExporting, setIsHistoryCsvExporting] = useState(false);
  const [isHistoryPdfExporting, setIsHistoryPdfExporting] = useState(false);
  const [exportStartDate, setExportStartDate] = useState("");
  const [exportEndDate, setExportEndDate] = useState("");

  const utils = trpc.useUtils();
  const { data: loan, isLoading: loanLoading } = trpc.loan.getLoan.useQuery(
    { id: loanId },
    { enabled: loanId > 0 }
  );
  const { data: schedule } = trpc.loan.getAmortizationSchedule.useQuery(
    { loanId },
    { enabled: loanId > 0 }
  );
  const { data: payments, isLoading: paymentsLoading } = trpc.loan.getPayments.useQuery(
    { loanId },
    { enabled: loanId > 0 }
  );
  const uploadMutation = trpc.loan.uploadPaymentSlip.useMutation({
    onSuccess: () => {
      toast.success("ส่งหลักฐานการชำระเงินแล้ว รอผู้ให้กู้ตรวจสอบ");
      setAmountPaid("");
      setScheduleId("");
      setSlip(null);
      void utils.loan.getPayments.invalidate({ loanId });
    },
    onError: (error) => toast.error(error.message || "ส่งหลักฐานไม่สำเร็จ"),
  });

  const filteredPayments = useMemo(
    () => filterAndSortPayments(payments ?? [], paymentFilters),
    [payments, paymentFilters]
  );
  const paymentRowsForExport = useMemo(
    () => getPaymentRowsForExport(filteredPayments, exportStartDate, exportEndDate),
    [filteredPayments, exportStartDate, exportEndDate]
  );

  const selectedSchedule = useMemo(
    () => schedule?.find((row) => String(row.id) === scheduleId),
    [schedule, scheduleId]
  );

  useEffect(() => {
    let cancelled = false;
    const amount = Number(amountPaid);
    if (paymentMethod !== "promptpay" || !promptPayId.trim() || !Number.isFinite(amount) || amount <= 0) {
      setPromptPayQr("");
      return;
    }

    void (async () => {
      try {
        const payload = generatePromptPayPayload(promptPayId.trim(), { amount });
        const dataUrl = await QRCode.toDataURL(payload, { width: 240, margin: 2 });
        if (!cancelled) setPromptPayQr(dataUrl);
      } catch {
        if (!cancelled) setPromptPayQr("");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [amountPaid, paymentMethod, promptPayId]);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!loanId || !slip) {
      toast.error("กรุณาเลือกไฟล์สลิป");
      return;
    }
    if (!ACCEPTED_TYPES.includes(slip.type as AcceptedMimeType)) {
      toast.error("รองรับเฉพาะ JPG, PNG หรือ PDF");
      return;
    }
    if (slip.size > MAX_FILE_SIZE) {
      toast.error("ขนาดไฟล์ต้องไม่เกิน 5 MB");
      return;
    }

    try {
      const base64 = await readFileAsBase64(slip);
      await uploadMutation.mutateAsync({
        loanId,
        scheduleId: scheduleId ? Number(scheduleId) : undefined,
        amountPaid: Number(amountPaid),
        paymentMethod,
        fileName: slip.name,
        mimeType: slip.type as AcceptedMimeType,
        base64,
      });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "ส่งหลักฐานไม่สำเร็จ");
    }
  };

  const getPaymentExportOptions = () => ({
    title: `ประวัติการชำระเงินสัญญา #${loanId}`,
    subtitle: `จำนวน ${paymentRowsForExport.length} รายการ${exportStartDate || exportEndDate ? ` • ช่วง ${exportStartDate || "เริ่มต้น"} ถึง ${exportEndDate || "ปัจจุบัน"}` : ""} • ส่งออกเมื่อ ${new Date().toLocaleDateString("th-TH")}`,
    filenamePrefix: `payment_history_loan_${loanId}`,
    columns: [
      { header: "วันที่ชำระ", value: (payment: (typeof filteredPayments)[number]) => new Date(payment.paymentDate).toLocaleDateString("th-TH") },
      { header: "งวดอ้างอิง", value: (payment: (typeof filteredPayments)[number]) => payment.scheduleId ? `#${payment.scheduleId}` : "-" },
      { header: "จำนวนเงิน", value: (payment: (typeof filteredPayments)[number]) => Number(payment.amountPaid).toLocaleString("th-TH", { maximumFractionDigits: 2 }) },
      { header: "ช่องทาง", value: (payment: (typeof filteredPayments)[number]) => payment.paymentMethod },
      { header: "สถานะ", value: (payment: (typeof filteredPayments)[number]) => getPaymentStatusLabel(payment.status) },
    ],
    rows: paymentRowsForExport,
  });

  const handlePaymentHistoryCsvExport = () => {
    if (exportStartDate && exportEndDate && exportStartDate > exportEndDate) {
      toast.error("วันสิ้นสุดต้องไม่น้อยกว่าวันเริ่มต้น");
      return;
    }
    try {
      setIsHistoryCsvExporting(true);
      downloadHistoryCSV(getPaymentExportOptions());
      toast.success(`ดาวน์โหลด CSV สำเร็จ (${paymentRowsForExport.length} รายการ)`);
    } catch {
      toast.error("เกิดข้อผิดพลาดในการ export CSV");
    } finally {
      setIsHistoryCsvExporting(false);
    }
  };

  const handlePaymentHistoryPdfExport = async () => {
    if (exportStartDate && exportEndDate && exportStartDate > exportEndDate) {
      toast.error("วันสิ้นสุดต้องไม่น้อยกว่าวันเริ่มต้น");
      return;
    }
    try {
      setIsHistoryPdfExporting(true);
      await downloadHistoryPDF(getPaymentExportOptions());
      toast.success(`ดาวน์โหลด PDF สำเร็จ (${paymentRowsForExport.length} รายการ)`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "เกิดข้อผิดพลาดในการ export PDF");
    } finally {
      setIsHistoryPdfExporting(false);
    }
  };

  if (loanLoading || !loan) {
    return (
      <DashboardLayout>
        <div className="flex min-h-[50vh] items-center justify-center text-muted-foreground">
          {loanLoading ? "กำลังโหลดข้อมูลสัญญา..." : "ไม่พบสัญญาเงินกู้"}
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="mx-auto max-w-5xl space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <Link href={`/loan/${loanId}`}>
              <Button variant="outline" className="mb-3 gap-2"><ArrowLeft className="h-4 w-4" />กลับไปดูสัญญา</Button>
            </Link>
            <h1 className="text-3xl font-bold">ชำระเงินสัญญา #{loanId}</h1>
            <p className="text-muted-foreground">ส่งหลักฐานการโอนเพื่อให้ผู้ให้กู้ตรวจสอบ</p>
          </div>
          <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-5 py-4 text-right">
            <p className="text-sm text-emerald-700">ยอดคงค้างโดยประมาณ</p>
            <p className="text-2xl font-bold text-emerald-900">
              ฿{Math.max(Number(loan.principalAmount) - Number(loan.totalPaid || 0), 0).toLocaleString("th-TH", { maximumFractionDigits: 2 })}
            </p>
          </div>
        </div>

        <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><FileUp className="h-5 w-5 text-emerald-600" />ส่งหลักฐานการชำระ</CardTitle>
              <CardDescription>รองรับไฟล์ JPG, PNG และ PDF ขนาดไม่เกิน 5 MB</CardDescription>
            </CardHeader>
            <CardContent>
              <form className="space-y-5" onSubmit={handleSubmit}>
                <div className="space-y-2">
                  <label htmlFor="paymentAmount" className="text-sm font-medium">จำนวนเงินที่ชำระ (บาท)</label>
                  <Input id="paymentAmount" type="number" min="0.01" step="0.01" required value={amountPaid} onChange={(event) => setAmountPaid(event.target.value)} placeholder="เช่น 5500.00" />
                </div>
                <div className="space-y-2">
                  <label htmlFor="scheduleId" className="text-sm font-medium">งวดที่ชำระ (ถ้ามี)</label>
                  <select id="scheduleId" value={scheduleId} onChange={(event) => setScheduleId(event.target.value)} className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm">
                    <option value="">ไม่ระบุงวด</option>
                    {schedule?.map((row) => <option key={row.id} value={row.id}>งวดที่ {row.paymentNumber} · ครบกำหนด {new Date(row.dueDate).toLocaleDateString("th-TH")}</option>)}
                  </select>
                  {selectedSchedule && <p className="text-xs text-muted-foreground">ยอดตามตาราง: ฿{Number(selectedSchedule.totalPaymentDue).toLocaleString("th-TH", { maximumFractionDigits: 2 })}</p>}
                </div>
                <div className="space-y-2">
                  <label htmlFor="paymentMethod" className="text-sm font-medium">ช่องทางการชำระ</label>
                  <select id="paymentMethod" value={paymentMethod} onChange={(event) => setPaymentMethod(event.target.value as typeof paymentMethod)} className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm">
                    <option value="promptpay">พร้อมเพย์</option>
                    <option value="bank_transfer">โอนผ่านธนาคาร</option>
                    <option value="cash">เงินสด</option>
                  </select>
                </div>
                {paymentMethod === "promptpay" && (
                  <div className="space-y-3 rounded-xl border border-emerald-200 bg-emerald-50/60 p-4">
                    <div className="space-y-2">
                      <label htmlFor="promptPayId" className="text-sm font-medium text-emerald-950">PromptPay ID ของผู้รับ</label>
                      <Input id="promptPayId" value={promptPayId} onChange={(event) => setPromptPayId(event.target.value)} inputMode="numeric" placeholder="เบอร์โทรศัพท์หรือเลขบัตรประชาชน" />
                      <p className="text-xs text-emerald-800">ระบบใช้ข้อมูลนี้สร้าง QR ชั่วคราวบนเครื่องของคุณ และไม่บันทึกลงฐานข้อมูล</p>
                    </div>
                    {promptPayQr && <div className="flex justify-center rounded-lg bg-white p-3"><img src={promptPayQr} alt="QR พร้อมเพย์สำหรับชำระเงิน" className="h-48 w-48" /></div>}
                  </div>
                )}
                <div className="space-y-2">
                  <label htmlFor="slipFile" className="text-sm font-medium">ไฟล์สลิป</label>
                  <Input id="slipFile" type="file" accept="image/jpeg,image/png,application/pdf" required onChange={(event) => setSlip(event.target.files?.[0] || null)} />
                  {slip && <p className="text-xs text-muted-foreground">ไฟล์ที่เลือก: {slip.name}</p>}
                </div>
                <Button type="submit" disabled={uploadMutation.isPending || !amountPaid || !slip} className="w-full gap-2 bg-emerald-600 hover:bg-emerald-700">
                  <CheckCircle2 className="h-4 w-4" />{uploadMutation.isPending ? "กำลังส่งหลักฐาน..." : "ส่งหลักฐานการชำระ"}
                </Button>
              </form>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><WalletCards className="h-5 w-5 text-emerald-600" />ประวัติการชำระเงิน</CardTitle>
              <CardDescription>ค้นหา กรอง และจัดเรียงรายการล่าสุดของสัญญานี้</CardDescription>
              {payments && payments.length > 0 && (
                <div className="space-y-2 pt-2">
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    <label className="text-xs text-muted-foreground">วันเริ่มต้นรายงาน<input type="date" value={exportStartDate} onChange={(event) => setExportStartDate(event.target.value)} className="mt-1 h-9 w-full rounded-md border border-input bg-background px-2 text-sm" /></label>
                    <label className="text-xs text-muted-foreground">วันสิ้นสุดรายงาน<input type="date" min={exportStartDate || undefined} value={exportEndDate} onChange={(event) => setExportEndDate(event.target.value)} className="mt-1 h-9 w-full rounded-md border border-input bg-background px-2 text-sm" /></label>
                  </div>
                  <ReportDatePresetControls
                    scope={`payments:${loanId}`}
                    startDate={exportStartDate}
                    endDate={exportEndDate}
                    onRangeChange={({ startDate: nextStartDate, endDate: nextEndDate }) => {
                      setExportStartDate(nextStartDate);
                      setExportEndDate(nextEndDate);
                    }}
                  />
                  <div className="flex flex-wrap gap-2">
                    <Button type="button" size="sm" onClick={handlePaymentHistoryCsvExport} disabled={isHistoryCsvExporting || isHistoryPdfExporting} className="gap-2 bg-emerald-600 hover:bg-emerald-700">
                      <Download className="h-4 w-4" />{isHistoryCsvExporting ? "กำลังสร้าง CSV..." : "Export CSV"}
                    </Button>
                    <Button type="button" size="sm" variant="outline" onClick={handlePaymentHistoryPdfExport} disabled={isHistoryCsvExporting || isHistoryPdfExporting} className="gap-2">
                      <FileText className="h-4 w-4" />{isHistoryPdfExporting ? "กำลังสร้าง PDF..." : "Export PDF"}
                    </Button>
                    {(exportStartDate || exportEndDate) && <Button type="button" size="sm" variant="ghost" onClick={() => { setExportStartDate(""); setExportEndDate(""); }}>ล้างช่วงวันที่</Button>}
                  </div>
                </div>
              )}
            </CardHeader>
            <CardContent>
              {paymentsLoading ? (
                <div className="space-y-3" role="status" aria-live="polite" aria-busy="true" aria-label="กำลังโหลดประวัติการชำระ">
                  <div className="h-10 animate-pulse rounded-lg bg-muted" />
                  <div className="h-16 animate-pulse rounded-xl bg-muted" />
                  <div className="h-16 animate-pulse rounded-xl bg-muted" />
                </div>
              ) : payments && payments.length > 0 ? (
                <div className="space-y-4">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <div className="relative min-w-0 flex-1">
                      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                      <Input
                        id="payment-history-search"
                        type="search"
                        value={paymentFilters.query}
                        onChange={(event) => setPaymentFilters((current) => ({ ...current, query: event.target.value }))}
                        placeholder="ค้นหาจำนวนเงิน วันที่ หรือเลขงวด"
                        aria-label="ค้นหาประวัติการชำระเงิน"
                        className="pl-9"
                      />
                    </div>
                    <span className="text-xs text-muted-foreground" aria-live="polite">
                      แสดง {filteredPayments.length} จาก {payments.length} รายการ
                    </span>
                  </div>

                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_1fr_auto]">
                    <select
                      id="payment-history-status"
                      value={paymentFilters.status}
                      onChange={(event) => setPaymentFilters((current) => ({ ...current, status: event.target.value as PaymentStatusFilter }))}
                      aria-label="กรองสถานะการชำระ"
                      className="h-10 rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      <option value="all">ทุกสถานะ</option>
                      <option value="pending">รอตรวจสอบ</option>
                      <option value="verified">ยืนยันแล้ว</option>
                      <option value="rejected">ปฏิเสธ</option>
                    </select>
                    <select
                      id="payment-history-sort"
                      value={paymentFilters.sortKey}
                      onChange={(event) => setPaymentFilters((current) => ({ ...current, sortKey: event.target.value as PaymentSortKey }))}
                      aria-label="จัดเรียงประวัติการชำระ"
                      className="h-10 rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      <option value="paymentDate">วันที่ชำระ</option>
                      <option value="amountPaid">จำนวนเงิน</option>
                      <option value="status">สถานะ</option>
                      <option value="paymentMethod">ช่องทาง</option>
                    </select>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => setPaymentFilters((current) => ({ ...current, sortDirection: current.sortDirection === "asc" ? "desc" : "asc" }))}
                      className="h-10 gap-2"
                      aria-label={`จัดเรียง${paymentFilters.sortDirection === "asc" ? "จากน้อยไปมาก" : "จากมากไปน้อย"}`}
                    >
                      <ArrowUpDown className="h-4 w-4" />
                      {paymentFilters.sortDirection === "asc" ? "น้อย → มาก" : "มาก → น้อย"}
                    </Button>
                  </div>

                  {(paymentFilters.query || paymentFilters.status !== "all" || paymentFilters.sortKey !== "paymentDate" || paymentFilters.sortDirection !== "desc") && (
                    <Button
                      type="button"
                      variant="ghost"
                      onClick={() => setPaymentFilters({ query: "", status: "all", sortKey: "paymentDate", sortDirection: "desc" })}
                      className="h-8 px-2 text-xs text-muted-foreground"
                    >
                      รีเซ็ตการค้นหาและการจัดเรียง
                    </Button>
                  )}

                  {filteredPayments.length > 0 ? (
                    <div className="space-y-3">
                      {filteredPayments.map((payment) => (
                        <div key={payment.id} className="rounded-xl border border-border p-3">
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <p className="font-medium">฿{Number(payment.amountPaid).toLocaleString("th-TH", { maximumFractionDigits: 2 })}</p>
                              <p className="text-xs text-muted-foreground">{new Date(payment.paymentDate).toLocaleDateString("th-TH")}{payment.scheduleId ? ` · งวดที่ ${payment.scheduleId}` : ""}</p>
                              <p className="mt-1 text-xs text-muted-foreground">ช่องทาง: {payment.paymentMethod}</p>
                            </div>
                            <span className="rounded-full bg-muted px-2 py-1 text-xs">{getPaymentStatusLabel(payment.status)}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">ไม่พบรายการที่ตรงกับตัวกรอง</div>
                  )}
                </div>
              ) : <div className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">ยังไม่มีประวัติการชำระ</div>}
            </CardContent>
          </Card>
        </div>
      </div>
    </DashboardLayout>
  );
}
