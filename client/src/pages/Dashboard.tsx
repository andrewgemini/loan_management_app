import { useAuth } from "@/_core/hooks/useAuth";
import DashboardLayout from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { trpc } from "@/lib/trpc";
import { Link, useLocation } from "wouter";
import NotificationSettings from "@/pages/NotificationSettings";
import { TrendingUp, DollarSign, Calendar, AlertCircle } from "lucide-react";

export default function Dashboard() {
  const { user } = useAuth();
  const [location] = useLocation();
  const showNotificationSettings = location.includes("?section=notifications") || location.includes("?section=settings");
  const { data: myLoans, isLoading: loansLoading } = trpc.loan.getMyLoans.useQuery(undefined, { enabled: Boolean(user) });
  const { data: notifications } = trpc.loan.getNotifications.useQuery(undefined, { enabled: Boolean(user) });

  if (!user) return <DashboardLayout><div /></DashboardLayout>;
  if (showNotificationSettings) return <DashboardLayout><NotificationSettings embedded /></DashboardLayout>;

  const unreadNotifications = notifications?.filter((n) => !n.isRead) || [];
  const totalLoans = myLoans?.length || 0;
  const totalOutstanding = myLoans?.reduce((sum, loan) => {
    const paid = parseFloat(loan.totalPaid || "0");
    const principal = parseFloat(loan.principalAmount);
    return sum + (principal - paid);
  }, 0) || 0;

  return (
    <DashboardLayout>
      <div className="space-y-8">
        {/* Header */}
        <div className="space-y-2">
          <h1 className="text-3xl font-bold text-foreground">
            ยินดีต้อนรับ, {user.name || "ผู้ใช้"}
          </h1>
          <p className="text-muted-foreground">
            {user.role === "borrower" && "ดูข้อมูลสัญญาเงินกู้และประวัติการชำระเงินของคุณ"}
            {user.role === "lender" && "จัดการคำขอกู้และประวัติการชำระเงิน"}
            {user.role === "admin" && "จัดการระบบและดูสถิติทั้งหมด"}
          </p>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card className="p-6 border border-border rounded-lg shadow-sm">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">สัญญาทั้งหมด</p>
                <p className="text-3xl font-bold text-accent">{totalLoans}</p>
              </div>
              <DollarSign className="w-8 h-8 text-accent opacity-50" />
            </div>
          </Card>

          <Card className="p-6 border border-border rounded-lg shadow-sm">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">ยอดคงค้าง</p>
                <p className="text-3xl font-bold text-accent">
                  ฿{totalOutstanding.toLocaleString("th-TH", { maximumFractionDigits: 2 })}
                </p>
              </div>
              <TrendingUp className="w-8 h-8 text-accent opacity-50" />
            </div>
          </Card>

          <Card className="p-6 border border-border rounded-lg shadow-sm">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">แจ้งเตือนใหม่</p>
                <p className="text-3xl font-bold text-accent">{unreadNotifications.length}</p>
              </div>
              <AlertCircle className="w-8 h-8 text-accent opacity-50" />
            </div>
          </Card>

          <Card className="p-6 border border-border rounded-lg shadow-sm">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">บัญชีของคุณ</p>
                <p className="text-lg font-semibold text-accent capitalize">{user.role}</p>
              </div>
              <Calendar className="w-8 h-8 text-accent opacity-50" />
            </div>
          </Card>
        </div>

        {/* Main Content */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Loans Section */}
          <div className="lg:col-span-2 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-2xl font-bold">สัญญาเงินกู้ของคุณ</h2>
              {user.role === "borrower" && (
                <Link href="/loan/create">
                  <Button className="gradient-accent">+ สร้างคำขอกู้</Button>
                </Link>
              )}
            </div>

            {loansLoading ? (
              <div className="space-y-3">
                {[1, 2, 3].map((i) => (
                  <Card key={i} className="h-24 animate-pulse border border-border rounded-lg" />
                ))}
              </div>
            ) : myLoans && myLoans.length > 0 ? (
              <div className="space-y-3">
                {myLoans.map((loan) => {
                  const principal = parseFloat(loan.principalAmount);
                  const paid = parseFloat(loan.totalPaid || "0");
                  const remaining = principal - paid;
                  const progress = (paid / principal) * 100;

                  return (
                    <Link key={loan.id} href={`/loan/${loan.id}`}>
                      <Card className="p-4 hover:shadow-lg transition-shadow cursor-pointer border border-border rounded-lg">
                        <div className="space-y-3">
                          <div className="flex items-center justify-between">
                            <h3 className="font-semibold">
                              สัญญาเงินกู้ #{loan.id}
                            </h3>
                            <span className={`text-sm font-medium px-3 py-1 rounded-full ${
                              loan.isClosed
                                ? "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-100"
                                : "bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-100"
                            }`}>
                              {loan.isClosed ? "ปิดแล้ว" : "กำลังดำเนิน"}
                            </span>
                          </div>
                          <div className="flex items-center justify-between text-sm">
                            <span className="text-muted-foreground">
                              เงินต้น: ฿{principal.toLocaleString("th-TH", { maximumFractionDigits: 2 })}
                            </span>
                            <span className="text-accent font-medium">
                              คงค้าง: ฿{remaining.toLocaleString("th-TH", { maximumFractionDigits: 2 })}
                            </span>
                          </div>
                          <div className="w-full bg-muted rounded-full h-2">
                            <div
                              className="bg-gradient-to-r from-emerald-400 to-green-600 h-2 rounded-full transition-all"
                              style={{ width: `${progress}%` }}
                            />
                          </div>
                          <div className="text-xs text-muted-foreground">
                            ชำระแล้ว {progress.toFixed(1)}% • ครบกำหนด: {new Date(loan.nextPaymentDate).toLocaleDateString("th-TH")}
                          </div>
                        </div>
                      </Card>
                    </Link>
                  );
                })}
              </div>
            ) : (
              <Card className="p-8 text-center border border-border rounded-lg">
                <p className="text-muted-foreground mb-4">ยังไม่มีสัญญาเงินกู้</p>
                {user.role === "borrower" && (
                  <Link href="/loan/create">
                    <Button className="gradient-accent">สร้างคำขอกู้ใหม่</Button>
                  </Link>
                )}
              </Card>
            )}
          </div>

          {/* Notifications Section */}
          <div className="space-y-4">
            <h2 className="text-2xl font-bold">แจ้งเตือน</h2>
            {notifications && notifications.length > 0 ? (
              <div className="space-y-3">
                {notifications.slice(0, 5).map((notif) => (
                  <Card
                    key={notif.id}
                    className={`p-4 border border-border rounded-lg ${!notif.isRead ? "border-accent border-l-4" : ""}`}
                  >
                    <div className="space-y-2">
                      <div className="flex items-start justify-between">
                        <span className="text-xs font-medium text-accent uppercase">
                          {notif.type === "payment_due" && "ครบกำหนดชำระ"}
                          {notif.type === "loan_status" && "สถานะสัญญา"}
                          {notif.type === "payment_verified" && "ตรวจสอบแล้ว"}
                          {notif.type === "loan_approved" && "อนุมัติแล้ว"}
                          {notif.type === "loan_rejected" && "ปฏิเสธ"}
                        </span>
                        {!notif.isRead && (
                          <div className="w-2 h-2 rounded-full bg-accent" />
                        )}
                      </div>
                      <p className="text-sm text-foreground">{notif.message}</p>
                      <p className="text-xs text-muted-foreground">
                        {new Date(notif.createdAt).toLocaleDateString("th-TH")}
                      </p>
                    </div>
                  </Card>
                ))}
              </div>
            ) : (
              <Card className="p-6 text-center border border-border rounded-lg">
                <p className="text-muted-foreground text-sm">ไม่มีแจ้งเตือน</p>
              </Card>
            )}
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
