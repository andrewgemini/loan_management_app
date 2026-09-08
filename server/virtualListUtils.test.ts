import { describe, expect, it } from "vitest";
import { getVirtualRange } from "../client/src/lib/virtualListUtils";

describe("Audit Log virtualization range", () => {
  it("renders only the visible window with overscan while preserving total scroll height", () => {
    expect(getVirtualRange({ scrollTop: 940, rowHeight: 94, viewportHeight: 520, itemCount: 1000 })).toEqual({ start: 6, end: 20, offsetTop: 564, totalHeight: 94000 });
  });

  it("clamps the window safely for a short list", () => {
    expect(getVirtualRange({ scrollTop: 0, rowHeight: 94, viewportHeight: 520, itemCount: 3 })).toEqual({ start: 0, end: 3, offsetTop: 0, totalHeight: 282 });
  });
});
