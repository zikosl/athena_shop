import { Language } from "./types";

export function money(value: number) {
  return new Intl.NumberFormat("fr-DZ", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(value) + " DA";
}

export function todayInputValue() {
  return new Date().toISOString().slice(0, 10);
}

export function appDateLabel(date: Date, language: Language) {
  return new Intl.DateTimeFormat(language === "ar" ? "ar-DZ" : "fr-DZ", {
    day: "2-digit",
    month: "long",
    year: "numeric"
  }).format(date);
}

export function hijriDateLabel(date: Date, language: Language = "ar") {
  const locale = language === "ar" ? "ar-SA-u-ca-islamic-umalqura-nu-arab" : "fr-DZ-u-ca-islamic-umalqura";
  const formatter = new Intl.DateTimeFormat(locale, {
    day: "2-digit",
    month: "long",
    year: "numeric"
  });
  if (language !== "ar") return formatter.format(date);

  const parts = formatter.formatToParts(date);
  const day = parts.find((part) => part.type === "day")?.value.padStart(2, "٠") ?? "";
  const month = parts.find((part) => part.type === "month")?.value ?? "";
  const year = parts.find((part) => part.type === "year")?.value ?? "";
  return `${day} ${month} ${year} هـ`;
}

export function addHijriYear(date: Date) {
  const next = new Date(date);
  next.setDate(next.getDate() + 354);
  return next;
}
