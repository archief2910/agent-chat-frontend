export function formatUsageAmount(microcredits: string): string {
  if (!/^-?\d+$/.test(microcredits)) return "0.0000M";
  const negative = microcredits.startsWith("-");
  let absolute = BigInt(negative ? microcredits.slice(1) : microcredits);
  const previewWhole = absolute / 1_000_000n;
  const previewFraction = absolute % 1_000_000n;
  const places = previewWhole === 0n && previewFraction < 10_000n ? 4 : 2;
  const unit = places === 4 ? 100n : 10_000n;
  absolute = ((absolute + unit / 2n) / unit) * unit;
  const whole = absolute / 1_000_000n;
  const fraction = absolute % 1_000_000n;
  const digits = fraction.toString().padStart(6, "0").slice(0, places);
  return `${negative ? "-" : ""}${whole.toString()}.${digits}M`;
}

export function formatUsageTimestamp(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString("en-US", {
    month: "2-digit",
    day: "2-digit",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });
}

export function formatUsageDay(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
}

export function formatUsageRange(from: string, to: string, periodId: string): string {
  if (periodId === "older") return "Before Aug 13, 2026";
  return `${formatUsageDay(from)} - ${formatUsageDay(to)}`;
}
