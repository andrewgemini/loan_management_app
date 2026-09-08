import { avatarRemovalSuccessMessage, getAvatarRemovalErrorMessage } from "./avatarToastMessages";

type ToastSink = { success: (message: string) => unknown; error: (message: string) => unknown };

export function notifyAvatarRemovalSuccess(toast: ToastSink) {
  toast.success(avatarRemovalSuccessMessage);
}

export function notifyAvatarRemovalError(toast: ToastSink, error: unknown) {
  toast.error(getAvatarRemovalErrorMessage(error));
}
