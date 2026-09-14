import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Route, Switch, useLocation } from "wouter";
import { lazy, Suspense } from "react";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import Home from "./pages/Home";
import Dashboard from "./pages/Dashboard";
import CreateLoanRequest from "./pages/CreateLoanRequest";

const LoanDetail = lazy(() => import("./pages/LoanDetail"));
const PaymentPage = lazy(() => import("./pages/PaymentPage"));
const AdminDashboard = lazy(() => import("./pages/AdminDashboard"));
const AdminActivityHistory = lazy(() => import("./pages/AdminActivityHistory"));
const AdminAuditLogs = lazy(() => import("./pages/AdminAuditLogs"));
const ReportGovernance = lazy(() => import("./pages/ReportGovernance"));
const ProfileSettings = lazy(() => import("./pages/ProfileSettings"));

function NotificationSettingsRedirect() {
  const [, navigate] = useLocation();
  useEffect(() => {
    navigate("/dashboard?section=settings", { replace: true });
  }, [navigate]);
  return <RouteLoadingFallback />;
}

function RouteLoadingFallback() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background text-sm text-muted-foreground" role="status" aria-live="polite">
      กำลังโหลดพื้นที่ทำงาน...
    </div>
  );
}

function Router() {
  return (
    <Switch>
      <Route path="/" component={Home} />
      <Route path="/dashboard" component={Dashboard} />
      <Route path="/loan/create" component={CreateLoanRequest} />
      {/* Both payment routes supported for backward compatibility */}
      <Route path="/loan/:id/payment" component={PaymentPage} />
      <Route path="/payment/:id" component={PaymentPage} />
      <Route path="/loan/:id" component={LoanDetail} />
      <Route path="/admin" component={AdminDashboard} />
      <Route path="/admin/activity-history" component={AdminActivityHistory} />
      <Route path="/admin/audit-logs" component={AdminAuditLogs} />
      <Route path="/admin/report-governance" component={ReportGovernance} />
      {/* Legacy URL redirects into the main dashboard settings section. */}
      <Route path="/settings/notifications" component={NotificationSettingsRedirect} />
      <Route path="/profile" component={ProfileSettings} />
      <Route path="/404" component={NotFound} />
      {/* Final fallback route */}
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider defaultTheme="light" switchable>
        <TooltipProvider>
          <Toaster />
          <Suspense fallback={<RouteLoadingFallback />}>
            <Router />
          </Suspense>
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
