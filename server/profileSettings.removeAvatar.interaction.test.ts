import React from "react";
import { act, create } from "react-test-renderer";
import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ removeOptions: undefined as any, toast: { success: vi.fn(), error: vi.fn() }, invalidate: vi.fn() }));

vi.stubGlobal("localStorage", { getItem: vi.fn(() => null), setItem: vi.fn() });
vi.mock("@/components/DashboardLayout", () => ({ default: ({ children }: { children: React.ReactNode }) => React.createElement("main", null, children) }));
vi.mock("@/components/ui/card", () => ({ Card: ({ children }: { children: React.ReactNode }) => React.createElement("section", null, children) }));
vi.mock("@/components/ui/avatar", () => ({ Avatar: ({ children }: { children: React.ReactNode }) => React.createElement("div", null, children), AvatarImage: () => React.createElement("img"), AvatarFallback: ({ children }: { children: React.ReactNode }) => React.createElement("span", null, children) }));
vi.mock("@/components/ui/button", () => ({ Button: ({ children, ...props }: { children: React.ReactNode; [key: string]: unknown }) => React.createElement("button", props, children) }));
vi.mock("@/components/ui/alert-dialog", () => { const Container = ({ children }: { children: React.ReactNode }) => React.createElement("div", null, children); return { AlertDialog: Container, AlertDialogContent: Container, AlertDialogHeader: Container, AlertDialogFooter: Container, AlertDialogTitle: Container, AlertDialogDescription: Container, AlertDialogAction: Container, AlertDialogCancel: Container }; });
vi.mock("@/_core/hooks/useAuth", () => ({ useAuth: () => ({ user: { id: 11, name: "ผู้กู้ทดสอบ", email: "borrower@example.test", role: "borrower" } }) }));
vi.mock("@/contexts/ThemeContext", () => ({ useTheme: () => ({ theme: "light", toggleTheme: vi.fn() }) }));
vi.mock("@/lib/avatarRemovalToast", () => ({ notifyAvatarRemovalSuccess: (toast: typeof state.toast) => toast.success("คืนค่าเป็นรูปโปรไฟล์เริ่มต้นแล้ว"), notifyAvatarRemovalError: (toast: typeof state.toast, error: Error) => toast.error(error.message || "ไม่สามารถลบรูปโปรไฟล์ได้") }));
vi.mock("@/lib/trpc", () => ({
  trpc: {
    profile: {
      getProfile: { useQuery: () => ({ data: { name: "ผู้กู้ทดสอบ", email: "borrower@example.test", role: "borrower", avatarUrl: "https://storage.test/avatar.png" } }) },
      uploadAvatar: { useMutation: () => ({ mutate: vi.fn(), isPending: false }) },
      removeAvatar: { useMutation: (options: unknown) => { state.removeOptions = options; return { mutate: vi.fn(), isPending: false }; } },
    },
    useUtils: () => ({ profile: { getProfile: { invalidate: state.invalidate } } }),
  },
}));
vi.mock("lucide-react", () => { const Icon = () => React.createElement("svg"); return { Monitor: Icon, Moon: Icon, Sun: Icon, UserRound: Icon, Trash2: Icon, RotateCcw: Icon }; });
vi.mock("sonner", () => ({ toast: state.toast }));

import ProfileSettings from "../client/src/pages/ProfileSettings";

describe("ProfileSettings removeAvatar interaction", () => {
  beforeEach(() => { state.removeOptions = undefined; state.toast.success.mockReset(); state.toast.error.mockReset(); state.invalidate.mockReset(); });

  it("shows success and error Toasts from the actual removeAvatar mutation callbacks", async () => {
    await act(async () => { create(React.createElement(ProfileSettings)); });
    await act(async () => { state.removeOptions.onSuccess(); });
    await act(async () => { state.removeOptions.onError(new Error("ลบรูปไม่สำเร็จ")); });
    expect(state.invalidate).toHaveBeenCalledTimes(1);
    expect(state.toast.success).toHaveBeenCalledWith("คืนค่าเป็นรูปโปรไฟล์เริ่มต้นแล้ว");
    expect(state.toast.error).toHaveBeenCalledWith("ลบรูปไม่สำเร็จ");
  });
});
