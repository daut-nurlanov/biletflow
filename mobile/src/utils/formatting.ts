export function formatDateTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Date unavailable";

  // Match the website's event time zone, while retaining native locale formatting.
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Almaty",
  }).format(date) + " (Almaty time)";
}

export function formatPrice(value: number | string): string {
  // Also tolerate decimal strings if the backend's numeric serializer changes.
  const price = typeof value === "string" && value.trim() === "" ? NaN : Number(value);
  if (!Number.isFinite(price) || price < 0) return "Price unavailable";
  if (price === 0) return "Free";

  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: "KZT",
    currencyDisplay: "narrowSymbol",
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(price);
}

/** Summary amounts are money, including zero, rather than free ticket labels. */
export function formatMoney(value: number | string): string {
  const amount = typeof value === "string" && value.trim() === "" ? NaN : Number(value);
  if (!Number.isFinite(amount)) return "Amount unavailable";
  return new Intl.NumberFormat(undefined, {
    style: "currency", currency: "KZT", currencyDisplay: "code",
    minimumFractionDigits: 0, maximumFractionDigits: 2,
  }).format(amount);
}
