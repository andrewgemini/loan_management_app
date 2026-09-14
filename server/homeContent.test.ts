import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("Home page content", () => {
  it("replaces the starter Example Page with the Loan Management landing page", () => {
    const source = readFileSync(new URL("../client/src/pages/Home.tsx", import.meta.url), "utf8");
    expect(source).not.toContain("Example Page");
    expect(source).not.toContain("Example Button");
    expect(source).toContain("วางแผนสัญญา");
    expect(source).not.toContain('href="/loan/create"');
    expect(source).toContain("handleOAuthSignIn");
  });
});
