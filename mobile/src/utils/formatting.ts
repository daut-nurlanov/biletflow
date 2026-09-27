export function formatDateTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Date unavailable";

  // Device locale and time zone, including the offset in the API timestamp.
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
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
