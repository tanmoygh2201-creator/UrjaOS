"use client";

import { useEffect, useRef, useState } from "react";

interface AnimatedCounterProps {
  /** Final value to count up to. */
  value: number;
  /** Optional suffix rendered right after the number (e.g. "%"). */
  suffix?: string;
  /** Animation duration in ms. */
  duration?: number;
  className?: string;
}

/**
 * Counts from 0 to `value` the first time the element enters the viewport.
 *
 * - Server render / no JS: the final value is printed directly, so the page
 *   is complete without JavaScript.
 * - `prefers-reduced-motion`: no animation — the value is set immediately.
 * - Runs once; re-scrolling does not replay the count.
 */
export function AnimatedCounter({
  value,
  suffix = "",
  duration = 1200,
  className,
}: AnimatedCounterProps) {
  const ref = useRef<HTMLSpanElement | null>(null);
  const [display, setDisplay] = useState<number | null>(null);
  const startedRef = useRef(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const reducedMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)"
    ).matches;

    // Reduced motion or no IntersectionObserver support: do nothing — the
    // final value is already rendered whenever `display` is null, which is
    // exactly the static behavior these environments want.
    if (reducedMotion || typeof IntersectionObserver === "undefined") {
      return;
    }

    let frame = 0;
    let startTime = 0;

    const tick = (now: number) => {
      if (!startTime) startTime = now;
      const t = Math.min(1, (now - startTime) / duration);
      // ease-out cubic: fast start, gentle landing
      const eased = 1 - Math.pow(1 - t, 3);
      setDisplay(Math.round(eased * value));
      if (t < 1) frame = requestAnimationFrame(tick);
    };

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting && !startedRef.current) {
            startedRef.current = true;
            observer.disconnect();
            frame = requestAnimationFrame(tick);
          }
        }
      },
      { threshold: 0.4 }
    );
    observer.observe(el);

    return () => {
      observer.disconnect();
      cancelAnimationFrame(frame);
    };
  }, [value, duration]);

  const shown = display === null ? value : display;

  return (
    <span ref={ref} className={className}>
      {shown.toLocaleString()}
      {suffix}
    </span>
  );
}
