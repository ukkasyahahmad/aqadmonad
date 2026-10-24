"use client";

/** Deterministic confetti burst (no Math.random during render). */
export function Confetti({ fixed = false }: { fixed?: boolean }) {
  const colors = ["#E4ED72", "#EEF0ED", "#7FD3A4", "#D7E45B", "#C9D0CB"];
  return (
    <div aria-hidden className={`pointer-events-none inset-0 z-50 overflow-hidden ${fixed ? "fixed" : "absolute"}`}>
      {Array.from({ length: 90 }, (_, i) => {
        const h = (i * 2654435761) % 1000;
        return (
          <span
            key={i}
            className="confetti-piece"
            style={
              {
                left: `${(h / 10) % 100}%`,
                background: colors[i % colors.length],
                "--dx": `${((h % 200) - 100) / 4}vw`,
                "--rot": `${(h % 720) - 360}deg`,
                "--dur": `${2.6 + (h % 15) / 10}s`,
                "--delay": `${(i % 18) / 10}s`,
              } as React.CSSProperties
            }
          />
        );
      })}
    </div>
  );
}
