"use client";

import { useSyncExternalStore } from "react";

/**
 * Static, zero-JS stand-in for the 3D hero backdrop.
 *
 * Rendered (1) while the WebGL scene's chunk is loading, and (2) permanently
 * for visitors who prefer reduced motion or whose browser has no WebGL —
 * they get a calm static sun or moon matching the selected theme: dark
 * theme shows the moon (like the 3D scene), light theme shows the sun.
 *
 * The dark state uses useSyncExternalStore (server snapshot = light) so SSR
 * and the first client render match — no hydration mismatch — and the disc
 * corrects itself right after hydration for dark-theme visitors.
 */

function subscribeTheme(onChange: () => void) {
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
  return () => observer.disconnect();
}
function getIsDark() {
  return document.documentElement.classList.contains("dark");
}

export function SunFallback() {
  // Match the scene's theme rule: dark theme = moon everywhere, light = sun.
  const moon = useSyncExternalStore(subscribeTheme, getIsDark, () => false);

  const panelStyle = (rotation: string): React.CSSProperties => ({
    background:
      "repeating-linear-gradient(0deg, rgba(96, 150, 220, 0.55) 0 2px, transparent 2px 18px)," +
      "repeating-linear-gradient(90deg, rgba(96, 150, 220, 0.55) 0 2px, transparent 2px 18px)," +
      "linear-gradient(135deg, #0e2a4d, #071a33)",
    boxShadow: "0 10px 24px rgba(2, 12, 27, 0.25)",
    transform: rotation,
  });

  return (
    // `fixed` (not `absolute`): the fallback renders both at the page root
    // (reduced-motion / no-WebGL, where it must hold still like the 3D layer)
    // and inside the backdrop's fixed wrapper (loading / error states) —
    // absolute would anchor it to the page top and scroll away in the first.
    <div aria-hidden="true" className="pointer-events-none fixed inset-0 overflow-hidden">
      {/* Sun disc / moon disc — matches the active theme. */}
      <div
        className="absolute right-[5%] top-[4%] size-52 rounded-full sm:size-72 lg:right-[9%] lg:top-[5%] lg:size-80"
        style={
          moon
            ? {
                background:
                  "radial-gradient(circle at 35% 32%, #e8edf5 0%, #c9d3e2 34%, #9aa7b8 68%, #7d8aa0 100%)",
                boxShadow:
                  "0 0 50px 14px rgba(154, 167, 184, 0.28), 0 0 130px 46px rgba(154, 167, 184, 0.12)",
              }
            : {
                background:
                  "radial-gradient(circle at 35% 32%, #fff7d9 0%, #ffd166 34%, #ff9d2e 68%, #f97316 100%)",
                boxShadow:
                  "0 0 60px 18px rgba(251, 146, 60, 0.35), 0 0 160px 60px rgba(251, 146, 60, 0.15)",
              }
        }
      />
      {/* Solar panels */}
      <div
        className="absolute bottom-[10%] left-[4%] h-20 w-28 rounded-md border-[3px] border-slate-400 sm:left-[6%]"
        style={panelStyle("rotate(-6deg)")}
      />
      <div
        className="absolute bottom-[4%] left-[17%] hidden h-16 w-24 rounded-md border-[3px] border-slate-400 sm:block"
        style={panelStyle("rotate(4deg)")}
      />
      <div
        className="absolute bottom-[12%] right-[4%] hidden h-16 w-24 rounded-md border-[3px] border-slate-400 sm:block"
        style={panelStyle("rotate(2deg)")}
      />
    </div>
  );
}
