import { useMemo } from "react";
import { Bar, Doughnut } from "react-chartjs-2";
import { BarChart3, ShieldAlert } from "lucide-react";
import { ArcElement, BarElement, CategoryScale, Chart as ChartJS, Legend, LinearScale, Tooltip } from "chart.js";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./ui/card";

ChartJS.register(ArcElement, BarElement, CategoryScale, LinearScale, Tooltip, Legend);

type DailyTrend = { date: string; exportCount: number; exportedRows: number; securityEventCount: number; highSeverityCount: number };
type GovernanceAnalytics = { days: number; daily: DailyTrend[]; severity: { info: number; warning: number; high: number } };

function dateLabel(date: string) {
  return new Date(`${date}T00:00:00`).toLocaleDateString("th-TH", { day: "numeric", month: "short" });
}

export function GovernanceAnalyticsCharts({ analytics, isLoading }: { analytics?: GovernanceAnalytics; isLoading: boolean }) {
  const trendData = useMemo(() => ({
    labels: analytics?.daily.map((item) => dateLabel(item.date)) ?? [],
    datasets: [
      { label: "การส่งออก", data: analytics?.daily.map((item) => item.exportCount) ?? [], backgroundColor: "rgba(37, 99, 235, 0.78)", borderRadius: 8, maxBarThickness: 34 },
      { label: "Security events", data: analytics?.daily.map((item) => item.securityEventCount) ?? [], backgroundColor: "rgba(245, 158, 11, 0.72)", borderRadius: 8, maxBarThickness: 34 },
    ],
  }), [analytics]);
  const severityData = useMemo(() => ({
    labels: ["ข้อมูลทั่วไป", "คำเตือน", "ระดับสูง"],
    datasets: [{ data: analytics ? [analytics.severity.info, analytics.severity.warning, analytics.severity.high] : [], backgroundColor: ["rgba(37, 99, 235, 0.75)", "rgba(245, 158, 11, 0.75)", "rgba(244, 63, 94, 0.78)"], borderWidth: 0 }],
  }), [analytics]);
  const hasTrend = Boolean(analytics?.daily.length);
  const severityTotal = analytics ? analytics.severity.info + analytics.severity.warning + analytics.severity.high : 0;

  return <div className="grid gap-5 lg:grid-cols-[1.45fr_0.85fr]">
    <Card className="glass-panel"><CardHeader><div className="flex gap-3"><BarChart3 className="mt-0.5 h-6 w-6 text-primary" /><div><CardTitle>แนวโน้มการส่งออกและเหตุการณ์</CardTitle><CardDescription>จำนวนการส่งออกและ security events รายวันย้อนหลัง {analytics?.days ?? 30} วัน</CardDescription></div></div></CardHeader><CardContent>{isLoading ? <div className="h-64 animate-pulse rounded-xl bg-muted" role="status" aria-live="polite" aria-busy="true" /> : hasTrend ? <><div className="h-64"><Bar data={trendData} options={{ responsive: true, maintainAspectRatio: false, plugins: { legend: { position: "bottom", labels: { boxWidth: 10, usePointStyle: true } }, tooltip: { displayColors: false } }, scales: { x: { grid: { display: false } }, y: { beginAtZero: true, ticks: { precision: 0 }, grid: { color: "rgba(148, 163, 184, 0.16)" } } } }} /></div><div className="mt-4 grid grid-cols-2 gap-2 text-xs sm:grid-cols-4" aria-label="สรุปแนวโน้มรายวัน">{analytics?.daily.map((item) => <div key={item.date} className="rounded-lg bg-muted/60 p-2"><p className="font-medium">{dateLabel(item.date)}</p><p className="mt-1 text-muted-foreground">ส่งออก {item.exportCount} ครั้ง</p><p className="text-muted-foreground">{item.exportedRows.toLocaleString("th-TH")} แถว</p></div>)}</div></> : <EmptyChart icon={<BarChart3 className="h-8 w-8" />} title="ยังไม่มีแนวโน้มการส่งออก" detail="กราฟจะแสดงเมื่อมีประวัติการส่งออกหรือเหตุการณ์ในช่วงเวลานี้" />}</CardContent></Card>
    <Card className="glass-panel"><CardHeader><div className="flex gap-3"><ShieldAlert className="mt-0.5 h-6 w-6 text-primary" /><div><CardTitle>สัดส่วน Security Events</CardTitle><CardDescription>แยกตามระดับความรุนแรงในช่วงเดียวกัน</CardDescription></div></div></CardHeader><CardContent>{isLoading ? <div className="h-64 animate-pulse rounded-xl bg-muted" role="status" aria-live="polite" aria-busy="true" /> : severityTotal ? <><div className="mx-auto h-56 max-w-xs"><Doughnut data={severityData} options={{ maintainAspectRatio: false, plugins: { legend: { position: "bottom", labels: { boxWidth: 10, usePointStyle: true } }, tooltip: { displayColors: false } }, cutout: "64%" }} /></div><dl className="mt-3 grid grid-cols-3 gap-2 text-center text-xs"><div className="rounded-lg bg-primary/10 p-2"><dt className="text-muted-foreground">ทั่วไป</dt><dd className="mt-1 text-base font-semibold text-primary">{analytics?.severity.info}</dd></div><div className="rounded-lg bg-amber-500/10 p-2"><dt className="text-muted-foreground">คำเตือน</dt><dd className="mt-1 text-base font-semibold text-amber-700 dark:text-amber-300">{analytics?.severity.warning}</dd></div><div className="rounded-lg bg-rose-500/10 p-2"><dt className="text-muted-foreground">ระดับสูง</dt><dd className="mt-1 text-base font-semibold text-rose-700 dark:text-rose-300">{analytics?.severity.high}</dd></div></dl></> : <EmptyChart icon={<ShieldAlert className="h-8 w-8" />} title="ยังไม่มี Security Event" detail="ข้อมูลจะเริ่มแสดงเมื่อมีการขออนุมัติหรือส่งออกรายงาน" />}</CardContent></Card>
  </div>;
}

function EmptyChart({ icon, title, detail }: { icon: React.ReactNode; title: string; detail: string }) {
  return <div className="flex h-64 flex-col items-center justify-center rounded-xl border border-dashed border-border/80 px-6 text-center text-muted-foreground"><div className="text-muted-foreground/60">{icon}</div><p className="mt-3 text-sm font-medium text-foreground">{title}</p><p className="mt-1 text-xs">{detail}</p></div>;
}
