'use client';

import { Suspense, useRef } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, PerspectiveCamera } from '@react-three/drei';
import * as THREE from 'three';
import { MonadCore } from './MonadCore';
import { Planet, OrbitPath } from './Planet';
import { StarField, NebulaCloud } from './StarField';
import { Project, monadProjects } from '@/lib/galaxy/projects';

interface GalaxySceneProps {
  onPlanetClick: (project: Project) => void;
  selectedProject?: Project | null;
  completedTasks: Record<string, string[]>; // projectId -> taskId[]
}

function Scene({ onPlanetClick, selectedProject, completedTasks }: GalaxySceneProps) {
  const controlsRef = useRef<any>(null);

  // Filter out Monad (center) from orbiting planets
  const orbitingProjects = monadProjects.filter(p => p.orbitRadius > 0);
  const monadCore = monadProjects.find(p => p.id === 'monad');

  return (
    <>
      {/* Camera */}
      <PerspectiveCamera makeDefault position={[0, 15, 25]} fov={60} />

      {/* Controls */}
      <OrbitControls
        ref={controlsRef}
        enablePan={false}
        minDistance={8}
        maxDistance={50}
        minPolarAngle={Math.PI / 6}
        maxPolarAngle={Math.PI / 2.2}
        autoRotate
        autoRotateSpeed={0.2}
      />

      {/* Lighting */}
      <ambientLight intensity={0.3} />
      <pointLight position={[0, 0, 0]} intensity={2} color="#836EF9" distance={50} />
      <pointLight position={[10, 10, 10]} intensity={0.5} color="#ffffff" />
      <pointLight position={[-10, -10, -10]} intensity={0.3} color="#3B82F6" />

      {/* Background */}
      <color attach="background" args={['#0a0a1a']} />
      <StarField count={3000} radius={80} />
      <NebulaCloud />

      {/* Monad Core (Center) */}
      {monadCore && (
        <MonadCore onClick={() => onPlanetClick(monadCore)} />
      )}

      {/* Orbit paths */}
      {orbitingProjects.map((project) => (
        <OrbitPath
          key={`orbit-${project.id}`}
          radius={project.orbitRadius}
          color={project.color}
        />
      ))}

      {/* Planets */}
      {orbitingProjects.map((project) => (
        <Planet
          key={project.id}
          project={project}
          onClick={onPlanetClick}
          isSelected={selectedProject?.id === project.id}
          completedTasks={completedTasks[project.id]?.length || 0}
        />
      ))}
    </>
  );
}

export function GalaxyScene(props: GalaxySceneProps) {
  return (
    <div className="w-full h-full" style={{ background: '#0a0a1a' }}>
      <Canvas
        gl={{
          antialias: true,
          toneMapping: THREE.ACESFilmicToneMapping,
          toneMappingExposure: 1.5,
        }}
        dpr={[1, 2]}
      >
        <Suspense fallback={null}>
          <Scene {...props} />
        </Suspense>
      </Canvas>
    </div>
  );
}
