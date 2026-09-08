export function getVirtualRange({
  scrollTop,
  rowHeight,
  viewportHeight,
  itemCount,
  overscan = 4,
}: {
  scrollTop: number;
  rowHeight: number;
  viewportHeight: number;
  itemCount: number;
  overscan?: number;
}) {
  const start = Math.max(0, Math.floor(scrollTop / rowHeight) - overscan);
  const end = Math.min(itemCount, Math.ceil((scrollTop + viewportHeight) / rowHeight) + overscan);
  return { start, end, offsetTop: start * rowHeight, totalHeight: itemCount * rowHeight };
}
