"use client";

import { useEffect, useRef, useState } from "react";

/** Counts a wei amount up to `target` over ~700 ms (bigint math, display only). */
export function useAnimatedWei(target: bigint, ms = 700): bigint {
  const [shown, setShown] = useState(target);
  const from = useRef(target);

  useEffect(() => {
    const start = from.current;
    if (start === target) return;
    const t0 = performance.now();
    let raf = 0;
    const step = (now: number) => {
      const p = Math.min(1, (now - t0) / ms);
      const eased = 1 - Math.pow(1 - p, 3);
      const v = start + ((target - start) * BigInt(Math.round(eased * 1000))) / 1000n;
      setShown(p === 1 ? target : v);
      if (p < 1) raf = requestAnimationFrame(step);
      else from.current = target;
    };
    raf = requestAnimationFrame(step);
    return () => {
      cancelAnimationFrame(raf);
      from.current = target;
    };
  }, [target, ms]);

  return shown;
}
