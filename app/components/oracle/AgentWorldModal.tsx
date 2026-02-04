'use client';

import React, { useRef, useMemo, useEffect, useState, Suspense } from 'react';
import { createPortal } from 'react-dom';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls, Text, Html, Environment } from '@react-three/drei';
import * as THREE from 'three';
import { X, Minimize2, Maximize2, Radio, Users, Loader2, RefreshCw } from 'lucide-react';
import useSWR from 'swr';

// =============================================================================
// TYPES
// =============================================================================

interface WorldAgent {
  address: string;
  name: string;
  lastActionAt: number;
  totalActions: number;
  toursEarned: string;
}

interface WorldEvent {
  id: string;
  type: 'enter' | 'action' | 'chat' | 'achievement';
  agent: string;
  agentName: string;
  description: string;
  timestamp: number;
}

interface WorldState {
  agents: { total: number; active: number };
  economy: {
    radioActive: boolean;
    recentSongs: Array<{ tokenId: string; name: string; price: string }>;
  };
  recentEvents: WorldEvent[];
}

interface AgentWorldModalProps {
  onClose: () => void;
  isDarkMode?: boolean;
  minimized?: boolean;
  setMinimized?: (v: boolean) => void;
}

// =============================================================================
// API FETCHER
// =============================================================================

const fetcher = (url: string) => fetch(url).then(res => res.json());

// =============================================================================
// 3D COMPONENTS
// =============================================================================

function Ground() {
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.1, 0]} receiveShadow>
      <circleGeometry args={[30, 64]} />
      <meshStandardMaterial color="#1a3d1a" roughness={0.9} />
    </mesh>
  );
}

function RadioTower({ active = true }: { active?: boolean }) {
  const waveRefs = useRef<THREE.Mesh[]>([]);

  useFrame((state) => {
    if (!active) return;
    waveRefs.current.forEach((wave, i) => {
      if (wave) {
        const scale = 1 + Math.sin(state.clock.elapsedTime * 2 + i) * 0.1;
        wave.scale.set(scale, scale, 1);
        const mat = wave.material as THREE.MeshBasicMaterial;
        if (mat) mat.opacity = 0.3 + Math.sin(state.clock.elapsedTime * 3 + i) * 0.2;
      }
    });
  });

  return (
    <group position={[0, 0, 0]}>
      {/* Main pole */}
      <mesh position={[0, 4, 0]} castShadow>
        <cylinderGeometry args={[0.15, 0.2, 8, 16]} />
        <meshStandardMaterial color="#4a5568" metalness={0.8} roughness={0.3} />
      </mesh>

      {/* Antenna */}
      <mesh position={[0, 8.5, 0]}>
        <coneGeometry args={[0.3, 1, 16]} />
        <meshStandardMaterial color="#4a5568" metalness={0.8} roughness={0.3} />
      </mesh>

      {/* Radio waves */}
      {active && [0, 1, 2].map((i) => (
        <mesh
          key={i}
          ref={(el) => { if (el) waveRefs.current[i] = el; }}
          position={[0, 7 - i * 0.3, 0]}
          rotation={[Math.PI / 2, 0, 0]}
        >
          <torusGeometry args={[1 + i * 0.8, 0.03, 8, 32]} />
          <meshBasicMaterial color="#00d9ff" transparent opacity={0.5} />
        </mesh>
      ))}

      {/* "LIVE" label */}
      {active && (
        <Html position={[0, 9.5, 0]} center>
          <div className="px-2 py-0.5 bg-red-500 rounded text-[10px] text-white font-bold animate-pulse">
            LIVE
          </div>
        </Html>
      )}
    </group>
  );
}

function AgentAvatar({
  position,
  name,
  active = false,
  index = 0
}: {
  position: [number, number, number];
  name: string;
  active?: boolean;
  index?: number;
}) {
  const groupRef = useRef<THREE.Group>(null);
  const eyeRef = useRef<THREE.Mesh>(null);

  useFrame((state) => {
    if (groupRef.current) {
      // Gentle bobbing
      groupRef.current.position.y = position[1] + Math.sin(state.clock.elapsedTime * 2 + index) * 0.05;
      // Look towards center
      groupRef.current.lookAt(0, 1, 0);
    }
    if (eyeRef.current && active) {
      // Blinking glow for active agents
      const intensity = 2 + Math.sin(state.clock.elapsedTime * 4) * 1;
      (eyeRef.current.material as THREE.MeshStandardMaterial).emissiveIntensity = intensity;
    }
  });

  const color = active ? '#00ff88' : '#6b7280';
  const emissive = active ? '#00ff88' : '#000000';

  return (
    <group ref={groupRef} position={position}>
      {/* Body */}
      <mesh position={[0, 0.5, 0]} castShadow>
        <boxGeometry args={[0.4, 0.6, 0.3]} />
        <meshStandardMaterial
          color={color}
          metalness={0.7}
          roughness={0.3}
          emissive={emissive}
          emissiveIntensity={active ? 0.3 : 0}
        />
      </mesh>

      {/* Head */}
      <mesh position={[0, 1.1, 0]} castShadow>
        <sphereGeometry args={[0.25, 16, 16]} />
        <meshStandardMaterial
          color={color}
          metalness={0.7}
          roughness={0.3}
          emissive={emissive}
          emissiveIntensity={active ? 0.3 : 0}
        />
      </mesh>

      {/* Eyes */}
      <mesh ref={eyeRef} position={[0.08, 1.15, 0.2]}>
        <sphereGeometry args={[0.05, 8, 8]} />
        <meshStandardMaterial
          color="#00ffff"
          emissive="#00ffff"
          emissiveIntensity={active ? 2 : 0.5}
        />
      </mesh>
      <mesh position={[-0.08, 1.15, 0.2]}>
        <sphereGeometry args={[0.05, 8, 8]} />
        <meshStandardMaterial
          color="#00ffff"
          emissive="#00ffff"
          emissiveIntensity={active ? 2 : 0.5}
        />
      </mesh>

      {/* Antenna */}
      <mesh position={[0, 1.45, 0]}>
        <cylinderGeometry args={[0.02, 0.02, 0.2, 8]} />
        <meshStandardMaterial color={color} metalness={0.8} />
      </mesh>
      <mesh position={[0, 1.6, 0]}>
        <sphereGeometry args={[0.04, 8, 8]} />
        <meshStandardMaterial
          color="#00ffff"
          emissive="#00ffff"
          emissiveIntensity={1}
        />
      </mesh>

      {/* Name label */}
      <Html position={[0, 1.9, 0]} center>
        <div className={`px-1.5 py-0.5 rounded text-[9px] font-medium whitespace-nowrap ${
          active ? 'bg-green-500/80 text-white' : 'bg-gray-700/80 text-gray-300'
        }`}>
          {name.length > 12 ? name.slice(0, 12) + '...' : name}
        </div>
      </Html>
    </group>
  );
}

function MusicNFT({
  position,
  name,
  price,
  index = 0
}: {
  position: [number, number, number];
  name: string;
  price: string;
  index?: number;
}) {
  const meshRef = useRef<THREE.Mesh>(null);

  useFrame((state) => {
    if (meshRef.current) {
      meshRef.current.rotation.y = state.clock.elapsedTime * 0.5 + index;
      meshRef.current.position.y = position[1] + Math.sin(state.clock.elapsedTime + index) * 0.2;
    }
  });

  // Color based on price
  const priceNum = parseFloat(price);
  const color = priceNum >= 300 ? '#ffd700' : priceNum >= 100 ? '#a855f7' : '#3b82f6';

  return (
    <group position={position}>
      <mesh ref={meshRef} castShadow>
        <boxGeometry args={[1.2, 1.2, 0.1]} />
        <meshStandardMaterial
          color={color}
          metalness={0.5}
          roughness={0.3}
          emissive={color}
          emissiveIntensity={0.3}
        />
      </mesh>
      <Html position={[0, -1, 0]} center>
        <div className="text-center">
          <div className="text-[9px] text-white font-medium bg-black/60 px-1.5 py-0.5 rounded">
            {name}
          </div>
          <div className="text-[8px] text-yellow-400 mt-0.5">
            {price} WMON
          </div>
        </div>
      </Html>
    </group>
  );
}

function LotteryBooth({ position }: { position: [number, number, number] }) {
  const ballRefs = useRef<THREE.Mesh[]>([]);

  useFrame((state) => {
    ballRefs.current.forEach((ball, i) => {
      if (ball) {
        const t = state.clock.elapsedTime * 2 + i * 1.5;
        ball.position.x = Math.sin(t) * 0.4;
        ball.position.z = Math.cos(t) * 0.4;
        ball.position.y = 3.5 + Math.sin(t * 1.5) * 0.3;
      }
    });
  });

  const ballColors = ['#ef4444', '#22c55e', '#3b82f6', '#eab308', '#a855f7'];

  return (
    <group position={position}>
      {/* Booth base */}
      <mesh position={[0, 1, 0]} castShadow>
        <boxGeometry args={[2, 2, 2]} />
        <meshStandardMaterial color="#dc2626" roughness={0.6} />
      </mesh>

      {/* Glass sphere */}
      <mesh position={[0, 3.5, 0]}>
        <sphereGeometry args={[1, 32, 32]} />
        <meshStandardMaterial
          color="#ffffff"
          transparent
          opacity={0.2}
          roughness={0.1}
          metalness={0.1}
        />
      </mesh>

      {/* Lottery balls */}
      {ballColors.map((color, i) => (
        <mesh
          key={i}
          ref={(el) => { if (el) ballRefs.current[i] = el; }}
          position={[0, 3.5, 0]}
        >
          <sphereGeometry args={[0.15, 16, 16]} />
          <meshStandardMaterial
            color={color}
            emissive={color}
            emissiveIntensity={0.5}
          />
        </mesh>
      ))}

      {/* Label */}
      <Html position={[0, 5, 0]} center>
        <div className="px-2 py-1 bg-yellow-500 rounded text-[10px] text-black font-bold">
          LOTTERY
        </div>
      </Html>
    </group>
  );
}

function MonadPortal({ position }: { position: [number, number, number] }) {
  const ringRef = useRef<THREE.Mesh>(null);
  const innerRef = useRef<THREE.Mesh>(null);

  useFrame((state) => {
    if (ringRef.current) {
      ringRef.current.rotation.z = state.clock.elapsedTime * 0.5;
    }
    if (innerRef.current) {
      const pulse = 0.8 + Math.sin(state.clock.elapsedTime * 2) * 0.2;
      innerRef.current.scale.set(pulse, pulse, 1);
    }
  });

  return (
    <group position={position}>
      {/* Outer ring */}
      <mesh ref={ringRef} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[2, 0.15, 16, 32]} />
        <meshStandardMaterial
          color="#8b5cf6"
          emissive="#8b5cf6"
          emissiveIntensity={1}
          metalness={0.9}
        />
      </mesh>

      {/* Inner glow */}
      <mesh ref={innerRef} rotation={[Math.PI / 2, 0, 0]}>
        <circleGeometry args={[1.8, 32]} />
        <meshBasicMaterial
          color="#c084fc"
          transparent
          opacity={0.6}
        />
      </mesh>

      {/* Label */}
      <Html position={[0, 3, 0]} center>
        <div className="px-2 py-1 bg-purple-600 rounded text-[10px] text-white font-bold">
          MONAD PORTAL
        </div>
      </Html>
    </group>
  );
}

function EventParticle({
  event,
  index
}: {
  event: WorldEvent;
  index: number;
}) {
  const meshRef = useRef<THREE.Mesh>(null);
  const startTime = useRef(Date.now());

  useFrame(() => {
    if (meshRef.current) {
      const age = (Date.now() - startTime.current) / 1000;
      meshRef.current.position.y = 10 + index * 1.5 + age * 0.5;
      meshRef.current.rotation.y += 0.02;
      // Fade out over time
      const opacity = Math.max(0, 1 - age / 10);
      (meshRef.current.material as THREE.MeshBasicMaterial).opacity = opacity;
    }
  });

  const color = event.type === 'enter' ? '#22c55e' :
                event.type === 'action' ? '#eab308' : '#3b82f6';

  return (
    <mesh ref={meshRef} position={[Math.sin(index) * 2, 10 + index * 1.5, Math.cos(index) * 2]}>
      <icosahedronGeometry args={[0.2, 0]} />
      <meshBasicMaterial color={color} transparent opacity={0.8} />
    </mesh>
  );
}

function Scene({ worldState, agents }: { worldState: WorldState | null; agents: WorldAgent[] }) {
  const radioActive = worldState?.economy?.radioActive ?? true;
  const songs = worldState?.economy?.recentSongs ?? [];
  const events = worldState?.recentEvents ?? [];
  const activeThreshold = Date.now() - 5 * 60 * 1000;

  return (
    <>
      {/* Lighting */}
      <ambientLight intensity={0.3} />
      <directionalLight
        position={[10, 15, 10]}
        intensity={1}
        castShadow
        shadow-mapSize={[1024, 1024]}
      />
      <pointLight position={[0, 8, 0]} intensity={0.5} color="#00d9ff" />

      {/* Environment */}
      <Environment preset="night" />
      <fog attach="fog" args={['#0a0a1a', 20, 50]} />

      {/* Ground */}
      <Ground />

      {/* Radio Tower (center) */}
      <RadioTower active={radioActive} />

      {/* Music NFTs (circle around tower) */}
      {songs.slice(0, 4).map((song, i) => {
        const angle = (i / 4) * Math.PI * 2 - Math.PI / 2;
        const radius = 8;
        return (
          <MusicNFT
            key={song.tokenId}
            position={[Math.cos(angle) * radius, 2, Math.sin(angle) * radius]}
            name={song.name}
            price={song.price}
            index={i}
          />
        );
      })}

      {/* Lottery Booth */}
      <LotteryBooth position={[-8, 0, 6]} />

      {/* Monad Portal */}
      <MonadPortal position={[8, 2, -6]} />

      {/* Agent Avatars */}
      {agents.slice(0, 10).map((agent, i) => {
        const angle = (i / Math.max(agents.length, 1)) * Math.PI * 2;
        const radius = 5;
        const isActive = agent.lastActionAt > activeThreshold;
        return (
          <AgentAvatar
            key={agent.address}
            position={[Math.cos(angle) * radius, 0, Math.sin(angle) * radius]}
            name={agent.name}
            active={isActive}
            index={i}
          />
        );
      })}

      {/* Event Particles */}
      {events.slice(0, 5).map((event, i) => (
        <EventParticle key={event.id} event={event} index={i} />
      ))}

      {/* Controls */}
      <OrbitControls
        enablePan={false}
        minDistance={8}
        maxDistance={30}
        minPolarAngle={Math.PI / 6}
        maxPolarAngle={Math.PI / 2.5}
        target={[0, 2, 0]}
      />
    </>
  );
}

// =============================================================================
// MAIN COMPONENT
// =============================================================================

export function AgentWorldModal({
  onClose,
  isDarkMode = true,
  minimized = false,
  setMinimized
}: AgentWorldModalProps) {
  const [mounted, setMounted] = useState(false);

  // Fetch world state
  const { data: stateData, error: stateError, isLoading: stateLoading, mutate: refreshState } = useSWR(
    '/api/world/state',
    fetcher,
    { refreshInterval: 10000 } // Refresh every 10s
  );

  // Fetch agents
  const { data: agentsData, error: agentsError, isLoading: agentsLoading, mutate: refreshAgents } = useSWR(
    '/api/world/agents',
    fetcher,
    { refreshInterval: 10000 }
  );

  useEffect(() => {
    setMounted(true);
  }, []);

  const worldState = stateData?.success ? stateData.state : null;
  const agents = agentsData?.success ? agentsData.agents : [];
  const isLoading = stateLoading || agentsLoading;
  const hasError = stateError || agentsError;

  const handleRefresh = () => {
    refreshState();
    refreshAgents();
  };

  if (!mounted) return null;

  // Minimized view
  if (minimized) {
    return createPortal(
      <div
        className="fixed bottom-20 right-4 z-[9999]"
        style={{ pointerEvents: 'auto' }}
      >
        <button
          onClick={() => setMinimized?.(false)}
          className="flex items-center gap-2 px-3 py-2 bg-purple-600 hover:bg-purple-500 rounded-full text-white text-sm font-medium shadow-lg transition-all"
        >
          <Users className="w-4 h-4" />
          Agent World
          <span className="bg-white/20 px-1.5 py-0.5 rounded text-xs">
            {worldState?.agents?.total || 0}
          </span>
          <Maximize2 className="w-3 h-3" />
        </button>
      </div>,
      document.body
    );
  }

  // Full modal
  return createPortal(
    <div
      className="fixed inset-0 z-[9998] flex items-center justify-center p-4"
      style={{ backgroundColor: 'rgba(0,0,0,0.95)' }}
    >
      <div
        className={`relative w-full max-w-4xl h-[80vh] rounded-2xl overflow-hidden ${
          isDarkMode ? 'bg-gray-900 border border-purple-500/30' : 'bg-white border border-gray-200'
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className={`absolute top-0 left-0 right-0 z-10 flex items-center justify-between px-4 py-3 ${
          isDarkMode ? 'bg-gray-900/80' : 'bg-white/80'
        } backdrop-blur-sm border-b ${isDarkMode ? 'border-gray-700' : 'border-gray-200'}`}>
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-gradient-to-r from-purple-500 to-cyan-500 flex items-center justify-center">
              <Users className="w-4 h-4 text-white" />
            </div>
            <div>
              <h2 className={`text-lg font-bold ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>
                Agent World
              </h2>
              <p className={`text-xs ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                {worldState?.agents?.total || 0} agents registered
                {worldState?.economy?.radioActive && ' • Radio Live'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Stats */}
            <div className={`flex items-center gap-3 px-3 py-1.5 rounded-full text-xs ${
              isDarkMode ? 'bg-gray-800' : 'bg-gray-100'
            }`}>
              <div className="flex items-center gap-1">
                <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                <span className={isDarkMode ? 'text-gray-300' : 'text-gray-600'}>
                  {worldState?.agents?.active || 0} active
                </span>
              </div>
              <div className="flex items-center gap-1">
                <Radio className="w-3 h-3 text-cyan-500" />
                <span className={isDarkMode ? 'text-gray-300' : 'text-gray-600'}>
                  {worldState?.economy?.recentSongs?.length || 0} songs
                </span>
              </div>
            </div>

            {/* Refresh */}
            <button
              onClick={handleRefresh}
              className={`p-2 rounded-full transition-colors ${
                isDarkMode ? 'hover:bg-gray-800 text-gray-400' : 'hover:bg-gray-100 text-gray-600'
              }`}
              title="Refresh"
            >
              <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
            </button>

            {/* Minimize */}
            {setMinimized && (
              <button
                onClick={() => setMinimized(true)}
                className={`p-2 rounded-full transition-colors ${
                  isDarkMode ? 'hover:bg-gray-800 text-gray-400' : 'hover:bg-gray-100 text-gray-600'
                }`}
                title="Minimize"
              >
                <Minimize2 className="w-4 h-4" />
              </button>
            )}

            {/* Close */}
            <button
              onClick={onClose}
              className={`p-2 rounded-full transition-colors ${
                isDarkMode ? 'hover:bg-gray-800 text-gray-400' : 'hover:bg-gray-100 text-gray-600'
              }`}
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* 3D Canvas */}
        <div className="w-full h-full pt-14">
          {hasError ? (
            <div className="w-full h-full flex items-center justify-center">
              <div className="text-center">
                <p className="text-red-400 mb-2">Failed to load world data</p>
                <button
                  onClick={handleRefresh}
                  className="px-4 py-2 bg-purple-600 hover:bg-purple-500 rounded-lg text-white text-sm"
                >
                  Retry
                </button>
              </div>
            </div>
          ) : (
            <Suspense fallback={
              <div className="w-full h-full flex items-center justify-center bg-gray-900">
                <div className="text-center">
                  <Loader2 className="w-8 h-8 text-purple-500 animate-spin mx-auto mb-2" />
                  <p className="text-gray-400 text-sm">Loading Agent World...</p>
                </div>
              </div>
            }>
              <Canvas
                shadows
                camera={{ position: [15, 12, 15], fov: 50 }}
                style={{ background: '#0a0a1a' }}
              >
                <Scene worldState={worldState} agents={agents} />
              </Canvas>
            </Suspense>
          )}
        </div>

        {/* Event Feed */}
        <div className={`absolute bottom-0 left-0 right-0 z-10 px-4 py-2 ${
          isDarkMode ? 'bg-gray-900/80' : 'bg-white/80'
        } backdrop-blur-sm border-t ${isDarkMode ? 'border-gray-700' : 'border-gray-200'}`}>
          <div className="flex items-center gap-2 overflow-x-auto">
            <span className={`text-xs font-medium ${isDarkMode ? 'text-gray-500' : 'text-gray-400'}`}>
              Recent:
            </span>
            {(worldState?.recentEvents || []).slice(0, 3).map((event: WorldEvent) => (
              <div
                key={event.id}
                className={`flex-shrink-0 px-2 py-1 rounded-full text-xs ${
                  event.type === 'enter'
                    ? 'bg-green-500/20 text-green-400'
                    : event.type === 'action'
                    ? 'bg-yellow-500/20 text-yellow-400'
                    : 'bg-blue-500/20 text-blue-400'
                }`}
              >
                {event.agentName}: {event.description.slice(0, 30)}...
              </div>
            ))}
            {(!worldState?.recentEvents || worldState.recentEvents.length === 0) && (
              <span className={`text-xs ${isDarkMode ? 'text-gray-600' : 'text-gray-400'}`}>
                No recent events
              </span>
            )}
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
