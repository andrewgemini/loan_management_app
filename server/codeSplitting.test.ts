import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");

describe("report and chart code splitting", () => {
  it("loads analytics and report routes lazily instead of placing them in the initial route imports", () => {
    const app = read("../client/src/App.tsx");
    expect(app).toContain('const AdminDashboard = lazy(() => import("./pages/AdminDashboard"))');
    expect(app).toContain('const AdminActivityHistory = lazy(() => import("./pages/AdminActivityHistory"))');
    expect(app).toContain('const LoanDetail = lazy(() => import("./pages/LoanDetail"))');
    expect(app).not.toContain('import AdminDashboard from "./pages/AdminDashboard"');
  });

  it("loads jsPDF and autoTable dynamically inside the PDF export action", () => {
    const pdfExport = read("../client/src/lib/historyExport.ts");
    expect(pdfExport).toContain('import("jspdf")');
    expect(pdfExport).toContain('import("jspdf-autotable")');
    expect(pdfExport).not.toContain('import { jsPDF } from "jspdf"');
  });
});
