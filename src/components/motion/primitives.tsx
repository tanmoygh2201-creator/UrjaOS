"use client";

import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { cn } from "cn";

/**
 * Scroll-reveal wrapper.
 *
 * Progressive enhancement only: content is fully visible without JS
 * (server render, before hydration), then gets a one-shot staggered
 * fade-up when it enters the viewport. Respects prefers-reduced-motion
 * (state never set) and browsers without IntersectionObserver.
 * Use `delay` for manual stagger, or wrap children in <Stagger>.
 */
export function Reveal({
  children,
  delay = 0,
  className,
  as: Tag = "div",
}: {
  children: ReactNode;
  /** Stagger delay in ms. */
  delay?: number;
  className?: string;
  as?: "div" | "section" | "li" | "article";
}) {
  const ref = useRef<HTMLElement | null>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (
      window.matchMedia("(prefers-reduced-motion: reduce)").matches ||
      typeof IntersectionObserver === "undefined"
    ) {
      return; // keep static, fully-visible render
    }
    let observer: IntersectionObserver | null = null;
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      setVisible(true);
      observer?.disconnect();
      window.removeEventListener("scroll", check);
      window.removeEventListener("resize", check);
      window.clearInterval(poll);
    };
    // Scroll-position fallback: some environments (background tabs,
    // battery savers, embedded webviews) delay or drop IO callbacks and
    // scroll events. A cheap rect poll guarantees the reveal; it stops
    // the moment the element is visible.
    const check = () => {
      if (done) return;
      const rect = el.getBoundingClientRect();
      if (rect.top < window.innerHeight * 0.94 && rect.bottom > 0) finish();
    };
    const poll = window.setInterval(check, 300);
    observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) finish();
        }
      },
      { rootMargin: "0px 0px -8% 0px", threshold: 0.1 }
    );
    observer.observe(el);
    window.addEventListener("scroll", check, { passive: true });
    window.addEventListener("resize", check, { passive: true });
    check(); // already in view at mount?
    return () => {
      observer?.disconnect();
      window.removeEventListener("scroll", check);
      window.removeEventListener("resize", check);
      window.clearInterval(poll);
    };
  }, []);

  return (
    <Tag
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ref={ref as any}
      className={cn(
        "transition-[opacity,transform] duration-700 ease-out motion-safe",
        visible ? "translate-y-0 opacity-100" : "translate-y-5 opacity-0",
        className
      )}
      style={delay ? { transitionDelay: `${delay}ms` } : undefined}
    >
      {children}
    </Tag>
  );
}

/**
 * Maps children to <Reveal> with an automatic index-based stagger.
 * Render function receives (child, index). Pass `step` to control
 * the per-item delay increment.
 */
export function Stagger({
  children,
  step = 70,
  className,
}: {
  children: ReactNode[];
  step?: number;
  className?: string;
}) {
  return (
    <>
      {children.map((child, i) => (
        <Reveal key={i} delay={i * step} className={className}>
          {child}
        </Reveal>
      ))}
    </>
  );
}

/**
 * Animated "live" status dot: a small solid core with an expanding,
 * fading ping ring. Reads naturally as streaming/healthy state.
 * Static (but still colored) under reduced motion.
 */
export function PulseDot({
  className,
  tone = "success",
  label,
}: {
  className?: string;
  tone?: "success" | "warning" | "danger" | "info";
  /** Accessible description, e.g. "Live simulation active". */
  label?: string;
}) {
  const tones: Record<string, string> = {
    success: "bg-energy-green",
    warning: "bg-energy-amber",
    danger: "bg-destructive",
    info: "bg-energy-blue",
  };
  const ringTones: Record<string, CSSProperties> = {
    success: { background: "radial-gradient(circle, rgba(52,211,153,0.55), transparent 70%)" },
    warning: { background: "radial-gradient(circle, rgba(250,204,21,0.55), transparent 70%)" },
    danger: { background: "radial-gradient(circle, rgba(248,113,113,0.55), transparent 70%)" },
    info: { background: "radial-gradient(circle, rgba(56,189,248,0.55), transparent 70%)" },
  };
  return (
    <span
      className={cn("relative inline-flex size-2.5 shrink-0", className)}
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    >
      <span
        aria-hidden="true"
        className="absolute inset-0 animate-ping rounded-full opacity-60"
        style={ringTones[tone]}
      />
      <span
        aria-hidden="true"
        className={cn("relative inline-flex size-2.5 rounded-full", tones[tone])}
      />
    </span>
  );
}
