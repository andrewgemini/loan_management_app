import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  ArrowRight,
  BarChart3,
  BellRing,
  FilePlus2,
  Loader2,
  Lock,
  ShieldCheck,
  UserCheck,
  UserCog,
  WalletCards,
  type LucideIcon,
} from "lucide-react";
import { APP_LOGO, APP_TITLE, getLoginUrl } from "@/const";
import { Link } from "wouter";
import { useState } from "react";
import { toast } from "sonner";

const featureCards: Array<{ Icon: LucideIcon; title: string; detail: string }> = [
  { Icon: FilePlus2, title: "คำขอกู้", detail: "สร้างและติดตามคำขอ" },
  { Icon: WalletCards, title: "สัญญา", detail: "ดูตารางผ่อนชำระ" },
  { Icon: BarChart3, title: "รายงาน", detail: "ส่งออก CSV และ PDF" },
  { Icon: ShieldCheck, title: "การควบคุม", detail: "ตรวจสอบการชำระเงิน" },
];

export default function Home() {
  const { user, loading, isAuthenticated } = useAuth();
  const [loggingIn, setLoggingIn] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);

  if (loading) {
    return (
      <div className="grid min-h-screen place-items-center">
        <Loader2 className="h-7 w-7 animate-spin text-primary" />
      </div>
    );
  }

  const primaryPath = user?.role === "admin" ? "/admin" : "/dashboard";

  const handleDevLogin = async (role: "admin" | "lender" | "borrower") => {
    try {
      setLoggingIn(true);
      const res = await fetch("/api/auth/dev-login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role }),
      });
      if (res.ok) {
        toast.success(`เข้าสู่ระบบในฐานะ ${role} สำเร็จ`);
        window.location.href = role === "admin" ? "/admin" : "/dashboard";
      } else {
        toast.error("เข้าสู่ระบบไม่สำเร็จ โปรดตรวจสอบการเชื่อมต่อฐานข้อมูล");
      }
    } catch (err) {
      console.error(err);
      toast.error("เกิดข้อผิดพลาดในการเข้าสู่ระบบ");
    } finally {
      setLoggingIn(false);
      setDialogOpen(false);
    }
  };

  const handleOAuthSignIn = () => {
    const loginUrl = getLoginUrl();
    if (loginUrl === "/" || !loginUrl) {
      setDialogOpen(true);
    } else {
      window.location.href = loginUrl;
    }
  };

  return (
    <div className="min-h-screen overflow-hidden px-4 py-5 sm:px-8">
      <header className="glass-panel mx-auto flex max-w-6xl items-center justify-between rounded-2xl px-4 py-3 sm:px-6">
        <div className="flex items-center gap-3">
          <img
            src={APP_LOGO}
            alt={APP_TITLE}
            className="h-10 w-10 rounded-xl object-cover ring-1 ring-primary/20"
          />
          <span className="font-semibold tracking-tight">{APP_TITLE}</span>
        </div>
        <div className="flex items-center gap-2">
          {isAuthenticated ? (
            <Link href={primaryPath}>
              <Button size="sm" className="gap-2">
                เข้าสู่ระบบงาน <ArrowRight className="h-4 w-4" />
              </Button>
            </Link>
          ) : (
            <>
              <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
                <DialogTrigger asChild>
                  <Button size="sm" variant="outline" className="gap-1.5">
                    <UserCheck className="h-4 w-4 text-primary" />
                    เลือกบัญชีทดสอบ
                  </Button>
                </DialogTrigger>
                <DialogContent className="sm:max-w-md">
                  <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                      <Lock className="h-5 w-5 text-primary" />
                      เข้าสู่ระบบเพื่อใช้งาน / ทดสอบ
                    </DialogTitle>
                    <DialogDescription>
                      เลือกระดับสิทธิ์ที่ต้องการใช้งานสำหรับสภาพแวดล้อม Local และ Standalone
                    </DialogDescription>
                  </DialogHeader>
                  <div className="grid gap-3 py-4">
                    <Button
                      variant="outline"
                      className="justify-start gap-3 h-14 border-primary/30 hover:border-primary hover:bg-primary/5"
                      onClick={() => handleDevLogin("admin")}
                      disabled={loggingIn}
                    >
                      <UserCog className="h-6 w-6 text-primary" />
                      <div className="text-left">
                        <div className="font-medium text-foreground">ผู้ดูแลระบบ (Admin)</div>
                        <div className="text-xs text-muted-foreground">
                          จัดการผู้ใช้ สัญญา อนุมัติการชำระเงิน และดูรายงานภาพรวม
                        </div>
                      </div>
                    </Button>
                    <Button
                      variant="outline"
                      className="justify-start gap-3 h-14 border-blue-500/30 hover:border-blue-500 hover:bg-blue-500/5"
                      onClick={() => handleDevLogin("lender")}
                      disabled={loggingIn}
                    >
                      <ShieldCheck className="h-6 w-6 text-blue-500" />
                      <div className="text-left">
                        <div className="font-medium text-foreground">ผู้ให้กู้ (Lender)</div>
                        <div className="text-xs text-muted-foreground">
                          ตรวจสอบคำขอกู้ อนุมัติสัญญา และตรวจสอบสลิปการชำระเงิน
                        </div>
                      </div>
                    </Button>
                    <Button
                      variant="outline"
                      className="justify-start gap-3 h-14 border-emerald-500/30 hover:border-emerald-500 hover:bg-emerald-500/5"
                      onClick={() => handleDevLogin("borrower")}
                      disabled={loggingIn}
                    >
                      <WalletCards className="h-6 w-6 text-emerald-500" />
                      <div className="text-left">
                        <div className="font-medium text-foreground">ผู้กู้ (Borrower)</div>
                        <div className="text-xs text-muted-foreground">
                          ยื่นขอสินเชื่อ ดูตารางผ่อนชำระ และอัปโหลดสลิป PromptPay
                        </div>
                      </div>
                    </Button>
                  </div>
                </DialogContent>
              </Dialog>
              <Button size="sm" onClick={handleOAuthSignIn}>
                เข้าสู่ระบบ
              </Button>
            </>
          )}
        </div>
      </header>

      <main className="mx-auto grid max-w-6xl gap-10 py-16 lg:grid-cols-[1.15fr_.85fr] lg:items-center lg:py-24">
        <section>
          <p className="mb-4 inline-flex rounded-full border border-primary/20 bg-primary/10 px-3 py-1 text-sm font-medium text-primary">
            ระบบสินเชื่อที่จัดการได้อย่างเป็นระบบ
          </p>
          <h1 className="max-w-3xl text-4xl font-bold leading-tight tracking-tight sm:text-6xl">
            วางแผนสัญญา <span className="text-primary">ติดตามการผ่อน</span> และตัดสินใจได้อย่างมั่นใจ
          </h1>
          <p className="mt-6 max-w-2xl text-lg leading-8 text-muted-foreground">
            จัดการคำขอกู้ สัญญา ตารางผ่อนชำระ หลักฐานการชำระเงิน และรายงานเชิงลึกในพื้นที่ทำงานเดียวที่ออกแบบสำหรับผู้กู้ ผู้ให้กู้ และผู้ดูแลระบบ
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            {isAuthenticated ? (
              <Link href={primaryPath}>
                <Button size="lg" className="gap-2">
                  ไปที่แดชบอร์ด <ArrowRight className="h-4 w-4" />
                </Button>
              </Link>
            ) : (
              <>
                <Button size="lg" onClick={() => setDialogOpen(true)} className="gap-2">
                  เริ่มใช้งานระบบ <ArrowRight className="h-4 w-4" />
                </Button>
                <Button size="lg" variant="outline" onClick={handleOAuthSignIn}>
                  OAuth Login
                </Button>
              </>
            )}
          </div>
        </section>

        <section className="glass-panel rounded-3xl p-6 shadow-2xl shadow-blue-950/10 sm:p-8">
          <div className="rounded-2xl bg-gradient-to-br from-primary to-blue-700 p-6 text-primary-foreground">
            <p className="text-sm opacity-80">พื้นที่ทำงานของคุณ</p>
            <p className="mt-2 text-2xl font-semibold">
              {isAuthenticated ? `สวัสดี ${user?.name || "ผู้ใช้งาน"}` : "พร้อมเริ่มต้นการจัดการเงินกู้"}
            </p>
            <p className="mt-3 text-sm leading-6 opacity-90">
              เข้าถึงข้อมูลตามสิทธิ์ของคุณ พร้อมเครื่องมือรายงานและการติดตามงานที่ชัดเจน
            </p>
          </div>
          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            {featureCards.map(({ Icon, title, detail }) => (
              <div
                key={title}
                className="rounded-xl border border-border/70 bg-background/50 p-4 transition-all hover:bg-background/80"
              >
                <Icon className="h-5 w-5 text-primary" />
                <p className="mt-3 font-medium">{title}</p>
                <p className="mt-1 text-sm text-muted-foreground">{detail}</p>
              </div>
            ))}
          </div>
        </section>
      </main>

      <section className="mx-auto grid max-w-6xl gap-4 pb-10 md:grid-cols-3">
        <div className="glass-panel rounded-2xl p-5">
          <BellRing className="h-5 w-5 text-primary" />
          <h2 className="mt-3 font-semibold">แจ้งเตือนอย่างตรงเวลา</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            ตั้งค่าช่องทางและติดตามกำหนดชำระได้จากบัญชีของคุณ
          </p>
        </div>
        <div className="glass-panel rounded-2xl p-5">
          <BarChart3 className="h-5 w-5 text-primary" />
          <h2 className="mt-3 font-semibold">รายงานที่นำไปใช้ต่อได้</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            กรองช่วงวันที่ แล้วส่งออกข้อมูลเชิงลึกได้ตามสิทธิ์
          </p>
        </div>
        <div className="glass-panel rounded-2xl p-5">
          <ShieldCheck className="h-5 w-5 text-primary" />
          <h2 className="mt-3 font-semibold">สิทธิ์ตามบทบาท</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            แยก workflow สำหรับผู้กู้ ผู้ให้กู้ และผู้ดูแลระบบอย่างชัดเจน
          </p>
        </div>
      </section>
    </div>
  );
}
