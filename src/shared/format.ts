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
  return new Intl.DateTimeFormat(language === "ar" ? "ar-SA-u-ca-islamic-umalqura" : "fr-DZ-u-ca-islamic-umalqura", {
    day: "2-digit",
    month: "long",
    year: "numeric"
  }).format(date);
}

export function addHijriYear(date: Date) {
  const next = new Date(date);
  next.setDate(next.getDate() + 354);
  return next;
}
