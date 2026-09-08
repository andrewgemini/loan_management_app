import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  loading: false,
  preferencesError: false,
  preferences: {
    emailNewLoanRequest: true,
    emailLoanApproval: true,
    emailLoanRejection: false,
    emailPaymentReminder: true,
    emailPaymentConfirmation: true,
    lineNewLoanRequest: true,
    lineLoanApproval: false,
    lineLoanRejection: true,
    linePaymentReminder: true,
    linePaymentConfirmation: false,
  },
  lineConnected: false,
  callbacks: [] as Array<{ onSuccess?: () => void; onError?: (error: { message: string }) => void }>,
  toastSuccess: vi.fn(),
  toastError: vi.fn(),
}));

vi.mock("@/components/ui/card", () => {
  const Section = ({ children, className }: { children: React.ReactNode; className?: string }) =>
    React.createElement("section", { className }, children);
  return { Card: Section, CardContent: Section, CardHeader: Section, CardTitle: Section, CardDescription: Section };
});

vi.mock("@/components/ui/button", () => ({
  Button: ({ children, ...props }: { children: React.ReactNode; [key: string]: unknown }) =>
    React.createElement("button", props, children),
}));

vi.mock("@/components/ui/checkbox", () => ({
  Checkbox: (props: Record<string, unknown>) => React.createElement("input", { ...props, type: "checkbox" }),
}));

vi.mock("@/components/ui/input", () => ({
  Input: (props: Record<string, unknown>) => React.createElement("input", props),
}));

vi.mock("lucide-react", () => {
  const Icon = () => null;
  return { AlertCircle: Icon, CheckCircle2: Icon, Clock3: Icon, Info: Icon, Mail: Icon, MessageCircle: Icon, RefreshCw: Icon, RotateCcw: Icon, Save: Icon, Settings2: Icon, ShieldCheck: Icon };
});

vi.mock("sonner", () => ({
  toast: {
    success: state.toastSuccess,
    error: state.toastError,
  },
}));

vi.mock("@/lib/trpc", () => {
  const mutation = (options: { onSuccess?: () => void; onError?: (error: { message: string }) => void }) => {
    state.callbacks.push(options);
    return { mutateAsync: vi.fn(), isPending: false };
  };
  return {
    trpc: {
      notificationPreferences: {
        getPreferences: { useQuery: () => ({ data: state.preferences, isLoading: state.loading, isError: state.preferencesError, error: state.preferencesError ? { message: "เชื่อมต่อไม่สำเร็จ" } : null, refetch: vi.fn() }) },
        getAuditLogs: { useQuery: () => ({ data: [], isLoading: false, refetch: vi.fn() }) },
        updatePreferences: { useMutation: mutation },
        resetToDefaults: { useMutation: mutation },
      },
      lineNotify: {
        getLineNotifyStatus: { useQuery: () => ({ data: { connected: state.lineConnected }, isLoading: false }) },
        connectLineNotify: { useMutation: mutation },
        disconnectLineNotify: { useMutation: mutation },
        sendTestMessage: { useMutation: mutation },
      },
    },
  };
});

import NotificationSettings from "../client/src/pages/NotificationSettings";

describe("NotificationSettings render and mutation states", () => {
  beforeEach(() => {
    state.loading = false;
    state.preferencesError = false;
    state.lineConnected = false;
    state.callbacks.length = 0;
    state.toastSuccess.mockReset();
    state.toastError.mockReset();
  });

  it("renders loading state while preferences are being fetched", () => {
    state.loading = true;
    const markup = renderToStaticMarkup(React.createElement(NotificationSettings));
    expect(markup).toContain("กำลังโหลดการตั้งค่าการแจ้งเตือน...");
  });

  it("renders preference controls and LINE connection form from query data", () => {
    const markup = renderToStaticMarkup(React.createElement(NotificationSettings));
    expect(markup).toContain("การแจ้งเตือนผ่านอีเมล");
    expect(markup).toContain("การแจ้งเตือนผ่าน LINE Notify");
    expect(markup).toContain("LINE Notify access token");
    expect(markup).toContain("เชื่อมต่อ LINE");
    expect(markup).toContain("คำขอกู้ใหม่");
    expect(markup).toContain("ประวัติการตรวจสอบการตั้งค่า");
  });

  it("renders a retryable error state when preferences cannot be loaded", () => {
    state.preferencesError = true;
    const markup = renderToStaticMarkup(React.createElement(NotificationSettings));
    expect(markup).toContain("ไม่สามารถโหลดการตั้งค่าการแจ้งเตือนได้");
    expect(markup).toContain("ลองโหลดอีกครั้ง");
  });

  it("exposes success and error handling for mutations", () => {
    renderToStaticMarkup(React.createElement(NotificationSettings));
    expect(state.callbacks.length).toBe(5);

    state.callbacks[3]?.onSuccess?.();
    state.callbacks[3]?.onError?.({ message: "บันทึกไม่สำเร็จ" });
    expect(state.toastSuccess).toHaveBeenCalledWith("บันทึกการตั้งค่าสำเร็จ");
    expect(state.toastError).toHaveBeenCalledWith("เกิดข้อผิดพลาด: บันทึกไม่สำเร็จ");
  });
});
