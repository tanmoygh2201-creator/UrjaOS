"use client";

import { useEffect, useRef, useSyncExternalStore } from "react";
import { Moon, Sun } from "lucide-react";
import { cn } from "cn";

/**
 * Landing-header theme toggle: a sliding sun ⇄ moon control.
 *
 * Sun (left) = light theme — the default. Moon (right) = dark. Clicking
 * slides the thumb with a slight overshoot, glows the active icon, and
 * cross-fades the whole site by holding the `theme-transitioning` class on
 * <html> for the duration of the token transition (see globals.css).
 *
 * State is persisted in localStorage (`urja-theme`) and applied pre-paint
 * by the inline script in the root layout, so a refresh keeps the theme
 * without a flash. Reduced-motion users get an instant flip via the global
 * reduced-motion override in globals.css.
 *
 * The dark state is read from the <html> class through useSyncExternalStore
 * (server snapshot = light default, matching the pre-paint script), so
 * hydration never mismatches and no setState runs inside an effect.
 */

const STORAGE_KEY = "urja-theme";
const TRANSITION_MS = 480;

/** Tiny external store: listeners notified whenever the theme class flips. */
const themeListeners = new Set<() => void>();
function subscribeTheme(onChange: () => void) {
  themeListeners.add(onChange);
  return () => {
    themeListeners.delete(onChange);
  };
}
function getIsDark() {
  return document.documentElement.classList.contains("dark");
}

export function ThemeToggle({ className }: { className?: string }) {
  const isDark = useSyncExternalStore(subscribeTheme, getIsDark, () => false);
  const cleanupTimer = useRef<number | null>(null);

  useEffect(
    () => () => {
      if (cleanupTimer.current !== null) window.clearTimeout(cleanupTimer.current);
    },
    []
  );

  const toggle = () => {
    const root = document.documentElement;
    const next = !isDark;

    // Cross-fade every token-driven surface for the flip, then release the
    // transition class so normal interactions stay snappy.
    root.classList.add("theme-transitioning");
    root.classList.toggle("dark", next);
    try {
      localStorage.setItem(STORAGE_KEY, next ? "dark" : "light");
    } catch {
      // Storage unavailable (private mode etc.) — theme still applies live.
    }
    if (cleanupTimer.current !== null) window.clearTimeout(cleanupTimer.current);
    cleanupTimer.current = window.setTimeout(
      () => root.classList.remove("theme-transitioning"),
      TRANSITION_MS
    );
    themeListeners.forEach((notify) => notify());
  };

  const label = isDark ? "Switch to light theme" : "Switch to dark theme";

  return (
    <button
      type="button"
      role="switch"
      aria-checked={isDark}
      aria-label={label}
      title={label}
      onClick={toggle}
      className={cn(
        "relative inline-flex h-9 w-16 shrink-0 items-center rounded-full border border-border/70 bg-muted/70 p-1",
        "transition-colors duration-300 hover:border-primary/40 active:scale-95",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
        className
      )}
    >
      {/* Sliding thumb with a gentle overshoot. */}
      <span
        aria-hidden="true"
        className={cn(
          "absolute inset-y-1 left-1 w-8 rounded-full bg-card shadow-md ring-1 ring-border/60",
          "transition-transform duration-300 [transition-timing-function:cubic-bezier(0.34,1.56,0.64,1)]",
          isDark ? "translate-x-6" : "translate-x-0"
        )}
      />
      {/* Sun — active (glowing) in the light position. */}
      <span
        aria-hidden="true"
        className={cn(
          "absolute left-1.5 flex size-8 items-center justify-center transition-all duration-300",
          isDark
            ? "scale-90 text-muted-foreground/50"
            : "scale-100 text-primary drop-shadow-[0_0_7px_oklch(0.72_0.16_75_/_0.55)]"
        )}
      >
        <Sun className="size-4" />
      </span>
      {/* Moon — active (glowing) in the dark position. */}
      <span
        aria-hidden="true"
        className={cn(
          "absolute right-1.5 flex size-8 items-center justify-center transition-all duration-300",
          isDark
            ? "scale-100 text-ring drop-shadow-[0_0_7px_oklch(0.78_0.13_200_/_0.55)]"
            : "scale-90 text-muted-foreground/50"
        )}
      >
        <Moon className="size-4" />
      </span>
    </button>
  );
}
