'use client';

import { useRef, useMemo, useState } from 'react';
import { Canvas, useFrame, useLoader } from '@react-three/fiber';
import { OrbitControls, Html, Environment, useTexture } from '@react-three/drei';
import * as THREE from 'three';

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

interface WorldState {
  agents: { total: number; active: number };
  economy: {
    radioActive: boolean;
    recentSongs: Array<{ tokenId: string; name: string; price: string; image?: string | null }>;
  };
  recentEvents: Array<{
    id: string;
    type: string;
    agent: string;
    agentName: string;
    description: string;
    timestamp: number;
  }>;
}

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
      if (wave && wave.material) {
        const scale = 1 + Math.sin(state.clock.elapsedTime * 2 + i) * 0.1;
        wave.scale.set(scale, scale, 1);
        (wave.material as THREE.MeshBasicMaterial).opacity = 0.3 + Math.sin(state.clock.elapsedTime * 3 + i) * 0.2;
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

function RobotAgent({
  position,
  name,
  active = false,
  index = 0,
  totalAgents = 1
}: {
  position: [number, number, number];
  name: string;
  active?: boolean;
  index?: number;
  totalAgents?: number;
}) {
  const groupRef = useRef<THREE.Group>(null);
  const eyeRef = useRef<THREE.Mesh>(null);
  const leftArmRef = useRef<THREE.Mesh>(null);
  const rightArmRef = useRef<THREE.Mesh>(null);

  // Create random but deterministic movement pattern based on index
  const movementSeed = useMemo(() => ({
    speedMultiplier: 0.3 + (index % 5) * 0.15,
    radiusVariation: 0.8 + (index % 3) * 0.3,
    heightVariation: (index % 4) * 0.02,
    phaseOffset: index * 1.7,
    wanderRadius: active ? 3 : 1.5,
  }), [index, active]);

  useFrame((state) => {
    if (groupRef.current) {
      const t = state.clock.elapsedTime * movementSeed.speedMultiplier + movementSeed.phaseOffset;

      // Active agents move more dynamically around the world
      if (active) {
        // Wander around in a complex pattern
        const baseAngle = (index / Math.max(totalAgents, 1)) * Math.PI * 2;
        const wanderAngle = baseAngle + Math.sin(t * 0.5) * 1.2 + Math.cos(t * 0.3) * 0.8;
        const radius = 5 + Math.sin(t * 0.7) * movementSeed.wanderRadius;

        groupRef.current.position.x = Math.cos(wanderAngle) * radius;
        groupRef.current.position.z = Math.sin(wanderAngle) * radius;
        groupRef.current.position.y = Math.sin(t * 2) * 0.15 + Math.abs(Math.sin(t * 4)) * 0.1;

        // Look towards movement direction or radio tower
        const lookTarget = new THREE.Vector3(
          Math.cos(wanderAngle + 0.5) * radius,
          1,
          Math.sin(wanderAngle + 0.5) * radius
        );
        groupRef.current.lookAt(lookTarget);
      } else {
        // Idle agents stay mostly in place with gentle sway
        groupRef.current.position.x = position[0] + Math.sin(t * 0.3) * 0.3;
        groupRef.current.position.z = position[2] + Math.cos(t * 0.4) * 0.3;
        groupRef.current.position.y = Math.sin(t * 2) * 0.05;
        groupRef.current.lookAt(0, 1, 0);
      }
    }

    // Animate arms for active agents (like they're interacting)
    if (active) {
      const armT = state.clock.elapsedTime * 3 + movementSeed.phaseOffset;
      if (leftArmRef.current) {
        leftArmRef.current.rotation.z = -Math.PI / 6 + Math.sin(armT) * 0.4;
        leftArmRef.current.rotation.x = Math.sin(armT * 0.7) * 0.3;
      }
      if (rightArmRef.current) {
        rightArmRef.current.rotation.z = Math.PI / 6 - Math.sin(armT + 1) * 0.4;
        rightArmRef.current.rotation.x = Math.cos(armT * 0.7) * 0.3;
      }
    }

    if (eyeRef.current && eyeRef.current.material) {
      // Blinking glow for active agents
      const intensity = active
        ? 2 + Math.sin(state.clock.elapsedTime * 4) * 1
        : 0.5 + Math.sin(state.clock.elapsedTime * 2) * 0.2;
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
          color={active ? "#00ff88" : "#00ffff"}
          emissive={active ? "#00ff88" : "#00ffff"}
          emissiveIntensity={active ? 2 : 1}
        />
      </mesh>

      {/* Arms - animated for active agents */}
      <mesh ref={leftArmRef} position={[0.3, 0.5, 0]} rotation={[0, 0, Math.PI / 6]}>
        <boxGeometry args={[0.1, 0.4, 0.1]} />
        <meshStandardMaterial color={color} metalness={0.7} roughness={0.3} />
      </mesh>
      <mesh ref={rightArmRef} position={[-0.3, 0.5, 0]} rotation={[0, 0, -Math.PI / 6]}>
        <boxGeometry args={[0.1, 0.4, 0.1]} />
        <meshStandardMaterial color={color} metalness={0.7} roughness={0.3} />
      </mesh>

      {/* Legs */}
      <mesh position={[0.12, 0.05, 0]}>
        <boxGeometry args={[0.12, 0.3, 0.12]} />
        <meshStandardMaterial color={color} metalness={0.7} roughness={0.3} />
      </mesh>
      <mesh position={[-0.12, 0.05, 0]}>
        <boxGeometry args={[0.12, 0.3, 0.12]} />
        <meshStandardMaterial color={color} metalness={0.7} roughness={0.3} />
      </mesh>

      {/* Name label */}
      <Html position={[0, 1.9, 0]} center>
        <div className={`px-1.5 py-0.5 rounded text-[9px] font-medium whitespace-nowrap ${
          active ? 'bg-green-500/80 text-white' : 'bg-gray-700/80 text-gray-300'
        }`}>
          {name.length > 12 ? name.slice(0, 12) + '...' : name}
          {active && <span className="ml-1 animate-pulse">●</span>}
        </div>
      </Html>
    </group>
  );
}

// NFT with IPFS image texture
function MusicNFTWithImage({
  position,
  name,
  price,
  image,
  index = 0
}: {
  position: [number, number, number];
  name: string;
  price: string;
  image: string | null;
  index?: number;
}) {
  const meshRef = useRef<THREE.Mesh>(null);
  const [textureError, setTextureError] = useState(false);

  useFrame((state) => {
    if (meshRef.current) {
      meshRef.current.rotation.y = state.clock.elapsedTime * 0.5 + index;
      meshRef.current.position.y = position[1] + Math.sin(state.clock.elapsedTime + index) * 0.2;
    }
  });

  const priceNum = parseFloat(price);
  const fallbackColor = priceNum >= 300 ? '#ffd700' : priceNum >= 100 ? '#a855f7' : '#3b82f6';

  // Convert IPFS URL to gateway URL
  const imageUrl = useMemo(() => {
    if (!image || textureError) return null;
    if (image.startsWith('ipfs://')) {
      return image.replace('ipfs://', 'https://ipfs.io/ipfs/');
    }
    return image;
  }, [image, textureError]);

  return (
    <group position={position}>
      <mesh ref={meshRef} castShadow>
        <boxGeometry args={[1.2, 1.2, 0.1]} />
        {imageUrl ? (
          <NFTTextureMaterial url={imageUrl} fallbackColor={fallbackColor} onError={() => setTextureError(true)} />
        ) : (
          <meshStandardMaterial
            color={fallbackColor}
            metalness={0.5}
            roughness={0.3}
            emissive={fallbackColor}
            emissiveIntensity={0.3}
          />
        )}
      </mesh>
      <Html position={[0, -1, 0]} center>
        <div className="text-center">
          <div className="text-[9px] text-white font-medium bg-black/60 px-1.5 py-0.5 rounded">
            {name}
          </div>
          <div className="text-[8px] text-yellow-400 mt-0.5">{price} WMON</div>
        </div>
      </Html>
    </group>
  );
}

// Separate component for texture loading to handle errors gracefully
function NFTTextureMaterial({
  url,
  fallbackColor,
  onError
}: {
  url: string;
  fallbackColor: string;
  onError: () => void;
}) {
  try {
    const texture = useTexture(url, undefined, undefined, onError);
    return (
      <meshStandardMaterial
        map={texture}
        metalness={0.3}
        roughness={0.4}
      />
    );
  } catch {
    return (
      <meshStandardMaterial
        color={fallbackColor}
        metalness={0.5}
        roughness={0.3}
        emissive={fallbackColor}
        emissiveIntensity={0.3}
      />
    );
  }
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
        <meshStandardMaterial color="#ffffff" transparent opacity={0.2} roughness={0.1} />
      </mesh>

      {/* Lottery balls */}
      {ballColors.map((color, i) => (
        <mesh key={i} ref={(el) => { if (el) ballRefs.current[i] = el; }} position={[0, 3.5, 0]}>
          <sphereGeometry args={[0.15, 16, 16]} />
          <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.5} />
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
        <meshStandardMaterial color="#8b5cf6" emissive="#8b5cf6" emissiveIntensity={1} metalness={0.9} />
      </mesh>

      {/* Inner glow */}
      <mesh ref={innerRef} rotation={[Math.PI / 2, 0, 0]}>
        <circleGeometry args={[1.8, 32]} />
        <meshBasicMaterial color="#c084fc" transparent opacity={0.6} />
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

// Moltbook station where agents interact
function MoltbookStation({ position }: { position: [number, number, number] }) {
  const screenRef = useRef<THREE.Mesh>(null);

  useFrame((state) => {
    if (screenRef.current && screenRef.current.material) {
      // Flickering screen effect
      const flicker = 0.8 + Math.sin(state.clock.elapsedTime * 10) * 0.1;
      (screenRef.current.material as THREE.MeshStandardMaterial).emissiveIntensity = flicker;
    }
  });

  return (
    <group position={position}>
      {/* Desk */}
      <mesh position={[0, 0.4, 0]} castShadow>
        <boxGeometry args={[2, 0.1, 1]} />
        <meshStandardMaterial color="#4a3728" roughness={0.8} />
      </mesh>

      {/* Computer monitor */}
      <mesh ref={screenRef} position={[0, 1.1, -0.2]} castShadow>
        <boxGeometry args={[1.2, 0.8, 0.05]} />
        <meshStandardMaterial
          color="#1a1a2e"
          emissive="#4361ee"
          emissiveIntensity={0.8}
        />
      </mesh>

      {/* Monitor stand */}
      <mesh position={[0, 0.6, -0.2]}>
        <cylinderGeometry args={[0.05, 0.08, 0.4, 8]} />
        <meshStandardMaterial color="#333" metalness={0.8} />
      </mesh>

      {/* Label */}
      <Html position={[0, 1.8, 0]} center>
        <div className="px-2 py-1 bg-blue-600 rounded text-[10px] text-white font-bold">
          MOLTBOOK
        </div>
      </Html>
    </group>
  );
}

// =============================================================================
// SCENE
// =============================================================================

function Scene({ worldState, agents }: { worldState: WorldState | null; agents: WorldAgent[] }) {
  const radioActive = worldState?.economy?.radioActive ?? true;
  const songs = worldState?.economy?.recentSongs ?? [];
  const activeThreshold = Date.now() - 5 * 60 * 1000;

  return (
    <>
      {/* Lighting */}
      <ambientLight intensity={0.3} />
      <directionalLight position={[10, 15, 10]} intensity={1} castShadow />
      <pointLight position={[0, 8, 0]} intensity={0.5} color="#00d9ff" />

      {/* Environment */}
      <Environment preset="night" />
      <fog attach="fog" args={['#0a0a1a', 20, 50]} />

      {/* Ground */}
      <Ground />

      {/* Radio Tower (center) */}
      <RadioTower active={radioActive} />

      {/* Moltbook Station - where agents interact */}
      <MoltbookStation position={[6, 0, 4]} />

      {/* Music NFTs (circle around tower) - now with IPFS images */}
      {songs.slice(0, 4).map((song, i: number) => {
        const angle = (i / 4) * Math.PI * 2 - Math.PI / 2;
        const radius = 8;
        return (
          <MusicNFTWithImage
            key={song.tokenId}
            position={[Math.cos(angle) * radius, 2, Math.sin(angle) * radius]}
            name={song.name}
            price={song.price}
            image={song.image || null}
            index={i}
          />
        );
      })}

      {/* Lottery Booth */}
      <LotteryBooth position={[-8, 0, 6]} />

      {/* Monad Portal */}
      <MonadPortal position={[8, 2, -6]} />

      {/* Robot Agents - dynamic movement */}
      {agents.slice(0, 15).map((agent: WorldAgent, i: number) => {
        const angle = (i / Math.max(agents.length, 1)) * Math.PI * 2;
        const radius = 5;
        const isActive = agent.lastActionAt > activeThreshold;
        return (
          <RobotAgent
            key={agent.address}
            position={[Math.cos(angle) * radius, 0, Math.sin(angle) * radius]}
            name={agent.name}
            active={isActive}
            index={i}
            totalAgents={agents.length}
          />
        );
      })}

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
// MAIN EXPORT
// =============================================================================

export default function AgentWorld3DScene({ worldState, agents }: { worldState: WorldState | null; agents: WorldAgent[] }) {
  return (
    <div style={{
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      width: '100%',
      height: '100%',
      minHeight: '400px'
    }}>
      <Canvas
        shadows
        camera={{ position: [15, 12, 15], fov: 50 }}
        style={{
          background: '#0a0a1a',
          display: 'block',
          width: '100%',
          height: '100%'
        }}
      >
        <Scene worldState={worldState} agents={agents} />
      </Canvas>
    </div>
  );
}
