import { toast } from "sonner";
import { t } from "./i18n";

export function notifySuccess(message: string) {
  toast.success(message);
}

export function notifyError(message: string) {
  toast.error(message);
}

export function notifyMutationSuccess(message: string) {
  notifySuccess(message);
}

export function notifyMutationError(error: unknown, fallback: string) {
  const message = error instanceof Error && error.message.trim() ? error.message : fallback;
  notifyError(message);
}

export async function copyToClipboard(value: string, successMessage = t("actions.copied")) {
  try {
    await navigator.clipboard?.writeText(value);
    notifySuccess(successMessage);
    return true;
  } catch {
    notifyError(t("actions.copyFailed"));
    return false;
  }
}
