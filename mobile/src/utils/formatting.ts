import { translate, type Lang } from "../i18n/messages";

const localeFor: Record<Lang, string> = { en: "en-GB", ru: "ru-RU", kk: "kk-KZ" };

export function formatDateTime(value: string, lang: Lang = "en"): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return translate("Date unavailable", lang);

  return new Intl.DateTimeFormat(localeFor[lang], {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Almaty",
  }).format(date) + ` (${translate("Almaty time", lang)})`;
}

export function formatPrice(value: number | string, lang: Lang = "en"): string {
  // Also tolerate decimal strings if the backend's numeric serializer changes.
  const price = typeof value === "string" && value.trim() === "" ? NaN : Number(value);
  if (!Number.isFinite(price) || price < 0) return translate("Price unavailable", lang);
  if (price === 0) return translate("Free", lang);

  return new Intl.NumberFormat(localeFor[lang], {
    style: "currency",
    currency: "KZT",
    currencyDisplay: "narrowSymbol",
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(price);
}

/** Summary amounts are money, including zero, rather than free ticket labels. */
export function formatMoney(value: number | string, lang: Lang = "en"): string {
  const amount = typeof value === "string" && value.trim() === "" ? NaN : Number(value);
  if (!Number.isFinite(amount)) return translate("Amount unavailable", lang);
  return new Intl.NumberFormat(localeFor[lang], {
    style: "currency", currency: "KZT", currencyDisplay: "code",
    minimumFractionDigits: 0, maximumFractionDigits: 2,
  }).format(amount);
}
