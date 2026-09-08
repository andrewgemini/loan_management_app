import React, { useEffect, useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { AlertCircle, CheckCircle2, Clock3, Info, Mail, MessageCircle, RefreshCw, RotateCcw, Save, Settings2, ShieldCheck } from "lucide-react";

export default function NotificationSettings() {
  const [isSaving, setIsSaving] = useState(false);
  const [lineToken, setLineToken] = useState("");
  const [settingsError, setSettingsError] = useState<string | null>(null);

  const { data: lineStatus, refetch: refetchLineStatus } =
    trpc.lineNotify.getLineNotifyStatus.useQuery();
  const connectLineMutation = trpc.lineNotify.connectLineNotify.useMutation();
  const disconnectLineMutation = trpc.lineNotify.disconnectLineNotify.useMutation();
  const testLineMutation = trpc.lineNotify.sendTestMessage.useMutation();

  // Fetch preferences
  const { data: preferences, isLoading: isLoadingPrefs, isError: isPreferencesError, error: preferencesError, refetch } = trpc.notificationPreferences.getPreferences.useQuery();
  const { data: auditLogs = [], isLoading: isLoadingAudit, refetch: refetchAuditLogs } = trpc.notificationPreferences.getAuditLogs.useQuery({ limit: 6 });

  // Update preferences mutation
  const updateMutation = trpc.notificationPreferences.updatePreferences.useMutation({
    onSuccess: () => {
      toast.success("บันทึกการตั้งค่าสำเร็จ");
      setSettingsError(null);
      refetch();
      refetchAuditLogs();
      setIsSaving(false);
    },
    onError: (error) => {
      toast.error(`เกิดข้อผิดพลาด: ${error.message}`);
      setSettingsError(error.message || "ไม่สามารถบันทึกการตั้งค่าได้ กรุณาลองใหม่อีกครั้ง");
      setIsSaving(false);
    },
  });

  // Reset mutation
  const resetMutation = trpc.notificationPreferences.resetToDefaults.useMutation({
    onSuccess: () => {
      toast.success("รีเซ็ตการตั้งค่าสำเร็จ");
      setSettingsError(null);
      refetch();
      refetchAuditLogs();
    },
    onError: (error) => {
      toast.error(`เกิดข้อผิดพลาด: ${error.message}`);
      setSettingsError(error.message || "ไม่สามารถรีเซ็ตการตั้งค่าได้ กรุณาลองใหม่อีกครั้ง");
    },
  });

  const [emailSettings, setEmailSettings] = useState({
    emailNewLoanRequest: true,
    emailLoanApproval: true,
    emailLoanRejection: true,
    emailPaymentReminder: true,
    emailPaymentConfirmation: true,
  });

  const [lineSettings, setLineSettings] = useState({
    lineNewLoanRequest: true,
    lineLoanApproval: true,
    lineLoanRejection: true,
    linePaymentReminder: true,
    linePaymentConfirmation: true,
  });

  useEffect(() => {
    if (preferences) {
      setEmailSettings({
        emailNewLoanRequest: preferences.emailNewLoanRequest,
        emailLoanApproval: preferences.emailLoanApproval,
        emailLoanRejection: preferences.emailLoanRejection,
        emailPaymentReminder: preferences.emailPaymentReminder,
        emailPaymentConfirmation: preferences.emailPaymentConfirmation,
      });

      setLineSettings({
        lineNewLoanRequest: preferences.lineNewLoanRequest,
        lineLoanApproval: preferences.lineLoanApproval,
        lineLoanRejection: preferences.lineLoanRejection,
        linePaymentReminder: preferences.linePaymentReminder,
        linePaymentConfirmation: preferences.linePaymentConfirmation,
      });
    }
  }, [preferences]);

  const handleEmailChange = (key: keyof typeof emailSettings, value: boolean) => {
    setEmailSettings((prev) => ({ ...prev, [key]: value }));
  };

  const handleLineChange = (key: keyof typeof lineSettings, value: boolean) => {
    setLineSettings((prev) => ({ ...prev, [key]: value }));
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await updateMutation.mutateAsync({ ...emailSettings, ...lineSettings });
    } catch {
      // onError keeps the selected settings intact and exposes a retry action.
    } finally {
      setIsSaving(false);
    }
  };

  const handleReset = async () => {
    if (window.confirm("คุณแน่ใจหรือไม่ว่าต้องการรีเซ็ตการตั้งค่าทั้งหมดเป็นค่าเริ่มต้น?")) {
      try {
        await resetMutation.mutateAsync();
      } catch {
        // Preserve the current client state if the reset request fails.
      }
    }
  };

  const handleConnectLine = async () => {
    const accessToken = lineToken.trim();
    if (!accessToken) {
      toast.error("กรุณาระบุ LINE Notify access token");
      return;
    }

    try {
      await connectLineMutation.mutateAsync({ accessToken });
      setLineToken("");
      await refetchLineStatus();
      toast.success("เชื่อมต่อ LINE Notify สำเร็จ");
    } catch {
      toast.error("เชื่อมต่อ LINE Notify ไม่สำเร็จ กรุณาตรวจสอบ token");
    }
  };

  const handleDisconnectLine = async () => {
    if (!window.confirm("ต้องการยกเลิกการเชื่อมต่อ LINE Notify ใช่หรือไม่?")) return;

    try {
      await disconnectLineMutation.mutateAsync();
      await refetchLineStatus();
      toast.success("ยกเลิกการเชื่อมต่อ LINE Notify แล้ว");
    } catch {
      toast.error("ยกเลิกการเชื่อมต่อไม่สำเร็จ");
    }
  };

  const handleTestLine = async () => {
    try {
      await testLineMutation.mutateAsync();
      toast.success("ส่งข้อความทดสอบไปยัง LINE แล้ว");
    } catch {
      toast.error("ส่งข้อความทดสอบไม่สำเร็จ");
    }
  };

  if (isLoadingPrefs) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-cyan-50 p-4 md:p-8" role="status" aria-live="polite" aria-busy="true">
        <div className="mx-auto max-w-4xl space-y-6 animate-pulse">
          <div className="h-10 w-72 rounded-xl bg-blue-100" />
          {[1, 2, 3].map((card) => <div key={card} className="h-64 rounded-2xl border border-white/60 bg-white/70 shadow-sm" />)}
          <p className="text-center text-sm text-muted-foreground">กำลังโหลดการตั้งค่าการแจ้งเตือน...</p>
        </div>
      </div>
    );
  }

  if (isPreferencesError) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-slate-50 via-blue-50 to-cyan-50 p-4">
        <Card className="w-full max-w-lg border-amber-200 bg-white/90 shadow-xl"><CardContent className="space-y-4 p-7 text-center" role="alert">
          <AlertCircle className="mx-auto h-10 w-10 text-amber-600" aria-hidden="true" />
          <h1 className="text-lg font-semibold">ไม่สามารถโหลดการตั้งค่าการแจ้งเตือนได้</h1>
          <p className="text-sm text-muted-foreground">{preferencesError?.message || "กรุณาตรวจสอบการเชื่อมต่อแล้วลองใหม่อีกครั้ง"}</p>
          <Button onClick={() => refetch()} className="gap-2"><RefreshCw className="h-4 w-4" aria-hidden="true" />ลองโหลดอีกครั้ง</Button>
        </CardContent></Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-cyan-50 p-4 md:p-8">
      <div className="max-w-4xl mx-auto">
        <div className="mb-8 flex items-start gap-3">
          <Settings2 className="mt-1 h-8 w-8 shrink-0 text-blue-600" aria-hidden="true" />
          <div>
          <h1 className="text-3xl font-bold text-gray-900 mb-2">การตั้งค่าการแจ้งเตือน</h1>
          <p className="text-gray-600">จัดการวิธีการรับแจ้งเตือนของคุณผ่านช่องทางต่างๆ</p>
          </div>
        </div>

        {settingsError && <div className="mb-6 flex flex-col gap-3 rounded-xl border border-rose-200 bg-rose-50 p-4 text-rose-900 sm:flex-row sm:items-center sm:justify-between" role="alert"><div className="flex gap-3"><AlertCircle className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" /><p className="text-sm">บันทึกการตั้งค่าไม่สำเร็จ: {settingsError}</p></div><Button type="button" variant="outline" size="sm" className="border-rose-200 bg-white" onClick={() => void handleSave()} disabled={isSaving || updateMutation.isPending}><RefreshCw className="mr-2 h-4 w-4" aria-hidden="true" />ลองบันทึกอีกครั้ง</Button></div>}

        {/* Email Notifications */}
        <Card className="mb-6 border-0 shadow-lg">
          <CardHeader className="bg-gradient-to-r from-blue-50 to-blue-100 border-b">
            <div className="flex items-center gap-3">
              <Mail className="w-6 h-6 text-blue-600" />
              <div>
                <CardTitle>การแจ้งเตือนผ่านอีเมล</CardTitle>
                <CardDescription>เลือกประเภทการแจ้งเตือนที่ต้องการรับทางอีเมล</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="pt-6 space-y-4">
            <div className="flex items-center space-x-3 p-3 hover:bg-gray-50 rounded-lg transition">
              <Checkbox
                id="emailNewLoanRequest"
                checked={emailSettings.emailNewLoanRequest}
                onCheckedChange={(checked) =>
                  handleEmailChange("emailNewLoanRequest", checked as boolean)
                }
              />
              <label htmlFor="emailNewLoanRequest" className="flex-1 cursor-pointer">
                <p className="font-medium text-gray-900">คำขอกู้ใหม่</p>
                <p className="text-sm text-gray-500">รับแจ้งเตือนเมื่อมีคำขอกู้ใหม่เข้ามา</p>
              </label>
            </div>

            <div className="flex items-center space-x-3 p-3 hover:bg-gray-50 rounded-lg transition">
              <Checkbox
                id="emailLoanApproval"
                checked={emailSettings.emailLoanApproval}
                onCheckedChange={(checked) =>
                  handleEmailChange("emailLoanApproval", checked as boolean)
                }
              />
              <label htmlFor="emailLoanApproval" className="flex-1 cursor-pointer">
                <p className="font-medium text-gray-900">การอนุมัติเงินกู้</p>
                <p className="text-sm text-gray-500">รับแจ้งเตือนเมื่อเงินกู้ได้รับการอนุมัติ</p>
              </label>
            </div>

            <div className="flex items-center space-x-3 p-3 hover:bg-gray-50 rounded-lg transition">
              <Checkbox
                id="emailLoanRejection"
                checked={emailSettings.emailLoanRejection}
                onCheckedChange={(checked) =>
                  handleEmailChange("emailLoanRejection", checked as boolean)
                }
              />
              <label htmlFor="emailLoanRejection" className="flex-1 cursor-pointer">
                <p className="font-medium text-gray-900">การปฏิเสธเงินกู้</p>
                <p className="text-sm text-gray-500">รับแจ้งเตือนเมื่อคำขอกู้ถูกปฏิเสธ</p>
              </label>
            </div>

            <div className="flex items-center space-x-3 p-3 hover:bg-gray-50 rounded-lg transition">
              <Checkbox
                id="emailPaymentReminder"
                checked={emailSettings.emailPaymentReminder}
                onCheckedChange={(checked) =>
                  handleEmailChange("emailPaymentReminder", checked as boolean)
                }
              />
              <label htmlFor="emailPaymentReminder" className="flex-1 cursor-pointer">
                <p className="font-medium text-gray-900">เตือนการชำระเงิน</p>
                <p className="text-sm text-gray-500">รับแจ้งเตือนก่อนวันครบกำหนดชำระ</p>
              </label>
            </div>

            <div className="flex items-center space-x-3 p-3 hover:bg-gray-50 rounded-lg transition">
              <Checkbox
                id="emailPaymentConfirmation"
                checked={emailSettings.emailPaymentConfirmation}
                onCheckedChange={(checked) =>
                  handleEmailChange("emailPaymentConfirmation", checked as boolean)
                }
              />
              <label htmlFor="emailPaymentConfirmation" className="flex-1 cursor-pointer">
                <p className="font-medium text-gray-900">ยืนยันการชำระเงิน</p>
                <p className="text-sm text-gray-500">รับแจ้งเตือนเมื่อการชำระเงินได้รับการยืนยัน</p>
              </label>
            </div>
          </CardContent>
        </Card>

        {/* LINE Notifications */}
        <Card className="mb-6 border-0 shadow-lg">
          <CardHeader className="bg-gradient-to-r from-green-50 to-emerald-100 border-b">
            <div className="flex items-center gap-3">
              <MessageCircle className="w-6 h-6 text-green-600" />
              <div>
                <CardTitle>การแจ้งเตือนผ่าน LINE Notify</CardTitle>
                <CardDescription>เลือกประเภทการแจ้งเตือนที่ต้องการรับผ่าน LINE</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="pt-6 space-y-4">
            <div className="flex items-center space-x-3 p-3 hover:bg-gray-50 rounded-lg transition">
              <Checkbox
                id="lineNewLoanRequest"
                checked={lineSettings.lineNewLoanRequest}
                onCheckedChange={(checked) =>
                  handleLineChange("lineNewLoanRequest", checked as boolean)
                }
              />
              <label htmlFor="lineNewLoanRequest" className="flex-1 cursor-pointer">
                <p className="font-medium text-gray-900">คำขอกู้ใหม่</p>
                <p className="text-sm text-gray-500">รับแจ้งเตือนเมื่อมีคำขอกู้ใหม่เข้ามา</p>
              </label>
            </div>

            <div className="flex items-center space-x-3 p-3 hover:bg-gray-50 rounded-lg transition">
              <Checkbox
                id="lineLoanApproval"
                checked={lineSettings.lineLoanApproval}
                onCheckedChange={(checked) =>
                  handleLineChange("lineLoanApproval", checked as boolean)
                }
              />
              <label htmlFor="lineLoanApproval" className="flex-1 cursor-pointer">
                <p className="font-medium text-gray-900">การอนุมัติเงินกู้</p>
                <p className="text-sm text-gray-500">รับแจ้งเตือนเมื่อเงินกู้ได้รับการอนุมัติ</p>
              </label>
            </div>

            <div className="flex items-center space-x-3 p-3 hover:bg-gray-50 rounded-lg transition">
              <Checkbox
                id="lineLoanRejection"
                checked={lineSettings.lineLoanRejection}
                onCheckedChange={(checked) =>
                  handleLineChange("lineLoanRejection", checked as boolean)
                }
              />
              <label htmlFor="lineLoanRejection" className="flex-1 cursor-pointer">
                <p className="font-medium text-gray-900">การปฏิเสธเงินกู้</p>
                <p className="text-sm text-gray-500">รับแจ้งเตือนเมื่อคำขอกู้ถูกปฏิเสธ</p>
              </label>
            </div>

            <div className="flex items-center space-x-3 p-3 hover:bg-gray-50 rounded-lg transition">
              <Checkbox
                id="linePaymentReminder"
                checked={lineSettings.linePaymentReminder}
                onCheckedChange={(checked) =>
                  handleLineChange("linePaymentReminder", checked as boolean)
                }
              />
              <label htmlFor="linePaymentReminder" className="flex-1 cursor-pointer">
                <p className="font-medium text-gray-900">เตือนการชำระเงิน</p>
                <p className="text-sm text-gray-500">รับแจ้งเตือนก่อนวันครบกำหนดชำระ</p>
              </label>
            </div>

            <div className="flex items-center space-x-3 p-3 hover:bg-gray-50 rounded-lg transition">
              <Checkbox
                id="linePaymentConfirmation"
                checked={lineSettings.linePaymentConfirmation}
                onCheckedChange={(checked) =>
                  handleLineChange("linePaymentConfirmation", checked as boolean)
                }
              />
              <label htmlFor="linePaymentConfirmation" className="flex-1 cursor-pointer">
                <p className="font-medium text-gray-900">ยืนยันการชำระเงิน</p>
                <p className="text-sm text-gray-500">รับแจ้งเตือนเมื่อการชำระเงินได้รับการยืนยัน</p>
              </label>
            </div>
          </CardContent>
        </Card>

        {/* LINE Notify Connection */}
        <Card className="mb-6 border-0 shadow-lg">
          <CardHeader className="bg-gradient-to-r from-emerald-50 to-green-100 border-b">
            <div className="flex items-center gap-3">
              <CheckCircle2 className="w-6 h-6 text-emerald-600" />
              <div>
                <CardTitle>การเชื่อมต่อ LINE Notify</CardTitle>
                <CardDescription>
                  เชื่อมต่อ token เพื่อรับการแจ้งเตือนตามตัวเลือกด้านบน
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="pt-6 space-y-4">
            {lineStatus?.connected ? (
              <div className="flex flex-col gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="font-medium text-emerald-900">เชื่อมต่อแล้ว</p>
                  <p className="text-sm text-emerald-700">
                    ระบบพร้อมส่งแจ้งเตือนไปยัง LINE Notify ของคุณ
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button
                    variant="outline"
                    onClick={handleTestLine}
                    disabled={testLineMutation.isPending}
                  >
                    {testLineMutation.isPending ? "กำลังส่ง..." : "ส่งข้อความทดสอบ"}
                  </Button>
                  <Button
                    variant="outline"
                    onClick={handleDisconnectLine}
                    disabled={disconnectLineMutation.isPending}
                    className="text-red-600 hover:text-red-700"
                  >
                    ยกเลิกการเชื่อมต่อ
                  </Button>
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                <label htmlFor="lineAccessToken" className="text-sm font-medium text-gray-900">
                  LINE Notify access token
                </label>
                <div className="flex flex-col gap-2 sm:flex-row">
                  <Input
                    id="lineAccessToken"
                    type="password"
                    value={lineToken}
                    onChange={(event) => setLineToken(event.target.value)}
                    placeholder="วาง access token ของคุณที่นี่"
                    autoComplete="off"
                    className="flex-1"
                  />
                  <Button
                    onClick={handleConnectLine}
                    disabled={connectLineMutation.isPending || !lineToken.trim()}
                    className="bg-green-600 hover:bg-green-700"
                  >
                    {connectLineMutation.isPending ? "กำลังเชื่อมต่อ..." : "เชื่อมต่อ LINE"}
                  </Button>
                </div>
                <p className="text-xs text-gray-500">
                  token จะถูกส่งไปตรวจสอบและจัดเก็บฝั่งเซิร์ฟเวอร์ ไม่แสดงซ้ำในหน้าจอหลังเชื่อมต่อ
                </p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Action Buttons */}
        <div className="flex gap-4 justify-end">
          <Button
            variant="outline"
            onClick={handleReset}
            disabled={isSaving || resetMutation.isPending}
            className="px-6"
          >
            <RotateCcw className="mr-2 h-4 w-4" aria-hidden="true" />รีเซ็ตเป็นค่าเริ่มต้น
          </Button>
          <Button
            onClick={handleSave}
            disabled={isSaving || updateMutation.isPending}
            className="px-6 bg-green-600 hover:bg-green-700"
          >
            {isSaving ? "กำลังบันทึก..." : <><Save className="mr-2 h-4 w-4" aria-hidden="true" />บันทึกการตั้งค่า</>}
          </Button>
        </div>

        <Card className="mt-6 border-0 shadow-lg">
          <CardHeader className="border-b bg-gradient-to-r from-indigo-50 to-blue-100"><div className="flex items-center gap-3"><ShieldCheck className="h-6 w-6 text-indigo-600" aria-hidden="true" /><div><CardTitle>ประวัติการตรวจสอบการตั้งค่า</CardTitle><CardDescription>บันทึกการเปิดดู รีเซ็ต หรือแก้ไข พร้อมชื่อฟิลด์ที่เปลี่ยน โดยไม่เก็บค่า token หรือค่าการตั้งค่า</CardDescription></div></div></CardHeader>
          <CardContent className="space-y-3 pt-5">
            {isLoadingAudit ? <div className="space-y-2" role="status" aria-live="polite">{[1, 2, 3].map((row) => <div key={row} className="h-11 animate-pulse rounded-lg bg-muted" />)}<span className="sr-only">กำลังโหลดประวัติการตรวจสอบ</span></div> : auditLogs.length ? auditLogs.map((log) => <div key={log.id} className="flex gap-3 rounded-xl border border-slate-100 bg-slate-50/70 p-3"><Clock3 className="mt-0.5 h-4 w-4 shrink-0 text-indigo-600" aria-hidden="true" /><div className="min-w-0"><p className="text-sm font-medium">{log.action === "read" ? "เปิดดูการตั้งค่า" : log.action === "reset" ? "รีเซ็ตเป็นค่าเริ่มต้น" : log.action === "line_connected" ? "เชื่อมต่อ LINE Notify" : log.action === "line_disconnected" ? "ยกเลิก LINE Notify" : "แก้ไขการตั้งค่า"}</p><p className="mt-0.5 break-words text-xs text-muted-foreground">{log.changedFields ? `ฟิลด์: ${log.changedFields.split(",").join(", ")}` : "ไม่มีการบันทึกค่าการตั้งค่า"}</p><time className="mt-1 block text-xs text-muted-foreground">{new Date(log.createdAt).toLocaleString("th-TH")}</time></div></div>) : <div className="rounded-xl border border-dashed border-slate-200 p-5 text-center text-sm text-muted-foreground">ยังไม่มีประวัติการตรวจสอบสำหรับบัญชีนี้</div>}
          </CardContent>
        </Card>

        {/* Info Message */}
        <div className="mt-6 p-4 bg-blue-50 border border-blue-200 rounded-lg flex gap-3">
          <AlertCircle className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
          <div>
            <p className="flex items-center gap-2 font-medium text-blue-900"><Info className="h-4 w-4" aria-hidden="true" />ข้อมูลสำคัญ</p>
            <p className="text-sm text-blue-700 mt-1">
              การตั้งค่านี้จะช่วยให้คุณควบคุมวิธีการรับแจ้งเตือนจากระบบ คุณสามารถเปิดหรือปิดการแจ้งเตือนสำหรับแต่ละประเภทได้ตามต้องการ
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
