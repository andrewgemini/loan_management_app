import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");

describe("Admin chart prefetch", () => {
  it("loads Chart.js dependencies dynamically and caches the request", () => {
    const source = read("../client/src/lib/adminChartPrefetch.ts");
    expect(source).toContain('import("chart.js")');
    expect(source).toContain('import("react-chartjs-2")');
    expect(source).toContain("adminChartPrefetchPromise");
  });

  it("triggers chart prefetch for both pointer and keyboard focus on the Admin menu", () => {
    const source = read("../client/src/components/DashboardLayout.tsx");
    expect(source).toContain("prefetchCharts: true");
    expect(source).toContain("onPointerEnter");
    expect(source).toContain("onFocus");
    expect(source).toContain("prefetchAdminCharts()");
  });
});
