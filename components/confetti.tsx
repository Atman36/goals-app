"use client";

import { useEffect, useState } from "react";

// PRD §3.3.1 celebration palette — small burst at 25/50/75%, big burst at 100%.
const PALETTE = ["#EE6C4D", "#F2A65A", "#F6C7D4", "#9DB585", "#A594D1", "#8A97A6"];

interface Piece {
  id: number;
  left: number;
  delay: number;
  duration: number;
  color: string;
  rotate: number;
  size: number;
}

function generatePieces(count: number): Piece[] {
  return Array.from({ length: count }, (_, i) => ({
    id: i,
    left: Math.random() * 100,
    delay: Math.random() * 0.35,
    duration: 1.6 + Math.random() * 1.2,
    color: PALETTE[i % PALETTE.length],
    rotate: Math.random() * 360,
    size: 6 + Math.random() * 6,
  }));
}

/**
 * Hand-rolled confetti (no deps, per T8 boundaries): a burst of fixed-position
 * colored divs falling with a CSS keyframe (see `confetti-fall` in
 * app/globals.css), cleaned up via a timeout so it never lingers in the DOM.
 */
export function Confetti({
  variant,
  onDone,
}: {
  variant: "small" | "big";
  onDone?: () => void;
}) {
  // Confetti is only ever mounted for a single burst (the caller conditionally
  // renders it, then unmounts on onDone) — variant is stable for its whole
  // lifetime, so the piece set is computed once via lazy init, not an effect.
  const [pieces] = useState<Piece[]>(() => generatePieces(variant === "big" ? 70 : 44));

  useEffect(() => {
    const timeout = setTimeout(() => onDone?.(), 2400);
    return () => clearTimeout(timeout);
    // Deliberately schedule the cleanup once per mount: including `onDone`
    // in the deps would reset the timer every time the parent re-renders
    // with a new inline callback.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 z-[60] overflow-hidden">
      {pieces.map((p) => (
        <span
          key={p.id}
          style={{
            position: "absolute",
            left: `${p.left}%`,
            top: "-5%",
            width: p.size,
            height: p.size * 0.4,
            backgroundColor: p.color,
            borderRadius: 2,
            transform: `rotate(${p.rotate}deg)`,
            animationName: "confetti-fall",
            animationDuration: `${p.duration}s`,
            animationTimingFunction: "ease-in",
            animationDelay: `${p.delay}s`,
            animationFillMode: "forwards",
          }}
        />
      ))}
    </div>
  );
}
