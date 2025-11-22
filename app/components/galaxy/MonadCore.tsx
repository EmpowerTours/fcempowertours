'use client';

import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Sphere, MeshDistortMaterial } from '@react-three/drei';
import * as THREE from 'three';

interface MonadCoreProps {
  onClick?: () => void;
}

export function MonadCore({ onClick }: MonadCoreProps) {
  const meshRef = useRef<THREE.Mesh>(null);
  const glowRef = useRef<THREE.Mesh>(null);

  useFrame((state) => {
    if (meshRef.current) {
      meshRef.current.rotation.y += 0.002;
      meshRef.current.rotation.x = Math.sin(state.clock.elapsedTime * 0.3) * 0.1;
    }
    if (glowRef.current) {
      glowRef.current.rotation.y -= 0.001;
      const scale = 1 + Math.sin(state.clock.elapsedTime * 2) * 0.05;
      glowRef.current.scale.setScalar(scale);
    }
  });

  return (
    <group onClick={onClick}>
      {/* Outer glow */}
      <Sphere ref={glowRef} args={[2.5, 32, 32]}>
        <meshBasicMaterial
          color="#836EF9"
          transparent
          opacity={0.1}
          side={THREE.BackSide}
        />
      </Sphere>

      {/* Inner glow ring */}
      <mesh rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[2.2, 0.05, 16, 100]} />
        <meshBasicMaterial color="#A855F7" transparent opacity={0.6} />
      </mesh>

      {/* Main core sphere */}
      <Sphere ref={meshRef} args={[2, 64, 64]}>
        <MeshDistortMaterial
          color="#836EF9"
          attach="material"
          distort={0.3}
          speed={2}
          roughness={0.2}
          metalness={0.8}
        />
      </Sphere>

      {/* Inner energy core */}
      <Sphere args={[1.5, 32, 32]}>
        <meshBasicMaterial color="#A855F7" transparent opacity={0.5} />
      </Sphere>

      {/* Center bright point */}
      <Sphere args={[0.5, 16, 16]}>
        <meshBasicMaterial color="#ffffff" />
      </Sphere>

      {/* Floating particles around core */}
      <CoreParticles />
    </group>
  );
}

function CoreParticles() {
  const particlesRef = useRef<THREE.Points>(null);
  const particleCount = 200;

  const positions = new Float32Array(particleCount * 3);
  for (let i = 0; i < particleCount; i++) {
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(2 * Math.random() - 1);
    const r = 2.5 + Math.random() * 1.5;

    positions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
    positions[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
    positions[i * 3 + 2] = r * Math.cos(phi);
  }

  useFrame((state) => {
    if (particlesRef.current) {
      particlesRef.current.rotation.y += 0.001;
      particlesRef.current.rotation.x = Math.sin(state.clock.elapsedTime * 0.2) * 0.1;
    }
  });

  return (
    <points ref={particlesRef}>
      <bufferGeometry>
        <bufferAttribute
          attach="attributes-position"
          count={particleCount}
          array={positions}
          itemSize={3}
        />
      </bufferGeometry>
      <pointsMaterial
        size={0.03}
        color="#A855F7"
        transparent
        opacity={0.8}
        sizeAttenuation
      />
    </points>
  );
}
