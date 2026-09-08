import { describe, expect, it, vi } from "vitest";
import { apiSecurityMiddleware } from "./securityMiddleware";

function createResponse() {
  const response = {
    status: vi.fn(),
    json: vi.fn(),
    setHeader: vi.fn(),
  } as any;
  response.status.mockReturnValue(response);
  return response;
}

function createRequest(overrides: Record<string, unknown> = {}) {
  const headers = (overrides.headers || {}) as Record<string, string>;
  return {
    method: "POST",
    headers,
    ip: overrides.ip || `test-${Math.random()}`,
    get: (name: string) => headers[name.toLowerCase()] || null,
    ...overrides,
  } as any;
}

describe("apiSecurityMiddleware", () => {
  it("allows same-origin mutations and requests without Origin", () => {
    const next = vi.fn();
    const response = createResponse();

    apiSecurityMiddleware(createRequest({ ip: "security-same-origin", headers: { host: "app.local", origin: "https://app.local" } }), response, next);
    apiSecurityMiddleware(createRequest({ ip: "security-no-origin", headers: { host: "app.local" } }), response, next);

    expect(next).toHaveBeenCalledTimes(2);
    expect(response.status).not.toHaveBeenCalledWith(403);
  });

  it("blocks cross-origin mutations", () => {
    const next = vi.fn();
    const response = createResponse();

    apiSecurityMiddleware(
      createRequest({ ip: "security-cross-origin", headers: { host: "app.local", origin: "https://evil.example" } }),
      response,
      next
    );

    expect(response.status).toHaveBeenCalledWith(403);
    expect(response.json).toHaveBeenCalledWith(expect.objectContaining({ error: expect.any(String) }));
    expect(next).not.toHaveBeenCalled();
  });

  it("returns 429 after the per-client request budget is exhausted", () => {
    const next = vi.fn();
    const response = createResponse();
    const request = createRequest({ ip: "security-rate-limit", headers: { host: "app.local" } });

    for (let index = 0; index < 121; index += 1) apiSecurityMiddleware(request, response, next);

    expect(response.status).toHaveBeenCalledWith(429);
    expect(response.setHeader).toHaveBeenCalledWith("Retry-After", expect.any(Number));
  });
});
