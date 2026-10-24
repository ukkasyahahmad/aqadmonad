/** Split [from, to] into inclusive block ranges of at most `chunk` blocks (RPCs cap getLogs ranges). */
export function logRanges(from: bigint, to: bigint, chunk = 100n): Array<[bigint, bigint]> {
  const ranges: Array<[bigint, bigint]> = [];
  for (let start = from; start <= to; start += chunk) {
    const end = start + chunk - 1n;
    ranges.push([start, end < to ? end : to]);
  }
  return ranges;
}
