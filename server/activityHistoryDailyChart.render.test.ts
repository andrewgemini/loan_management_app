import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

const chartState = vi.hoisted(() => ({ barProps: undefined as any, register: vi.fn() }));
vi.mock("react-chartjs-2", () => ({ Bar: (props: unknown) => { chartState.barProps = props; return React.createElement("div", null, "กราฟแท่งกิจกรรม"); } }));
vi.mock("chart.js", () => ({ Chart: { register: chartState.register }, CategoryScale: {}, LinearScale: {}, BarElement: {}, Tooltip: {}, Legend: {} }));
vi.mock("@/components/ui/card", () => ({ Card: ({ children }: { children: React.ReactNode }) => React.createElement("section", null, children) }));
vi.mock("lucide-react", () => ({ BarChart3: () => React.createElement("svg") }));

import { ActivityHistoryDailyChart } from "../client/src/components/ActivityHistoryDailyChart";

describe("ActivityHistoryDailyChart render", () => {
  it("renders a daily bar chart from ordered activity counts", () => {
    const onDaySelect = vi.fn();
    const markup = renderToStaticMarkup(React.createElement(ActivityHistoryDailyChart, { isLoading: false, daily: [{ date: "2026-08-01", count: 2 }, { date: "2026-08-02", count: 1 }], onDaySelect }));
    expect(markup).toContain("กราฟแท่งกิจกรรม");
    expect(chartState.barProps.data.datasets[0].data).toEqual([2, 1]);
    chartState.barProps.options.onClick({}, [{ index: 1 }]);
    expect(onDaySelect).toHaveBeenCalledWith("2026-08-02");
  });

  it("shows an informative empty state without chart records", () => {
    const markup = renderToStaticMarkup(React.createElement(ActivityHistoryDailyChart, { isLoading: false, daily: [] }));
    expect(markup).toContain("ยังไม่มีข้อมูลสำหรับกราฟ");
  });
});
