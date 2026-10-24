import { formatEther, parseEther } from "viem";

export const shortAddr = (a?: string | null) => (a ? `${a.slice(0, 6)}…${a.slice(-4)}` : "—");

/** bigint-safe MON display with up to `dp` decimals (truncated). Default 6 so minimums
 *  like 0.055125 are shown exactly instead of a misleading truncated value. */
export function formatMon(wei: bigint, dp = 6): string {
  const s = formatEther(wei);
  const [int, frac = ""] = s.split(".");
  const f = frac.slice(0, dp).replace(/0+$/, "");
  return f ? `${int}.${f}` : int;
}

export type ParsedMon = { ok: true; wei: bigint } | { ok: false; error: string };

/** Validates a human MON amount (max 18 decimals) and converts to wei without floats. */
export function parseMon(input: string): ParsedMon {
  const v = input.trim();
  if (!v) return { ok: false, error: "Enter an amount." };
  if (!/^\d+(\.\d+)?$/.test(v)) return { ok: false, error: "Use digits and one dot, e.g. 1.25." };
  if ((v.split(".")[1] ?? "").length > 18) return { ok: false, error: "MON has at most 18 decimals." };
  const wei = parseEther(v);
  if (wei === 0n) return { ok: false, error: "Amount must be greater than 0 MON." };
  return { ok: true, wei };
}

const wib = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Asia/Jakarta",
  weekday: "short",
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
});
const utc = new Intl.DateTimeFormat("en-GB", {
  timeZone: "UTC",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
});

/** Design rule: always show WIB plus the UTC equivalent. */
export function formatWhen(unixSeconds: bigint): string {
  const d = new Date(Number(unixSeconds) * 1000);
  return `${wib.format(d)} WIB · ${utc.format(d)} UTC`;
}

export function formatCountdown(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return h > 0 ? `${pad(h)}:${pad(m)}:${pad(sec)}` : `${pad(m)}:${pad(sec)}`;
}
