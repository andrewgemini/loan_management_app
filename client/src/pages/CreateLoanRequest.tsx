import { useAuth } from "@/_core/hooks/useAuth";
import DashboardLayout from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { trpc } from "@/lib/trpc";
import { useLocation } from "wouter";
import { useState } from "react";
import { toast } from "sonner";

export default function CreateLoanRequest() {
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  const [formData, setFormData] = useState({
    amountRequested: "",
    interestRate: "",
    loanTermMonths: "",
    interestType: "simple" as "simple" | "compound",
    paymentType: "fixed" as "fixed" | "reducing",
  });

  const [summary, setSummary] = useState<any>(null);
  const createRequest = trpc.loan.createRequest.useMutation({
    onSuccess: () => {
      toast.success("สร้างคำขอกู้สำเร็จ");
      setLocation("/dashboard");
    },
    onError: (error) => {
      toast.error(error.message || "เกิดข้อผิดพลาด");
    },
  });

  if (!user) {
    return <DashboardLayout><div /></DashboardLayout>;
  }

  if (user.role !== "borrower") {
    return (
      <DashboardLayout>
        <Card className="mx-auto max-w-lg space-y-4 p-8 text-center">
          <h1 className="text-xl font-semibold">สร้างคำขอกู้ได้เฉพาะผู้กู้</h1>
          <p className="text-sm text-muted-foreground">กรุณาเข้าสู่ระบบด้วยบัญชีผู้กู้เพื่อเริ่มสร้างคำขอกู้ใหม่</p>
          <Button className="w-full" onClick={() => setLocation("/dashboard")}>กลับไปแดชบอร์ด</Button>
        </Card>
      </DashboardLayout>
    );
  }

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  const handleSelectChange = (name: string, value: string) => {
    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  const calculateSummary = () => {
    const principal = parseFloat(formData.amountRequested);
    const rate = parseFloat(formData.interestRate);
    const months = parseInt(formData.loanTermMonths);

    if (!principal || !rate || !months) {
      toast.error("กรุณากรอกข้อมูลให้ครบถ้วน");
      return;
    }

    // Simple calculation for preview
    let totalInterest = 0;
    if (formData.interestType === "simple") {
      totalInterest = principal * (rate / 100 / 12) * months;
    } else {
      const monthlyRate = rate / 100 / 12;
      totalInterest = principal * (Math.pow(1 + monthlyRate, months) - 1);
    }

    const monthlyPayment = formData.paymentType === "fixed"
      ? (principal + totalInterest) / months
      : principal / months + (principal * (rate / 100 / 12));

    setSummary({
      principal,
      totalInterest: Math.round(totalInterest * 100) / 100,
      totalPayment: Math.round((principal + totalInterest) * 100) / 100,
      monthlyPayment: Math.round(monthlyPayment * 100) / 100,
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.amountRequested || !formData.interestRate || !formData.loanTermMonths) {
      toast.error("กรุณากรอกข้อมูลให้ครบถ้วน");
      return;
    }

    createRequest.mutate({
      amountRequested: parseFloat(formData.amountRequested),
      interestRate: parseFloat(formData.interestRate),
      loanTermMonths: parseInt(formData.loanTermMonths),
      interestType: formData.interestType,
      paymentType: formData.paymentType,
    });
  };

  return (
    <DashboardLayout>
      <div className="max-w-4xl mx-auto space-y-8">
        <div className="space-y-2">
          <h1 className="text-3xl font-bold">สร้างคำขอกู้ยืมเงิน</h1>
          <p className="text-muted-foreground">
            กรอกข้อมูลรายละเอียดเงินกู้ของคุณ
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Form */}
          <Card className="p-6 lg:col-span-2 border border-border rounded-lg">
            <form onSubmit={handleSubmit} className="space-y-6">
              <div className="space-y-2">
                <Label htmlFor="amountRequested">จำนวนเงินที่ขอกู้ (บาท)</Label>
                  <Input
                    id="amountRequested"
                    name="amountRequested"
                    type="number"
                    placeholder="เช่น 100000"
                    value={formData.amountRequested}
                    onChange={handleChange}
                    className="border border-border rounded-md"
                    min="1000"
                    step="1000"
                  />
              </div>

              <div className="space-y-2">
                <Label htmlFor="interestRate">อัตราดอกเบี้ยต่อปี (%)</Label>
                  <Input
                    id="interestRate"
                    name="interestRate"
                    type="number"
                    placeholder="เช่น 5"
                    value={formData.interestRate}
                    onChange={handleChange}
                    className="border border-border rounded-md"
                    min="0"
                    max="100"
                    step="0.1"
                  />
              </div>

              <div className="space-y-2">
                <Label htmlFor="loanTermMonths">ระยะเวลาผ่อน (เดือน)</Label>
                  <Input
                    id="loanTermMonths"
                    name="loanTermMonths"
                    type="number"
                    placeholder="เช่น 12"
                    value={formData.loanTermMonths}
                    onChange={handleChange}
                    className="border border-border rounded-md"
                    min="1"
                    max="360"
                    step="1"
                  />
              </div>

              <div className="space-y-2">
                <Label htmlFor="interestType">ประเภทดอกเบี้ย</Label>
                <Select value={formData.interestType} onValueChange={(value) => handleSelectChange("interestType", value)}>
                  <SelectTrigger className="border border-border rounded-md">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="simple">Simple Interest (ดอกเบี้ยคงที่)</SelectItem>
                    <SelectItem value="compound">Compound Interest (ดอกเบี้ยทบต้น)</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="paymentType">ประเภทการผ่อนชำระ</Label>
                <Select value={formData.paymentType} onValueChange={(value) => handleSelectChange("paymentType", value)}>
                  <SelectTrigger className="border border-border rounded-md">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="fixed">Fixed Payment (ผ่อนคงที่)</SelectItem>
                    <SelectItem value="reducing">Reducing Balance (ลดต้นลดดอก)</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="flex gap-3">
                <Button
                  type="button"
                  variant="outline"
                  onClick={calculateSummary}
                  className="flex-1"
                >
                  คำนวณสรุป
                </Button>
                <Button
                  type="submit"
                  className="gradient-accent flex-1"
                  disabled={createRequest.isPending}
                >
                  {createRequest.isPending ? "กำลังส่ง..." : "ส่งคำขอ"}
                </Button>
              </div>
            </form>
          </Card>

          {/* Summary */}
          <Card className="p-6 h-fit sticky top-4 border border-border rounded-lg">
            <h3 className="text-lg font-semibold mb-4">สรุปข้อมูล</h3>
            {summary ? (
              <div className="space-y-4">
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">เงินต้น</span>
                    <span className="font-medium">
                      ฿{summary.principal.toLocaleString("th-TH", { maximumFractionDigits: 2 })}
                    </span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">ดอกเบี้ยรวม</span>
                    <span className="font-medium">
                      ฿{summary.totalInterest.toLocaleString("th-TH", { maximumFractionDigits: 2 })}
                    </span>
                  </div>
                  <div className="border-t border-border pt-2 flex justify-between text-sm font-semibold">
                    <span>ยอดชำระรวม</span>
                    <span className="text-accent">
                      ฿{summary.totalPayment.toLocaleString("th-TH", { maximumFractionDigits: 2 })}
                    </span>
                  </div>
                </div>

                <div className="bg-muted/50 rounded-lg p-3">
                  <div className="text-xs text-muted-foreground mb-1">ค่างวดต่อเดือน</div>
                  <div className="text-2xl font-bold text-accent">
                    ฿{summary.monthlyPayment.toLocaleString("th-TH", { maximumFractionDigits: 2 })}
                  </div>
                </div>
              </div>
            ) : (
              <div className="text-center py-8">
                <p className="text-muted-foreground text-sm">
                  กรอกข้อมูลและคลิก "คำนวณสรุป" เพื่อดูรายละเอียด
                </p>
              </div>
            )}
          </Card>
        </div>
      </div>
    </DashboardLayout>
  );
}
