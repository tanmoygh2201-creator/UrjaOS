"use client";

import { Component, useSyncExternalStore, type ReactNode } from "react";
import dynamic from "next/dynamic";
import { SunFallback } from "./sun-fallback";

/**
 * Fixed background layer for the landing page.
 *
 * The WebGL scene is code-split and only fetched after hydration on the main
 * thread — the static CSS sun paints immediately and is replaced once the 3D
 * layer is ready. Visitors with reduced-motion enabled or without WebGL (and
 * any unexpected scene error) keep the static fallback instead.
 *
 * Capability detection uses useSyncExternalStore: the server snapshot is the
 * static sun, so SSR and the first client render match, and no setState is
 * needed inside effects (React Compiler requirement).
 */
const SunScene = dynamic(() => import("./sun-scene"), {
  ssr: false,
  loading: () => <SunFallback />,
});

// ── Environment capabilities as external stores ─────────────────────────────
function subscribeMotionChange(onChange: () => void) {
  const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
  mq.addEventListener("change", onChange);
  return () => mq.removeEventListener("change", onChange);
}
function getReducedMotion() {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

let webglSupport: boolean | null = null;
function subscribeNoop() {
  return () => {};
}
function getNoWebGL(): boolean {
  if (webglSupport === null) {
    try {
      const probe = document.createElement("canvas");
      webglSupport = !!(probe.getContext("webgl2") ?? probe.getContext("webgl"));
    } catch {
      webglSupport = false;
    }
  }
  return !webglSupport;
}

class SceneBoundary extends Component<
  { children: ReactNode; fallback: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

export function SunBackdrop() {
  // Server snapshot = static sun (matches SSR); after hydration the client
  // snapshot relaxes to the 3D scene for capable browsers.
  const reduced = useSyncExternalStore(subscribeMotionChange, getReducedMotion, () => true);
  const noWebGL = useSyncExternalStore(subscribeNoop, getNoWebGL, () => false);

  if (reduced || noWebGL) return <SunFallback />;

  return (
    <SceneBoundary fallback={<SunFallback />}>
      {/* The scene must own a full-bleed, fixed box — the canvas is rendered
          at the page root, so an in-flow or absolute box would collapse or
          scroll away and r3f would never measure it. */}
      <div aria-hidden="true" className="pointer-events-none fixed inset-0 z-0">
        <SunScene />
      </div>
      {/* Ambient scrim between the fixed backdrop and the whole page so
          body copy stays legible while the body travels with the scroll. */}
      <div aria-hidden="true" className="pointer-events-none fixed inset-0 z-0 bg-background/40" />
    </SceneBoundary>
  );
}
