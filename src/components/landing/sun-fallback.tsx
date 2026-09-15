/**
 * Static, zero-JS stand-in for the 3D hero backdrop.
 *
 * Rendered (1) while the WebGL scene's chunk is loading, and (2) permanently
 * for visitors who prefer reduced motion or whose browser has no WebGL —
 * they get a calm static sun instead of an animated one.
 */
export function SunFallback() {
  const panelStyle = (rotation: string): React.CSSProperties => ({
    background:
      "repeating-linear-gradient(0deg, rgba(96, 150, 220, 0.55) 0 2px, transparent 2px 18px)," +
      "repeating-linear-gradient(90deg, rgba(96, 150, 220, 0.55) 0 2px, transparent 2px 18px)," +
      "linear-gradient(135deg, #0e2a4d, #071a33)",
    boxShadow: "0 10px 24px rgba(2, 12, 27, 0.25)",
    transform: rotation,
  });

  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden">
      {/* Sun disc */}
      <div
        className="absolute right-[5%] top-[4%] size-52 rounded-full sm:size-72 lg:right-[9%] lg:top-[5%] lg:size-80"
        style={{
          background:
            "radial-gradient(circle at 35% 32%, #fff7d9 0%, #ffd166 34%, #ff9d2e 68%, #f97316 100%)",
          boxShadow:
            "0 0 60px 18px rgba(251, 146, 60, 0.35), 0 0 160px 60px rgba(251, 146, 60, 0.15)",
        }}
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
