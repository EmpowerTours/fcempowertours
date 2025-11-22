'use client';

import { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

interface StarFieldProps {
  count?: number;
  radius?: number;
}

export function StarField({ count = 5000, radius = 100 }: StarFieldProps) {
  const pointsRef = useRef<THREE.Points>(null);

  const [positions, colors] = useMemo(() => {
    const positions = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);

    for (let i = 0; i < count; i++) {
      // Distribute stars in a sphere
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      const r = radius * (0.5 + Math.random() * 0.5);

      positions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
      positions[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
      positions[i * 3 + 2] = r * Math.cos(phi);

      // Random star colors (white, blue-white, yellow)
      const colorChoice = Math.random();
      if (colorChoice < 0.7) {
        // White
        colors[i * 3] = 1;
        colors[i * 3 + 1] = 1;
        colors[i * 3 + 2] = 1;
      } else if (colorChoice < 0.85) {
        // Blue-white
        colors[i * 3] = 0.8;
        colors[i * 3 + 1] = 0.9;
        colors[i * 3 + 2] = 1;
      } else {
        // Yellow
        colors[i * 3] = 1;
        colors[i * 3 + 1] = 0.95;
        colors[i * 3 + 2] = 0.8;
      }
    }

    return [positions, colors];
  }, [count, radius]);

  useFrame((state) => {
    if (pointsRef.current) {
      // Slow rotation for parallax effect
      pointsRef.current.rotation.y += 0.0001;
      pointsRef.current.rotation.x = Math.sin(state.clock.elapsedTime * 0.05) * 0.02;
    }
  });

  return (
    <points ref={pointsRef}>
      <bufferGeometry>
        <bufferAttribute
          attach="attributes-position"
          count={count}
          array={positions}
          itemSize={3}
        />
        <bufferAttribute
          attach="attributes-color"
          count={count}
          array={colors}
          itemSize={3}
        />
      </bufferGeometry>
      <pointsMaterial
        size={0.15}
        vertexColors
        transparent
        opacity={0.8}
        sizeAttenuation
      />
    </points>
  );
}

// Nebula clouds for depth
export function NebulaCloud() {
  const meshRef = useRef<THREE.Mesh>(null);

  useFrame((state) => {
    if (meshRef.current) {
      meshRef.current.rotation.z += 0.0002;
    }
  });

  return (
    <group>
      {/* Purple nebula */}
      <mesh ref={meshRef} position={[30, 10, -50]}>
        <planeGeometry args={[80, 80]} />
        <meshBasicMaterial
          color="#836EF9"
          transparent
          opacity={0.05}
          side={THREE.DoubleSide}
        />
      </mesh>

      {/* Blue nebula */}
      <mesh position={[-40, -20, -60]} rotation={[0.5, 0.2, 0.3]}>
        <planeGeometry args={[60, 60]} />
        <meshBasicMaterial
          color="#3B82F6"
          transparent
          opacity={0.04}
          side={THREE.DoubleSide}
        />
      </mesh>

      {/* Pink nebula */}
      <mesh position={[20, -30, -40]} rotation={[0.3, 0.5, 0.1]}>
        <planeGeometry args={[50, 50]} />
        <meshBasicMaterial
          color="#EC4899"
          transparent
          opacity={0.03}
          side={THREE.DoubleSide}
        />
      </mesh>
    </group>
  );
}
