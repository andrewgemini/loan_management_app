let adminChartPrefetchPromise: Promise<void> | undefined;

/** โหลด Chart.js ล่วงหน้าเพียงครั้งเดียวเมื่อผู้ใช้แสดงเจตนาจะเปิดพื้นที่ Admin */
export function prefetchAdminCharts() {
  if (!adminChartPrefetchPromise) {
    adminChartPrefetchPromise = Promise.all([import("chart.js"), import("react-chartjs-2")]).then(() => undefined);
  }
  return adminChartPrefetchPromise;
}
