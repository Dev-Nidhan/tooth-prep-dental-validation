"use client";

import { OrbitControls } from "@react-three/drei";
import { Canvas } from "@react-three/fiber";
import { Component, useMemo, type ReactNode } from "react";
import * as THREE from "three";

type Props = {
  positions: Float32Array;
  colors: Float32Array;
};

function Scene({ positions, colors }: Props) {
  const { geometry, distance } = useMemo(() => {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(positions), 3));
    geo.setAttribute("color", new THREE.BufferAttribute(new Float32Array(colors), 3));
    geo.computeVertexNormals();
    geo.computeBoundingSphere();
    const sphere = geo.boundingSphere;
    const center = sphere?.center ?? new THREE.Vector3();
    geo.translate(-center.x, -center.y, -center.z);
    return { geometry: geo, distance: Math.max(sphere?.radius ?? 8, 1) };
  }, [positions, colors]);

  return (
    <Canvas
      camera={{
        position: [distance * 0.85, -distance * 2.05, distance * 0.72],
        fov: 35,
        near: distance / 200,
        far: distance * 40,
      }}
      gl={{ antialias: true }}
    >
      <color attach="background" args={["#f4f0e8"]} />
      <ambientLight intensity={0.82} />
      <directionalLight position={[8, -4, 12]} intensity={1.15} />
      <directionalLight position={[-6, 8, 2]} intensity={0.35} />
      <mesh geometry={geometry}>
        <meshStandardMaterial vertexColors roughness={0.58} metalness={0.04} />
      </mesh>
      <OrbitControls makeDefault enableDamping target={[0, 0, 0]} />
    </Canvas>
  );
}

class ViewerBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  render() {
    if (this.state.failed) {
      return (
        <div className="grid h-full place-items-center px-6 text-center text-sm text-muted-foreground">
          The 3D view could not start in this browser. The measurements from the mesh are still listed beside it.
        </div>
      );
    }
    return this.props.children;
  }
}

export function PrepViewer(props: Props) {
  return (
    <ViewerBoundary>
      <Scene {...props} />
    </ViewerBoundary>
  );
}
