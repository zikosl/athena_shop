export type ToastTone = "success" | "error" | "warning" | "info";

export type AppToast = {
  id: number;
  message: string;
  tone: ToastTone;
  title?: string;
  duration?: number;
};

export function showToast(
  message: string,
  tone: ToastTone = "info",
  options: { title?: string; duration?: number } = {}
) {
  const normalized = message.trim();
  if (!normalized) return;
  window.dispatchEvent(new CustomEvent<Omit<AppToast, "id">>("app-toast", {
    detail: {
      message: normalized,
      tone,
      title: options.title,
      duration: options.duration
    }
  }));
}

export function errorMessage(error: unknown, fallback = "حدث خطأ غير متوقع") {
  if (error instanceof Error && error.message.trim()) return error.message.trim();
  if (typeof error === "string" && error.trim()) return error.trim();
  return fallback;
}

export function showErrorToast(error: unknown, fallback?: string) {
  const message = errorMessage(error, fallback);
  showToast(message, "error");
  return message;
}
