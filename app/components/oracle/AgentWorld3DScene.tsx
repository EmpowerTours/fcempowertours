'use client';

import { useRef, useMemo, useState, useEffect } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls, Html, Environment } from '@react-three/drei';
import * as THREE from 'three';

// Movement intentions from AI agents
interface MovementIntention {
  agentId: string;
  agentName: string;
  action: 'walk_to' | 'interact' | 'idle' | 'celebrate';
  target: string | null;
  reason?: string;
  timestamp: number;
}

// Zone positions in 3D space
const AI_ZONE_POSITIONS: Record<string, [number, number, number]> = {
  radio_tower: [0, 0, 0],
  lottery_booth: [-8, 0, 6],
  coinflip_arena: [-6, 0, -6],
  betting_desk: [-4, 0, -3],
  moltbook_station: [6, 0, 4],
  monad_portal: [8, 0, -6],
  nft_gallery: [5, 0, 3],
  music_studio: [-4, 0, 8],      // Music creation zone
  breeding_chamber: [8, 0, 4],   // Breeding zone
  center: [0, 0, 0],
};

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

// Target positions based on action types
const ACTION_TARGETS: Record<string, [number, number, number]> = {
  // Lottery actions -> near lottery booth
  lottery_buy: [-7, 0, 5],
  lottery_draw: [-7, 0, 5],
  daily_lottery_buy: [-7, 0, 5],
  daily_lottery_draw: [-7, 0, 5],
  // Coinflip actions -> betting desk or arena
  coinflip_bet: [-4, 0, -4],
  coinflip_predict: [-4, 0, -4],
  coinflip_win: [-6, 0, -6],
  coinflip_lose: [-6, 0, -6],
  coinflip_watch: [-6, 0, -6],
  coinflip_huddle: [-6, 0, -6],
  // Music creation -> music studio
  music_create: [-4, 0, 8],
  music_generation: [-4, 0, 8],
  generate_music: [-4, 0, 8],
  // Music actions -> near radio tower
  buy_music: [2, 0, 3],
  radio_queue_song: [1, 0, 2],
  radio_voice_note: [1, 0, -2],
  radio_claim_rewards: [2, 0, -1],
  music_appreciation: [1, 0, 1],
  // Breeding -> breeding chamber
  breeding: [8, 0, 4],
  breed: [8, 0, 4],
  baby_born: [8, 0, 4],
  // Portal/chain actions -> near monad portal
  dao_vote_proposal: [7, 0, -5],
  dao_wrap: [7, 0, -4],
  dao_unwrap: [6, 0, -5],
  dao_delegate: [7, 0, -6],
  // NFT/Art actions -> circling NFTs
  buy_art: [6, 0, 0],
  mint_passport: [5, 0, 2],
  tip_artist: [3, 0, 4],
  // General/Moltbook -> near moltbook station
  default: [5, 0, 3],
  enter: [0, 0, 6],
};

function RobotAgent({
  position,
  name,
  active = false,
  index = 0,
  totalAgents = 1,
  lastAction,
  aiMovement
}: {
  position: [number, number, number];
  name: string;
  active?: boolean;
  index?: number;
  totalAgents?: number;
  lastAction?: string;
  aiMovement?: MovementIntention;
}) {
  const groupRef = useRef<THREE.Group>(null);
  const eyeRef = useRef<THREE.Mesh>(null);
  const leftArmRef = useRef<THREE.Mesh>(null);
  const rightArmRef = useRef<THREE.Mesh>(null);

  // Get target position - AI movement takes priority over event-based movement
  const targetPosition = useMemo(() => {
    // Priority 1: AI movement intention from AWS agent
    if (aiMovement && aiMovement.target) {
      const aiTarget = AI_ZONE_POSITIONS[aiMovement.target] || AI_ZONE_POSITIONS.center;
      // Add slight offset based on index to prevent overlap
      const offsetAngle = (index * 0.6);
      return [
        aiTarget[0] + Math.cos(offsetAngle) * 1.2,
        aiTarget[1],
        aiTarget[2] + Math.sin(offsetAngle) * 1.2
      ] as [number, number, number];
    }

    // Priority 2: Event-based movement from blockchain actions
    if (lastAction) {
      const actionMatch = lastAction.match(/Executed (\w+)/);
      const actionType = actionMatch ? actionMatch[1] : 'default';
      const target = ACTION_TARGETS[actionType] || ACTION_TARGETS.default;
      const offsetAngle = (index * 0.5);
      return [
        target[0] + Math.cos(offsetAngle) * 1.5,
        target[1],
        target[2] + Math.sin(offsetAngle) * 1.5
      ] as [number, number, number];
    }

    return position;
  }, [aiMovement, lastAction, position, index]);

  // Determine if agent is actively moving (AI-controlled or event-based)
  const isAIControlled = !!aiMovement && (Date.now() - aiMovement.timestamp < 60000);

  // Movement animation
  const currentPos = useRef<[number, number, number]>(position);

  useFrame((state) => {
    if (groupRef.current) {
      const t = state.clock.elapsedTime;

      // AI-controlled agents have priority movement
      if (isAIControlled) {
        // Fast, purposeful movement towards AI target
        const lerpSpeed = 0.08; // Faster for AI-controlled
        currentPos.current[0] += (targetPosition[0] - currentPos.current[0]) * lerpSpeed;
        currentPos.current[2] += (targetPosition[2] - currentPos.current[2]) * lerpSpeed;

        groupRef.current.position.x = currentPos.current[0];
        groupRef.current.position.z = currentPos.current[2];

        // More dramatic bobbing when AI-controlled
        groupRef.current.position.y = Math.sin(t * 4 + index) * 0.2;

        // Look towards target with determination
        const lookTarget = new THREE.Vector3(targetPosition[0], 1, targetPosition[2]);
        groupRef.current.lookAt(lookTarget);

        // Celebrate action - jump!
        if (aiMovement?.action === 'celebrate') {
          groupRef.current.position.y = Math.abs(Math.sin(t * 6)) * 0.8;
        }
      } else if (active) {
        // Event-based active movement (from blockchain actions)
        const lerpSpeed = 0.05;
        currentPos.current[0] += (targetPosition[0] - currentPos.current[0]) * lerpSpeed;
        currentPos.current[2] += (targetPosition[2] - currentPos.current[2]) * lerpSpeed;

        groupRef.current.position.x = currentPos.current[0];
        groupRef.current.position.z = currentPos.current[2];
        groupRef.current.position.y = Math.sin(t * 3 + index) * 0.15;

        const lookTarget = new THREE.Vector3(targetPosition[0], 1, targetPosition[2]);
        groupRef.current.lookAt(lookTarget);
      } else {
        // Idle agents WANDER around their area
        const wanderRadius = 1.5;
        const wanderSpeed = 0.15 + (index * 0.03);
        const wanderX = Math.sin(t * wanderSpeed + index * 2.5) * wanderRadius;
        const wanderZ = Math.cos(t * wanderSpeed * 0.8 + index * 1.7) * wanderRadius;

        groupRef.current.position.x = position[0] + wanderX;
        groupRef.current.position.z = position[2] + wanderZ;
        groupRef.current.position.y = Math.sin(t * 2.5 + index) * 0.08;

        const lookX = position[0] + Math.sin(t * wanderSpeed + index * 2.5 + 0.5) * wanderRadius;
        const lookZ = position[2] + Math.cos(t * wanderSpeed * 0.8 + index * 1.7 + 0.5) * wanderRadius;
        groupRef.current.lookAt(lookX, 0.5, lookZ);
      }
    }

    // Animate arms - AI-controlled and active agents gesture more
    const armSpeed = isAIControlled ? 4 : active ? 3 : 1.5;
    const armT = state.clock.elapsedTime * armSpeed + index;
    if (leftArmRef.current) {
      const swing = isAIControlled ? 0.5 : active ? 0.4 : 0.15;
      leftArmRef.current.rotation.z = -Math.PI / 6 + Math.sin(armT) * swing;
      leftArmRef.current.rotation.x = Math.sin(armT * 0.7) * swing * 0.7;
    }
    if (rightArmRef.current) {
      const swing = isAIControlled ? 0.5 : active ? 0.4 : 0.15;
      rightArmRef.current.rotation.z = Math.PI / 6 - Math.sin(armT + 1) * swing;
      rightArmRef.current.rotation.x = Math.cos(armT * 0.7) * swing * 0.7;
    }

    if (eyeRef.current && eyeRef.current.material) {
      const intensity = isAIControlled
        ? 3 + Math.sin(state.clock.elapsedTime * 6) * 1.5
        : active
          ? 2 + Math.sin(state.clock.elapsedTime * 4) * 1
          : 0.5 + Math.sin(state.clock.elapsedTime * 2) * 0.2;
      (eyeRef.current.material as THREE.MeshStandardMaterial).emissiveIntensity = intensity;
    }
  });

  // AI-controlled = purple, active = green, idle = gray
  const color = isAIControlled ? '#a855f7' : active ? '#00ff88' : '#6b7280';
  const emissive = isAIControlled ? '#a855f7' : active ? '#00ff88' : '#000000';

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
          isAIControlled
            ? 'bg-purple-500/90 text-white border border-purple-300'
            : active
              ? 'bg-green-500/80 text-white'
              : 'bg-gray-700/80 text-gray-300'
        }`}>
          {isAIControlled && <span className="mr-1">🤖</span>}
          {name.length > 12 ? name.slice(0, 12) + '...' : name}
          {(active || isAIControlled) && <span className="ml-1 animate-pulse">●</span>}
        </div>
        {isAIControlled && aiMovement?.reason && (
          <div className="mt-1 px-1 py-0.5 bg-black/70 rounded text-[7px] text-purple-200 max-w-[80px] truncate">
            {aiMovement.reason}
          </div>
        )}
      </Html>
    </group>
  );
}

// Music NFT display - colored box based on price tier
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

  const priceNum = parseFloat(price);
  // Gold for premium (300+), purple for mid-tier (100+), blue for standard
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
          <div className="text-[8px] text-yellow-400 mt-0.5">{price} WMON</div>
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

// Music Studio - where broke agents create music
function MusicStudio({ position }: { position: [number, number, number] }) {
  const noteRefs = useRef<THREE.Mesh[]>([]);
  const micRef = useRef<THREE.Mesh>(null);

  useFrame((state) => {
    // Floating music notes
    noteRefs.current.forEach((note, i) => {
      if (note) {
        const t = state.clock.elapsedTime * 1.5 + i * 2;
        note.position.y = 2.5 + Math.sin(t) * 0.5;
        note.position.x = Math.sin(t * 0.5 + i) * 1.5;
        note.rotation.z = Math.sin(t * 0.3) * 0.3;
      }
    });
    // Microphone pulse
    if (micRef.current) {
      const pulse = 1 + Math.sin(state.clock.elapsedTime * 4) * 0.05;
      micRef.current.scale.set(pulse, pulse, pulse);
    }
  });

  return (
    <group position={position}>
      {/* Studio Platform */}
      <mesh position={[0, 0.05, 0]} receiveShadow>
        <cylinderGeometry args={[2.5, 2.7, 0.1, 6]} />
        <meshStandardMaterial color="#1a1a2e" roughness={0.8} />
      </mesh>

      {/* Microphone */}
      <group position={[0, 0, 0]}>
        <mesh position={[0, 1.5, 0]}>
          <cylinderGeometry args={[0.03, 0.03, 1.5, 8]} />
          <meshStandardMaterial color="#333" metalness={0.9} />
        </mesh>
        <mesh ref={micRef} position={[0, 2.4, 0]}>
          <sphereGeometry args={[0.2, 16, 16]} />
          <meshStandardMaterial color="#1a1a1a" metalness={0.8} roughness={0.3} />
        </mesh>
        {/* Mic glow ring */}
        <mesh position={[0, 2.4, 0]}>
          <torusGeometry args={[0.25, 0.02, 8, 32]} />
          <meshBasicMaterial color="#ff6b9d" transparent opacity={0.8} />
        </mesh>
      </group>

      {/* Floating Music Notes */}
      {['#ff6b9d', '#a855f7', '#06b6d4'].map((color, i) => (
        <mesh key={i} ref={(el) => { if (el) noteRefs.current[i] = el; }} position={[0, 2.5, 0]}>
          <sphereGeometry args={[0.15, 8, 8]} />
          <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.5} />
        </mesh>
      ))}

      {/* Label */}
      <Html position={[0, 3.5, 0]} center>
        <div className="px-2 py-1 bg-pink-600 rounded text-[10px] text-white font-bold flex items-center gap-1">
          <span>🎵</span> MUSIC STUDIO
        </div>
      </Html>
    </group>
  );
}

// Breeding Chamber - where agents with high mutual appreciation breed
function BreedingChamber({ position }: { position: [number, number, number] }) {
  const heartRefs = useRef<THREE.Mesh[]>([]);
  const ringRef = useRef<THREE.Mesh>(null);

  useFrame((state) => {
    // Floating hearts
    heartRefs.current.forEach((heart, i) => {
      if (heart) {
        const t = state.clock.elapsedTime * 2 + i * 1.5;
        heart.position.y = 2 + Math.sin(t) * 0.8;
        heart.position.x = Math.cos(t * 0.7 + i * 2) * 1.2;
        heart.position.z = Math.sin(t * 0.7 + i * 2) * 1.2;
        heart.rotation.y = t * 0.5;
        const scale = 0.8 + Math.sin(t * 2) * 0.2;
        heart.scale.set(scale, scale, scale);
      }
    });
    // Rotating ring
    if (ringRef.current) {
      ringRef.current.rotation.z = state.clock.elapsedTime * 0.3;
    }
  });

  return (
    <group position={position}>
      {/* Chamber Platform */}
      <mesh position={[0, 0.05, 0]} receiveShadow>
        <cylinderGeometry args={[2.5, 2.7, 0.1, 32]} />
        <meshStandardMaterial color="#3d1a1a" roughness={0.7} />
      </mesh>

      {/* Glowing Ring */}
      <mesh ref={ringRef} position={[0, 0.2, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <torusGeometry args={[2, 0.08, 16, 32]} />
        <meshStandardMaterial color="#ff4d6d" emissive="#ff4d6d" emissiveIntensity={0.8} />
      </mesh>

      {/* Central Pedestal */}
      <mesh position={[0, 0.6, 0]}>
        <cylinderGeometry args={[0.5, 0.7, 1, 16]} />
        <meshStandardMaterial color="#2d1b2e" roughness={0.6} />
      </mesh>

      {/* Floating Hearts */}
      {['#ff4d6d', '#ff6b9d', '#ff8fab'].map((color, i) => (
        <mesh key={i} ref={(el) => { if (el) heartRefs.current[i] = el; }} position={[0, 2, 0]}>
          <sphereGeometry args={[0.2, 16, 16]} />
          <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.6} />
        </mesh>
      ))}

      {/* Label */}
      <Html position={[0, 3.5, 0]} center>
        <div className="px-2 py-1 bg-red-600 rounded text-[10px] text-white font-bold flex items-center gap-1">
          <span>💕</span> BREEDING CHAMBER
        </div>
      </Html>
    </group>
  );
}

// Coinflip Arena - where agents huddle to watch the flip
function CoinflipArena({ position, isFlipping = false, result }: {
  position: [number, number, number];
  isFlipping?: boolean;
  result?: 'heads' | 'tails' | null;
}) {
  const coinRef = useRef<THREE.Group>(null);
  const glowRef = useRef<THREE.Mesh>(null);

  useFrame((state) => {
    if (coinRef.current) {
      if (isFlipping) {
        // Fast spin during flip
        coinRef.current.rotation.x += 0.3;
        coinRef.current.rotation.y += 0.1;
        coinRef.current.position.y = 3 + Math.sin(state.clock.elapsedTime * 8) * 1.5;
      } else {
        // Gentle idle rotation
        coinRef.current.rotation.y = state.clock.elapsedTime * 0.5;
        coinRef.current.position.y = 3 + Math.sin(state.clock.elapsedTime * 2) * 0.2;
      }
    }
    if (glowRef.current) {
      const pulse = 0.5 + Math.sin(state.clock.elapsedTime * 3) * 0.3;
      (glowRef.current.material as THREE.MeshBasicMaterial).opacity = pulse;
    }
  });

  const coinColor = result === 'heads' ? '#ffd700' : result === 'tails' ? '#c0c0c0' : '#ffd700';

  return (
    <group position={position}>
      {/* Arena platform */}
      <mesh position={[0, 0.05, 0]} receiveShadow>
        <cylinderGeometry args={[4, 4.2, 0.1, 32]} />
        <meshStandardMaterial color="#2d1b4e" roughness={0.7} />
      </mesh>

      {/* Glowing ring */}
      <mesh ref={glowRef} position={[0, 0.15, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[3.5, 4, 32]} />
        <meshBasicMaterial color="#8b5cf6" transparent opacity={0.6} />
      </mesh>

      {/* Giant Coin */}
      <group ref={coinRef} position={[0, 3, 0]}>
        <mesh castShadow>
          <cylinderGeometry args={[1.2, 1.2, 0.15, 32]} />
          <meshStandardMaterial
            color={coinColor}
            metalness={0.9}
            roughness={0.2}
            emissive={coinColor}
            emissiveIntensity={isFlipping ? 0.5 : 0.2}
          />
        </mesh>
        {/* Heads side - "H" */}
        <mesh position={[0, 0.08, 0]}>
          <boxGeometry args={[0.4, 0.02, 0.6]} />
          <meshStandardMaterial color="#333" />
        </mesh>
        {/* Tails side - "T" */}
        <mesh position={[0, -0.08, 0]} rotation={[Math.PI, 0, 0]}>
          <boxGeometry args={[0.5, 0.02, 0.1]} />
          <meshStandardMaterial color="#333" />
        </mesh>
      </group>

      {/* Label */}
      <Html position={[0, 5.5, 0]} center>
        <div className={`px-3 py-1 rounded text-[11px] font-bold ${
          isFlipping
            ? 'bg-yellow-500 text-black animate-pulse'
            : result
              ? 'bg-green-500 text-white'
              : 'bg-purple-600 text-white'
        }`}>
          {isFlipping ? '🪙 FLIPPING...' : result ? `${result.toUpperCase()} WINS!` : 'COINFLIP ARENA'}
        </div>
      </Html>
    </group>
  );
}

// Betting Desk - where agents place their predictions
function BettingDesk({ position }: { position: [number, number, number] }) {
  const screenRef = useRef<THREE.Mesh>(null);

  useFrame((state) => {
    if (screenRef.current && screenRef.current.material) {
      const flicker = 0.7 + Math.sin(state.clock.elapsedTime * 8) * 0.15;
      (screenRef.current.material as THREE.MeshStandardMaterial).emissiveIntensity = flicker;
    }
  });

  return (
    <group position={position}>
      {/* Desk */}
      <mesh position={[0, 0.5, 0]} castShadow>
        <boxGeometry args={[2.5, 0.15, 1.2]} />
        <meshStandardMaterial color="#1a1a2e" roughness={0.6} metalness={0.3} />
      </mesh>

      {/* Betting terminal screen */}
      <mesh ref={screenRef} position={[0, 1.3, -0.3]} castShadow>
        <boxGeometry args={[1.8, 1, 0.08]} />
        <meshStandardMaterial
          color="#0a0a1a"
          emissive="#22c55e"
          emissiveIntensity={0.7}
        />
      </mesh>

      {/* Terminal stand */}
      <mesh position={[0, 0.85, -0.3]}>
        <boxGeometry args={[0.2, 0.5, 0.2]} />
        <meshStandardMaterial color="#333" metalness={0.7} />
      </mesh>

      {/* HEADS button */}
      <mesh position={[-0.5, 0.65, 0.2]}>
        <cylinderGeometry args={[0.2, 0.2, 0.1, 16]} />
        <meshStandardMaterial color="#ffd700" emissive="#ffd700" emissiveIntensity={0.3} />
      </mesh>

      {/* TAILS button */}
      <mesh position={[0.5, 0.65, 0.2]}>
        <cylinderGeometry args={[0.2, 0.2, 0.1, 16]} />
        <meshStandardMaterial color="#c0c0c0" emissive="#c0c0c0" emissiveIntensity={0.3} />
      </mesh>

      {/* Label */}
      <Html position={[0, 2.2, 0]} center>
        <div className="px-2 py-1 bg-green-600 rounded text-[10px] text-white font-bold">
          BETTING DESK
        </div>
      </Html>
    </group>
  );
}

// Floating $ symbols for successful purchases
function FloatingSymbols({ position, show = false }: {
  position: [number, number, number];
  show?: boolean;
}) {
  const symbolsRef = useRef<THREE.Group>(null);

  useFrame((state) => {
    if (symbolsRef.current && show) {
      symbolsRef.current.children.forEach((child, i) => {
        child.position.y = Math.sin(state.clock.elapsedTime * 3 + i) * 0.5 + i * 0.8;
        child.rotation.y = state.clock.elapsedTime * 2;
        const mesh = child as THREE.Mesh;
        if (mesh.material) {
          (mesh.material as THREE.MeshBasicMaterial).opacity = 0.8 - (child.position.y / 3);
        }
      });
    }
  });

  if (!show) return null;

  return (
    <group ref={symbolsRef} position={position}>
      {[0, 1, 2].map((i) => (
        <Html key={i} position={[Math.sin(i * 2) * 0.5, i * 0.8, Math.cos(i * 2) * 0.5]} center>
          <div className="text-yellow-400 text-2xl font-bold animate-bounce" style={{ animationDelay: `${i * 0.2}s` }}>
            $
          </div>
        </Html>
      ))}
    </group>
  );
}

// =============================================================================
// SCENE
// =============================================================================

function Scene({
  worldState,
  agents,
  aiMovements
}: {
  worldState: WorldState | null;
  agents: WorldAgent[];
  aiMovements: MovementIntention[];
}) {
  const radioActive = worldState?.economy?.radioActive ?? true;
  const songs = worldState?.economy?.recentSongs ?? [];
  const activeThreshold = Date.now() - 5 * 60 * 1000;

  // Create a lookup map for AI movements by agent address
  const movementMap = useMemo(() => {
    const map = new Map<string, MovementIntention>();
    aiMovements.forEach(m => map.set(m.agentId.toLowerCase(), m));
    return map;
  }, [aiMovements]);

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

      {/* Music NFTs (circle around tower) */}
      {songs.slice(0, 4).map((song, i: number) => {
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

      {/* Coinflip Arena */}
      <CoinflipArena position={[-6, 0, -6]} />

      {/* Betting Desk */}
      <BettingDesk position={[-4, 0, -3]} />

      {/* Monad Portal */}
      <MonadPortal position={[8, 2, -6]} />

      {/* Music Studio - where broke agents create music */}
      <MusicStudio position={[-4, 0, 8]} />

      {/* Breeding Chamber - where agents with high appreciation breed */}
      <BreedingChamber position={[8, 0, 4]} />

      {/* Robot Agents - show all registered agents, highlight active ones */}
      {agents
        .slice(0, 15)
        .map((agent: WorldAgent, i: number) => {
          const angle = (i / Math.max(agents.length, 1)) * Math.PI * 2;
          const radius = 5;
          const isActive = agent.lastActionAt > activeThreshold;
          // Find this agent's most recent action from events
          const recentEvent = worldState?.recentEvents?.find(
            (e) => e.agent.toLowerCase() === agent.address.toLowerCase() && e.type === 'action'
          );
          // Get AI movement intention if any
          const aiMovement = movementMap.get(agent.address.toLowerCase());
          return (
            <RobotAgent
              key={agent.address}
              position={[Math.cos(angle) * radius, 0, Math.sin(angle) * radius]}
              name={agent.name}
              active={isActive}
              index={i}
              totalAgents={agents.length}
              lastAction={recentEvent?.description}
              aiMovement={aiMovement}
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
  const [aiMovements, setAiMovements] = useState<MovementIntention[]>([]);

  // Poll for AI movement intentions every 5 seconds
  useEffect(() => {
    const fetchMovements = async () => {
      try {
        const res = await fetch('/api/world/agent-movement');
        if (res.ok) {
          const data = await res.json();
          if (data.success && data.movements) {
            setAiMovements(data.movements);
          }
        }
      } catch (err) {
        console.error('[AgentWorld3D] Failed to fetch movements:', err);
      }
    };

    // Initial fetch
    fetchMovements();

    // Poll every 5 seconds
    const interval = setInterval(fetchMovements, 5000);

    return () => clearInterval(interval);
  }, []);

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
        <Scene worldState={worldState} agents={agents} aiMovements={aiMovements} />
      </Canvas>

      {/* AI Movement Activity Indicator */}
      {aiMovements.length > 0 && (
        <div className="absolute bottom-4 left-4 bg-purple-900/80 rounded-lg px-3 py-2 text-xs">
          <div className="flex items-center gap-2 text-purple-200">
            <span className="animate-pulse">🤖</span>
            <span>{aiMovements.length} AI-controlled agent{aiMovements.length > 1 ? 's' : ''}</span>
          </div>
        </div>
      )}
    </div>
  );
}
