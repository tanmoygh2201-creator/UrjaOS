/**
 * Fixed ambient atmosphere layers: the slow energy wash, the circuit-grid
 * texture, and (optionally) rising solar-energy particles.
 *
 * Server component — zero JS. All animation is CSS, compositor-friendly,
 * and disabled under prefers-reduced-motion by the global override.
 * Particle positions are static values (no Math.random at render) so SSR
 * and client markup always match.
 */
export function AmbientLayers({ particles = false }: { particles?: boolean }) {
  return (
    <>
      <div aria-hidden="true" className="urja-ambient" />
      <div aria-hidden="true" className="urja-grid-pattern" />
      {particles ? (
        <div aria-hidden="true" className="urja-particles">
          {PARTICLES.map((p, i) => (
            <i key={i} style={p} />
          ))}
        </div>
      ) : null}
    </>
  );
}

/** Deterministic particle field: left offset, size, duration, delay. */
const PARTICLES: (React.CSSProperties & Record<`--${string}`, string>)[] = [
  { left: "4%", "--urja-size": "5px", "--urja-duration": "13s", "--urja-delay": "0s" },
  { left: "11%", "--urja-size": "3px", "--urja-duration": "17s", "--urja-delay": "2.5s" },
  { left: "18%", "--urja-size": "6px", "--urja-duration": "11s", "--urja-delay": "5s" },
  { left: "26%", "--urja-size": "4px", "--urja-duration": "15s", "--urja-delay": "1.2s" },
  { left: "33%", "--urja-size": "5px", "--urja-duration": "12s", "--urja-delay": "7s" },
  { left: "41%", "--urja-size": "3px", "--urja-duration": "18s", "--urja-delay": "3.5s" },
  { left: "48%", "--urja-size": "7px", "--urja-duration": "10s", "--urja-delay": "8.5s" },
  { left: "56%", "--urja-size": "4px", "--urja-duration": "14s", "--urja-delay": "0.8s" },
  { left: "63%", "--urja-size": "5px", "--urja-duration": "12.5s", "--urja-delay": "4.2s" },
  { left: "70%", "--urja-size": "3px", "--urja-duration": "16s", "--urja-delay": "6.1s" },
  { left: "78%", "--urja-size": "6px", "--urja-duration": "11.5s", "--urja-delay": "2s" },
  { left: "85%", "--urja-size": "4px", "--urja-duration": "15.5s", "--urja-delay": "9s" },
  { left: "92%", "--urja-size": "5px", "--urja-duration": "13.5s", "--urja-delay": "5.5s" },
  { left: "97%", "--urja-size": "3px", "--urja-duration": "19s", "--urja-delay": "1.6s" },
];
