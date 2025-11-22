'use client';

import { useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import { Sphere, Ring, Text } from '@react-three/drei';
import * as THREE from 'three';
import { Project } from '@/lib/galaxy/projects';

interface PlanetProps {
  project: Project;
  onClick: (project: Project) => void;
  isSelected?: boolean;
  completedTasks?: number;
}

export function Planet({ project, onClick, isSelected, completedTasks = 0 }: PlanetProps) {
  const groupRef = useRef<THREE.Group>(null);
  const meshRef = useRef<THREE.Mesh>(null);
  const [hovered, setHovered] = useState(false);
  const angleRef = useRef(Math.random() * Math.PI * 2);

  const totalTasks = project.tasks.length;
  const progress = totalTasks > 0 ? completedTasks / totalTasks : 0;

  useFrame((state, delta) => {
    if (groupRef.current && project.orbitRadius > 0) {
      // Orbit around center
      angleRef.current += delta * project.orbitSpeed * 0.5;
      const x = Math.cos(angleRef.current) * project.orbitRadius;
      const z = Math.sin(angleRef.current) * project.orbitRadius;
      groupRef.current.position.set(x, 0, z);
    }

    if (meshRef.current) {
      // Self rotation
      meshRef.current.rotation.y += delta * 0.5;

      // Hover effect
      const targetScale = hovered ? 1.2 : 1;
      meshRef.current.scale.lerp(
        new THREE.Vector3(targetScale, targetScale, targetScale),
        0.1
      );
    }
  });

  const handleClick = (e: { stopPropagation: () => void }) => {
    e.stopPropagation();
    onClick(project);
  };

  return (
    <group ref={groupRef}>
      {/* Orbit path (rendered separately in GalaxyScene) */}

      {/* Planet mesh */}
      <Sphere
        ref={meshRef}
        args={[project.size * 0.5, 32, 32]}
        onClick={handleClick}
        onPointerOver={() => setHovered(true)}
        onPointerOut={() => setHovered(false)}
      >
        <meshStandardMaterial
          color={project.color}
          roughness={0.4}
          metalness={0.6}
          emissive={project.color}
          emissiveIntensity={hovered ? 0.5 : 0.2}
        />
      </Sphere>

      {/* Progress ring */}
      {progress > 0 && (
        <Ring
          args={[project.size * 0.6, project.size * 0.65, 64]}
          rotation={[Math.PI / 2, 0, 0]}
        >
          <meshBasicMaterial
            color="#22c55e"
            transparent
            opacity={0.8}
            side={THREE.DoubleSide}
          />
        </Ring>
      )}

      {/* Glow effect when hovered or selected */}
      {(hovered || isSelected) && (
        <Sphere args={[project.size * 0.55, 16, 16]}>
          <meshBasicMaterial
            color={project.color}
            transparent
            opacity={0.3}
            side={THREE.BackSide}
          />
        </Sphere>
      )}

      {/* Label - using 3D Text instead of Html */}
      {hovered && (
        <group position={[0, project.size * 0.7 + 0.3, 0]}>
          <Text
            fontSize={0.2}
            color="white"
            anchorX="center"
            anchorY="middle"
            outlineWidth={0.02}
            outlineColor={project.color}
          >
            {project.name}
          </Text>
          <Text
            position={[0, -0.25, 0]}
            fontSize={0.12}
            color="#a0a0a0"
            anchorX="center"
            anchorY="middle"
          >
            {completedTasks}/{totalTasks} tasks
          </Text>
        </group>
      )}
    </group>
  );
}

// Orbit path visualization
export function OrbitPath({ radius, color }: { radius: number; color: string }) {
  return (
    <mesh rotation={[Math.PI / 2, 0, 0]}>
      <ringGeometry args={[radius - 0.02, radius + 0.02, 128]} />
      <meshBasicMaterial
        color={color}
        transparent
        opacity={0.15}
        side={THREE.DoubleSide}
      />
    </mesh>
  );
}
