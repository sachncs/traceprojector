"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";

const AURORA_A = new THREE.Color("#a78bfa");
const AURORA_B = new THREE.Color("#67e8f9");
const AURORA_C = new THREE.Color("#f0abfc");

interface TetraMeshProps {
  divisions?: number;
}

function buildTets(divisions: number) {
  const verts: [number, number, number][] = [];
  const edges: number[][] = [];
  const tets: number[][] = [];

  const N = divisions;
  const step = 1 / N;

  for (let i = 0; i <= N; i++) {
    for (let j = 0; j <= N; j++) {
      for (let k = 0; k <= N; k++) {
        verts.push([i * step, j * step, k * step]);
      }
    }
  }
  const idx = (i: number, j: number, k: number) =>
    i * (N + 1) * (N + 1) + j * (N + 1) + k;

  for (let i = 0; i < N; i++) {
    for (let j = 0; j < N; j++) {
      for (let k = 0; k < N; k++) {
        const v000 = idx(i, j, k);
        const v100 = idx(i + 1, j, k);
        const v010 = idx(i, j + 1, k);
        const v110 = idx(i + 1, j + 1, k);
        const v001 = idx(i, j, k + 1);
        const v101 = idx(i + 1, j, k + 1);
        const v011 = idx(i, j + 1, k + 1);
        const v111 = idx(i + 1, j + 1, k + 1);

        tets.push([v000, v100, v110, v111]);
        tets.push([v000, v110, v010, v111]);
        tets.push([v000, v010, v011, v111]);
        tets.push([v000, v001, v101, v111]);
        tets.push([v000, v101, v100, v111]);
        tets.push([v000, v001, v011, v111]);
      }
    }
  }

  for (const tet of tets) {
    for (let i = 0; i < 4; i++) {
      for (let j = i + 1; j < 4; j++) {
        edges.push([tet[i]!, tet[j]!]);
      }
    }
  }

  return { verts, edges, tets };
}

function TetraMesh({ divisions = 6 }: TetraMeshProps) {
  const groupRef = useRef<THREE.Group>(null);
  const { verts, edges, tets } = useMemo(() => buildTets(divisions), [divisions]);

  const { lineGeom, tetGeom, centroidValues } = useMemo(() => {
    const linePositions = new Float32Array(edges.length * 6);
    for (let i = 0; i < edges.length; i++) {
      const [a, b] = edges[i]!;
      const va = verts[a]!;
      const vb = verts[b]!;
      linePositions[i * 6 + 0] = va[0] - 0.5;
      linePositions[i * 6 + 1] = va[1] - 0.5;
      linePositions[i * 6 + 2] = va[2] - 0.5;
      linePositions[i * 6 + 3] = vb[0] - 0.5;
      linePositions[i * 6 + 4] = vb[1] - 0.5;
      linePositions[i * 6 + 5] = vb[2] - 0.5;
    }

    const triPositions: number[] = [];
    const triColors: number[] = [];
    const centroids: number[] = [];

    const cTmp = new THREE.Color();
    for (let t = 0; t < tets.length; t++) {
      const tet = tets[t]!;
      const v = tet.map((i) => {
        const p = verts[i]!;
        return [p[0] - 0.5, p[1] - 0.5, p[2] - 0.5] as [number, number, number];
      });
      const cx = (v[0][0] + v[1][0] + v[2][0] + v[3][0]) / 4;
      const cy = (v[0][1] + v[1][1] + v[2][1] + v[3][1]) / 4;
      const cz = (v[0][2] + v[1][2] + v[2][2] + v[3][2]) / 4;

      const r = Math.sqrt(cx * cx + cy * cy + cz * cz);
      const value = Math.sin(cx * 4) * Math.cos(cy * 4) * Math.exp(cz * 1.5);
      const mix = Math.max(0, Math.min(1, value * 0.5 + 0.5));
      const hue = mix * 0.55;
      const lightness = 0.18 + mix * 0.32;
      cTmp.setHSL(0.66 - hue, 0.85, lightness);
      const rr = cTmp.r;
      const gg = cTmp.g;
      const bb = cTmp.b;

      const faces: [number, number, number][] = [
        [0, 1, 2],
        [0, 1, 3],
        [0, 2, 3],
        [1, 2, 3],
      ];

      for (const [a, b, c] of faces) {
        triPositions.push(
          v[a]![0],
          v[a]![1],
          v[a]![2],
          v[b]![0],
          v[b]![1],
          v[b]![2],
          v[c]![0],
          v[c]![1],
          v[c]![2],
        );
        for (let k = 0; k < 3; k++) {
          triColors.push(rr, gg, bb);
        }
      }

      centroids.push(cx, cy, cz, value, r);
    }

    const triPosArr = new Float32Array(triPositions);
    const triColArr = new Float32Array(triColors);

    const tetGeom = new THREE.BufferGeometry();
    tetGeom.setAttribute(
      "position",
      new THREE.BufferAttribute(triPosArr, 3),
    );
    tetGeom.setAttribute("color", new THREE.BufferAttribute(triColArr, 3));
    tetGeom.computeVertexNormals();

    const lineGeom = new THREE.BufferGeometry();
    lineGeom.setAttribute(
      "position",
      new THREE.BufferAttribute(linePositions, 3),
    );

    return {
      lineGeom,
      tetGeom,
      centroidValues: centroids,
    };
  }, [verts, edges, tets]);

  useEffect(() => {
    return () => {
      lineGeom.dispose();
      tetGeom.dispose();
    };
  }, [lineGeom, tetGeom]);

  useFrame((state, delta) => {
    if (groupRef.current) {
      groupRef.current.rotation.y += delta * 0.18;
      groupRef.current.rotation.x =
        Math.sin(state.clock.elapsedTime * 0.25) * 0.12;
    }
  });

  return (
    <group ref={groupRef} scale={1.45}>
      <mesh geometry={tetGeom}>
        <meshStandardMaterial
          vertexColors
          side={THREE.DoubleSide}
          flatShading
          roughness={0.55}
          metalness={0.12}
          transparent
          opacity={0.92}
        />
      </mesh>
      <lineSegments geometry={lineGeom}>
        <lineBasicMaterial
          color={AURORA_B}
          transparent
          opacity={0.22}
        />
      </lineSegments>
    </group>
  );
}

function GlowPlanes() {
  const { camera } = useThree();
  const mesh = useRef<THREE.Mesh>(null);
  useFrame(() => {
    if (!mesh.current) return;
    mesh.current.position.z = camera.position.z - 4;
  });
  return (
    <mesh ref={mesh}>
      <planeGeometry args={[8, 8]} />
      <meshBasicMaterial color={AURORA_A} transparent opacity={0.0} />
    </mesh>
  );
}

export function HeroMesh() {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  if (!mounted) {
    return (
      <div
        aria-hidden
        className="absolute inset-0 flex items-center justify-center"
      >
        <div className="h-40 w-40 animate-pulse-soft rounded-full bg-primary/20 blur-3xl" />
      </div>
    );
  }

  return (
    <Canvas
      camera={{ position: [1.3, 0.8, 1.6], fov: 38 }}
      dpr={[1, 2]}
      gl={{
        antialias: true,
        alpha: true,
        powerPreference: "high-performance",
      }}
    >
      <color attach="background" args={["#00000000"]} />
      <ambientLight intensity={0.55} />
      <directionalLight position={[3, 4, 3]} intensity={1.4} color={AURORA_A} />
      <directionalLight
        position={[-3, -2, -2]}
        intensity={0.7}
        color={AURORA_B}
      />
      <directionalLight
        position={[0, -4, 2]}
        intensity={0.4}
        color={AURORA_C}
      />
      <TetraMesh divisions={7} />
      <GlowPlanes />
    </Canvas>
  );
}
