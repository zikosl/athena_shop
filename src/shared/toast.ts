export type ToastTone = "success" | "error" | "info";

export type AppToast = {
  id: number;
  message: string;
  tone: ToastTone;
};

export function showToast(message: string, tone: ToastTone = "info") {
  window.dispatchEvent(new CustomEvent<Omit<AppToast, "id">>("app-toast", {
    detail: { message, tone }
  }));
}
