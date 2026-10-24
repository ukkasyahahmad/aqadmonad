/**
 * Seconds until `endsAt`, measured against chain time, not the device clock.
 * `blockTs` is the latest block timestamp, read at local time `fetchedAtMs`;
 * only the time elapsed since then comes from the device.
 */
export function secondsLeft(endsAt: number, blockTs: number, fetchedAtMs: number, nowMs: number): number {
  return Math.max(0, endsAt - blockTs - (nowMs - fetchedAtMs) / 1000);
}

export function formatClock(s: number): string {
  const total = Math.ceil(s);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}
