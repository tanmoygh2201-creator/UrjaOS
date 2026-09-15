"use client";

/**
 * The 3D hero backdrop scene (loaded client-side only, after hydration).
 *
 * A large rotating sun — an emissive sphere with a canvas-generated bump
 * texture — with corona sprites and floating solar panels. Page scroll
 * progress (0 at the top of the page, 1 at the footer) smoothly morphs it
 * into a moon: a slightly larger "moon shell" sphere with a crater bump
 * texture fades in over the sun while the sun's palette cools and its glow
 * fades — a crossfade of color, emissive glow and surface texture with no
 * custom shaders, so it renders identically on every WebGL implementation.
 *
 * Scroll progress is re-read every frame and snapped on the first frame, so
 * reloading partway down the page resumes at the correct morph state instead
 * of replaying from "sun".
 *
 * React Compiler notes: every object mutated per-frame is reached through a
 * ref deref inside the frame callback (never a render-scope local or a
 * useMemo result). useMemo holds only objects that are never mutated.
 */

import { useEffect, useMemo, useRef } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";

// ── Day (sun) → night (moon) palette ────────────────────────────────────────
const DAY = {
  color: new THREE.Color("#ff9d2e"),
  emissive: new THREE.Color("#ffb347"),
  coronaIn: new THREE.Color("#ffb347"),
  coronaOut: new THREE.Color("#ff8c1a"),
  light: new THREE.Color("#fff1d6"),
};
const NIGHT = {
  color: new THREE.Color("#9aa7b8"),
  emissive: new THREE.Color("#28354d"),
  coronaIn: new THREE.Color("#a5b8d8"),
  coronaOut: new THREE.Color("#7d93b8"),
  light: new THREE.Color("#c7d4ea"),
};

/** Day → night material palette for the sun sphere; runs per-frame. */
function applySunPalette(mat: THREE.MeshStandardMaterial, m: number) {
  mat.color.lerpColors(DAY.color, NIGHT.color, m);
  mat.emissive.lerpColors(DAY.emissive, NIGHT.emissive, m);
  mat.emissiveIntensity = 1.3 - 0.95 * m;
  mat.roughness = 0.5 + 0.35 * m;
}

/** A handful of panels around the sun: position / yaw tilt / size. */
const PANELS: Array<{ pos: [number, number, number]; rot: number; scale: number }> = [
  { pos: [-4.7, -0.3, 0.6], rot: 0.5, scale: 1.25 },
  { pos: [-3.5, -1.7, 0.2], rot: 0.26, scale: 1.0 },
  { pos: [-5.0, 1.2, -0.4], rot: 0.62, scale: 0.85 },
  { pos: [4.5, -1.3, 0.4], rot: -0.5, scale: 1.1 },
  { pos: [5.2, 0.5, -0.2], rot: -0.62, scale: 0.9 },
  { pos: [-2.9, 2.0, -0.6], rot: 0.34, scale: 0.75 },
  { pos: [3.4, 2.1, -0.7], rot: -0.3, scale: 0.7 },
];

function makeHaloTexture(): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 256;
  const ctx = canvas.getContext("2d")!;
  const g = ctx.createRadialGradient(128, 128, 0, 128, 128, 128);
  g.addColorStop(0, "rgba(255,255,255,1)");
  g.addColorStop(0.25, "rgba(255,255,255,0.55)");
  g.addColorStop(0.6, "rgba(255,255,255,0.12)");
  g.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 256, 256);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function makePanelTexture(): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 176;
  const ctx = canvas.getContext("2d")!;
  const g = ctx.createLinearGradient(0, 0, 256, 176);
  g.addColorStop(0, "#0d2c52");
  g.addColorStop(1, "#071a33");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 256, 176);
  ctx.strokeStyle = "rgba(96, 150, 220, 0.8)";
  ctx.lineWidth = 2;
  for (let x = 0; x <= 6; x++) {
    ctx.beginPath();
    ctx.moveTo(x * 42.6, 0);
    ctx.lineTo(x * 42.6, 176);
    ctx.stroke();
  }
  for (let y = 0; y <= 4; y++) {
    ctx.beginPath();
    ctx.moveTo(0, y * 44);
    ctx.lineTo(256, y * 44);
    ctx.stroke();
  }
  ctx.fillStyle = "rgba(140, 190, 255, 0.07)";
  for (let i = 0; i < 6; i++) {
    for (let j = 0; j < 4; j++) {
      if ((i + j) % 2 === 0) ctx.fillRect(i * 42.6, j * 44, 42.6, 44);
    }
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

/** Soft blotchy bump map for the sun's granular surface (seamless in X). */
function makeSunBumpTexture(): THREE.CanvasTexture {
  const w = 512;
  const h = 256;
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#8a8a8a";
  ctx.fillRect(0, 0, w, h);
  for (let i = 0; i < 420; i++) {
    const x = Math.random() * w;
    const y = Math.random() * h;
    const r = 3 + Math.random() * 12;
    const bright = Math.random() > 0.45;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    const c = bright ? "255,255,255" : "40,40,40";
    g.addColorStop(0, `rgba(${c},${0.10 + Math.random() * 0.16})`);
    g.addColorStop(1, `rgba(${c},0)`);
    ctx.fillStyle = g;
    // Redraw shifted by ±width so the horizontal seam wraps seamlessly.
    for (const dx of [-w, 0, w]) {
      ctx.beginPath();
      ctx.arc(x + dx, y, r, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  return tex;
}

/** Cratered bump map for the moon shell (seamless in X). */
function makeMoonCraterTexture(): THREE.CanvasTexture {
  const w = 512;
  const h = 256;
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#8a8a8a";
  ctx.fillRect(0, 0, w, h);
  for (let i = 0; i < 150; i++) {
    const x = Math.random() * w;
    const y = Math.random() * h;
    const r = 3 + Math.random() * 16;
    for (const dx of [-w, 0, w]) {
      // Floor of the crater (darker)…
      ctx.beginPath();
      ctx.arc(x + dx, y, r, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(30,30,30,${0.16 + Math.random() * 0.14})`;
      ctx.fill();
      // …and a bright rim arc to catch the light.
      ctx.beginPath();
      ctx.arc(x + dx, y, r, Math.PI * 1.15, Math.PI * 1.85);
      ctx.strokeStyle = "rgba(255,255,255,0.28)";
      ctx.lineWidth = 2;
      ctx.stroke();
    }
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  return tex;
}

function Rig() {
  // Per-frame-mutated objects live in refs, reached only via ref.current.
  const smooth = useRef({ t: 0, morph: -1 });

  const haloTex = useMemo(() => makeHaloTexture(), []);
  const panelTex = useMemo(() => makePanelTexture(), []);
  const sunBumpTex = useMemo(() => makeSunBumpTexture(), []);
  const moonCraterTex = useMemo(() => makeMoonCraterTexture(), []);
  const sphereGeo = useMemo(() => new THREE.SphereGeometry(2.2, 96, 96), []);

  // Frame-loop-mutated materials are created by r3f (auto-disposed) and
  // reached through refs — never passed around as mutable useMemo values.
  const sunMat = useRef<THREE.MeshStandardMaterial>(null);
  const shellMat = useRef<THREE.MeshStandardMaterial>(null);
  const coronaInMat = useRef<THREE.SpriteMaterial>(null);
  const coronaOutMat = useRef<THREE.SpriteMaterial>(null);

  // Shared, never-mutated materials are safe in useMemo. Panel faces use a
  // lit material so the day→night light change dims/cools them for free.
  const panelFaceMat = useMemo(
    () => new THREE.MeshStandardMaterial({ map: panelTex, roughness: 0.55, metalness: 0.1 }),
    [panelTex]
  );
  const panelFrameMat = useMemo(
    () => new THREE.MeshStandardMaterial({ color: "#475569", roughness: 0.45, metalness: 0.55 }),
    []
  );

  const sunGroup = useRef<THREE.Group>(null);
  const panelsRef = useRef<THREE.Group>(null);
  const panelRefs = useRef<Array<THREE.Group | null>>([]);
  const dirLight = useRef<THREE.DirectionalLight>(null);
  const ambLight = useRef<THREE.AmbientLight>(null);

  // Wide: sun sits right of the copy. Narrow: sun shrinks and rises above
  // the headline so the hero text stays fully legible.
  const wideTarget = useMemo(() => new THREE.Vector3(2.9, 1.35, -1), []);
  const narrowTarget = useMemo(() => new THREE.Vector3(0, 2.9, -1), []);
  const size = useThree((s) => s.size);

  useFrame((_, delta) => {
    const d = Math.min(delta, 0.05);
    smooth.current.t += d;

    // Scroll progress → morph target. Snapped on the very first frame so a
    // mid-page reload resumes at the correct state instead of replaying.
    const doc = document.documentElement;
    const max = Math.max(1, doc.scrollHeight - window.innerHeight);
    const target = Math.min(1, Math.max(0, (window.scrollY || 0) / max));
    if (smooth.current.morph < 0) smooth.current.morph = target;
    smooth.current.morph += (target - smooth.current.morph) * Math.min(1, d * 6);
    if (Math.abs(target - smooth.current.morph) < 0.0005) smooth.current.morph = target;
    const m = smooth.current.morph;

    // Continuous rotation of the whole sun/moon body (corona sprites are
    // rotation-independent by nature).
    if (sunGroup.current) sunGroup.current.rotation.y = smooth.current.t * 0.12;

    // Day → night palette on the sun; the moon shell fades in over it.
    if (sunMat.current) applySunPalette(sunMat.current, m);
    if (shellMat.current) {
      shellMat.current.opacity = m;
      shellMat.current.emissiveIntensity = 0.5 - 0.15 * m;
    }
    if (coronaInMat.current) {
      coronaInMat.current.color.lerpColors(DAY.coronaIn, NIGHT.coronaIn, m);
      coronaInMat.current.opacity = 0.5 - 0.22 * m;
    }
    if (coronaOutMat.current) {
      coronaOutMat.current.color.lerpColors(DAY.coronaOut, NIGHT.coronaOut, m);
      coronaOutMat.current.opacity = 0.3 - 0.1 * m;
    }
    if (dirLight.current) {
      dirLight.current.color.lerpColors(DAY.light, NIGHT.light, m);
      dirLight.current.intensity = 1.15 - 0.55 * m;
    }
    if (ambLight.current) ambLight.current.intensity = 0.85 - 0.3 * m;

    // Panels bob gently on their own phase.
    panelRefs.current.forEach((g, i) => {
      if (!g) return;
      g.position.y = PANELS[i].pos[1] + Math.sin(smooth.current.t * 0.55 + i * 1.7) * 0.1;
    });

    // Responsive placement + panel compaction on narrow screens.
    const narrow = size.width < 640 || size.width / Math.max(1, size.height) < 0.9;
    const k = Math.min(1, d * 3);
    if (sunGroup.current) {
      sunGroup.current.position.lerp(narrow ? narrowTarget : wideTarget, k);
      const targetScale = narrow ? 0.55 : 1;
      sunGroup.current.scale.setScalar(
        sunGroup.current.scale.x + (targetScale - sunGroup.current.scale.x) * k
      );
    }
    if (panelsRef.current) {
      const targetScale = narrow ? 0.55 : 1;
      panelsRef.current.scale.setScalar(
        panelsRef.current.scale.x + (targetScale - panelsRef.current.scale.x) * k
      );
    }
  });

  // The canvas textures and shared geometry are created outside r3f's
  // lifecycle — dispose them on unmount.
  useEffect(
    () => () => {
      haloTex.dispose();
      panelTex.dispose();
      sunBumpTex.dispose();
      moonCraterTex.dispose();
      sphereGeo.dispose();
    },
    [haloTex, panelTex, sunBumpTex, moonCraterTex, sphereGeo]
  );

  return (
    <>
      <ambientLight ref={ambLight} intensity={0.85} />
      <directionalLight ref={dirLight} position={[4, 6, 5]} intensity={1.15} />

      <group ref={sunGroup} position={[2.9, 1.35, -1]}>
        {/* Sun body (opaque, fades toward night palette)… */}
        <mesh geometry={sphereGeo} renderOrder={0}>
          <meshStandardMaterial
            ref={sunMat}
            color={DAY.color}
            emissive={DAY.emissive}
            emissiveIntensity={1.3}
            roughness={0.5}
            metalness={0}
            bumpMap={sunBumpTex}
            bumpScale={0.5}
          />
        </mesh>
        {/* …and the moon shell just above it, fading in on scroll. */}
        <mesh geometry={sphereGeo} scale={1.006} renderOrder={1}>
          <meshStandardMaterial
            ref={shellMat}
            color={NIGHT.color}
            emissive={NIGHT.emissive}
            emissiveIntensity={0.5}
            roughness={0.9}
            metalness={0}
            transparent
            opacity={0}
            depthWrite={false}
            bumpMap={moonCraterTex}
            bumpScale={0.4}
          />
        </mesh>
        <sprite scale={[7.2, 7.2, 1]} renderOrder={2}>
          <spriteMaterial
            ref={coronaInMat}
            map={haloTex}
            color={DAY.coronaIn}
            transparent
            opacity={0.5}
            blending={THREE.AdditiveBlending}
            depthWrite={false}
          />
        </sprite>
        <sprite scale={[11.5, 11.5, 1]} renderOrder={3}>
          <spriteMaterial
            ref={coronaOutMat}
            map={haloTex}
            color={DAY.coronaOut}
            transparent
            opacity={0.3}
            depthWrite={false}
          />
        </sprite>
      </group>

      <group ref={panelsRef}>
        {PANELS.map((p, i) => (
          <group
            key={i}
            ref={(g) => {
              panelRefs.current[i] = g;
            }}
            position={p.pos}
            rotation={[0.12, p.rot, 0.06]}
            scale={p.scale}
          >
            <mesh material={panelFrameMat}>
              <boxGeometry args={[1.5, 1.0, 0.07]} />
            </mesh>
            <mesh material={panelFaceMat} position={[0, 0, 0.045]}>
              <planeGeometry args={[1.42, 0.92]} />
            </mesh>
          </group>
        ))}
      </group>
    </>
  );
}

export default function SunScene() {
  return (
    <Canvas
      dpr={[1, 1.75]}
      camera={{ position: [0, 0.4, 9], fov: 42 }}
      gl={{ alpha: true, antialias: true, powerPreference: "low-power" }}
      onCreated={({ gl }) => gl.setClearColor(0x000000, 0)}
    >
      <Rig />
    </Canvas>
  );
}
