import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mutationState = vi.hoisted(() => ({ removeAvatarOptions: undefined as any, notifySuccess: vi.fn(), notifyError: vi.fn() }));

vi.stubGlobal("localStorage", { getItem: vi.fn(() => null), setItem: vi.fn() });

vi.mock("@/components/DashboardLayout", () => ({ default: ({ children }: { children: React.ReactNode }) => React.createElement("main", null, children) }));
vi.mock("@/components/ui/card", () => ({ Card: ({ children }: { children: React.ReactNode }) => React.createElement("section", null, children) }));
vi.mock("@/components/ui/avatar", () => ({
  Avatar: ({ children }: { children: React.ReactNode }) => React.createElement("div", null, children),
  AvatarImage: ({ src, alt }: { src?: string; alt?: string }) => React.createElement("img", { src, alt }),
  AvatarFallback: ({ children }: { children: React.ReactNode }) => React.createElement("span", null, children),
}));
vi.mock("@/components/ui/button", () => ({ Button: ({ children, ...props }: { children: React.ReactNode; [key: string]: unknown }) => React.createElement("button", props, children) }));
vi.mock("@/components/ui/alert-dialog", () => {
  const Container = ({ children }: { children: React.ReactNode }) => React.createElement("div", null, children);
  const Action = ({ children, ...props }: { children: React.ReactNode; [key: string]: unknown }) => React.createElement("button", props, children);
  return { AlertDialog: Container, AlertDialogContent: Container, AlertDialogHeader: Container, AlertDialogFooter: Container, AlertDialogTitle: Container, AlertDialogDescription: Container, AlertDialogAction: Action, AlertDialogCancel: Action };
});
vi.mock("@/_core/hooks/useAuth", () => ({ useAuth: () => ({ user: { id: 11, name: "ผู้กู้ทดสอบ", email: "borrower@example.test", role: "borrower" } }) }));
vi.mock("@/contexts/ThemeContext", () => ({ useTheme: () => ({ theme: "light", toggleTheme: vi.fn() }) }));
vi.mock("@/lib/avatarToastMessages", () => ({ avatarRemovalSuccessMessage: "คืนค่าเป็นรูปโปรไฟล์เริ่มต้นแล้ว", getAvatarRemovalErrorMessage: () => "ไม่สามารถลบรูปโปรไฟล์ได้" }));
vi.mock("@/lib/avatarRemovalToast", () => ({ notifyAvatarRemovalSuccess: mutationState.notifySuccess, notifyAvatarRemovalError: mutationState.notifyError }));
vi.mock("@/lib/trpc", () => ({
  trpc: {
    profile: {
      getProfile: { useQuery: () => ({ data: { name: "ผู้กู้ทดสอบ", email: "borrower@example.test", role: "borrower", avatarUrl: "https://storage.test/avatar.png" } }) },
      uploadAvatar: { useMutation: () => ({ mutate: vi.fn(), isPending: false }) },
      removeAvatar: { useMutation: (options: unknown) => { mutationState.removeAvatarOptions = options; return { mutate: vi.fn(), isPending: false }; } },
    },
    useUtils: () => ({ profile: { getProfile: { invalidate: vi.fn() } } }),
  },
}));
vi.mock("lucide-react", () => {
  const Icon = () => React.createElement("svg");
  return { Monitor: Icon, Moon: Icon, Sun: Icon, UserRound: Icon, Trash2: Icon, RotateCcw: Icon };
});
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import ProfileSettings from "../client/src/pages/ProfileSettings";

describe("ProfileSettings render", () => {
  beforeEach(() => {
    mutationState.removeAvatarOptions = undefined;
    mutationState.notifySuccess.mockReset();
    mutationState.notifyError.mockReset();
  });
  it("shows the persisted avatar and constrained avatar upload control", () => {
    const markup = renderToStaticMarkup(React.createElement(ProfileSettings));
    expect(markup).toContain("https://storage.test/avatar.png");
    expect(markup).toContain("เปลี่ยนรูป");
    expect(markup).toContain('accept="image/png,image/jpeg,image/webp"');
    expect(markup).toContain("ผู้กู้ทดสอบ");
    expect(markup).toContain("ลบรูป");
  });

  it("routes removeAvatar success and error callbacks to their Toast notifications", () => {
    renderToStaticMarkup(React.createElement(ProfileSettings));
    mutationState.removeAvatarOptions.onSuccess();
    mutationState.removeAvatarOptions.onError(new Error("ลบรูปไม่สำเร็จ"));
    expect(mutationState.notifySuccess).toHaveBeenCalledTimes(1);
    expect(mutationState.notifyError).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ message: "ลบรูปไม่สำเร็จ" }));
  });
});
