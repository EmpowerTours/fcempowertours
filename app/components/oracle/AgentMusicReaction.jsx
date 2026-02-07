'use client';

import { useRef, useState, useEffect, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import * as THREE from 'three';

/**
 * AgentMusicReaction - Agent Reaction Animations for AgentWorld Radio
 *
 * Different reactions based on agent personality + track entropy:
 * - Chaos Agent: Wild dancing movements for high entropy tracks
 * - Conservative Agent: Subtle nodding for steady beats
 * - Whale Agent: Big tip animation (throwing WMON)
 * - Degen Agent: Erratic movements, loves chaos
 * - Normie Agent: Standard reactions
 *
 * Each agent reacts differently based on their personality matching the track's entropy.
 */

// =============================================================================
// REACTION DEFINITIONS
// =============================================================================

const REACTION_CONFIGS = {
  dancing: {
    armSwing: 0.8,
    bodyBob: 0.4,
    headBob: 0.3,
    rotationSpeed: 2,
    jumpHeight: 0.5,
    emoji: '💃',
  },
  nodding: {
    armSwing: 0.1,
    bodyBob: 0.05,
    headBob: 0.2,
    rotationSpeed: 0,
    jumpHeight: 0,
    emoji: '👍',
  },
  tipping: {
    armSwing: 0.3,
    bodyBob: 0.1,
    headBob: 0.1,
    rotationSpeed: 0,
    jumpHeight: 0.2,
    emoji: '💰',
  },
  cheering: {
    armSwing: 0.6,
    bodyBob: 0.3,
    headBob: 0.25,
    rotationSpeed: 0.5,
    jumpHeight: 0.3,
    emoji: '🎉',
  },
  idle: {
    armSwing: 0.05,
    bodyBob: 0.02,
    headBob: 0.05,
    rotationSpeed: 0,
    jumpHeight: 0,
    emoji: '😐',
  },
};

const PERSONALITY_COLORS = {
  chaos: '#ff00ff',    // Magenta
  conservative: '#3b82f6', // Blue
  whale: '#ffd700',    // Gold
  degen: '#ff4500',    // Orange-Red
  normie: '#9ca3af',   // Gray
};

// =============================================================================
// FLOATING PARTICLES (for tip animation)
// =============================================================================

function TipParticles({ active = false, amount = '1', color = '#ffd700' }) {
  const particlesRef = useRef([]);
  const [particles, setParticles] = useState([]);

  useEffect(() => {
    if (active) {
      // Create new particles
      const newParticles = Array.from({ length: 8 }, (_, i) => ({
        id: Date.now() + i,
        angle: (i / 8) * Math.PI * 2,
        speed: 0.5 + Math.random() * 0.5,
        delay: i * 0.1,
      }));
      setParticles(newParticles);

      // Clear after animation
      const timeout = setTimeout(() => setParticles([]), 2000);
      return () => clearTimeout(timeout);
    }
  }, [active]);

  useFrame((state) => {
    particlesRef.current.forEach((ref, i) => {
      if (!ref) return;
      const p = particles[i];
      if (!p) return;

      const t = state.clock.elapsedTime - p.delay;
      if (t < 0) {
        ref.visible = false;
        return;
      }
      ref.visible = true;

      // Float up and outward
      ref.position.x = Math.cos(p.angle) * t * p.speed;
      ref.position.y = t * 1.5 - 0.5 * t * t; // Parabolic arc
      ref.position.z = Math.sin(p.angle) * t * p.speed;

      // Fade out
      const opacity = Math.max(0, 1 - t / 1.5);
      if (ref.material) ref.material.opacity = opacity;
    });
  });

  if (particles.length === 0) return null;

  return (
    <group>
      {particles.map((p, i) => (
        <mesh
          key={p.id}
          ref={(el) => { if (el) particlesRef.current[i] = el; }}
          position={[0, 0, 0]}
        >
          <sphereGeometry args={[0.08, 8, 8]} />
          <meshBasicMaterial
            color={color}
            transparent
            opacity={1}
          />
        </mesh>
      ))}
      {/* Tip amount label */}
      <Html position={[0, 1.5, 0]} center>
        <div className="text-yellow-400 text-lg font-bold animate-bounce">
          +{amount} WMON
        </div>
      </Html>
    </group>
  );
}

// =============================================================================
// REACTION EFFECT (visual burst)
// =============================================================================

function ReactionBurst({ reaction, color }) {
  const ringRef = useRef(null);
  const [visible, setVisible] = useState(true);

  useFrame((state) => {
    if (!ringRef.current) return;

    // Expand and fade
    const scale = ringRef.current.scale.x;
    if (scale < 3) {
      ringRef.current.scale.set(scale + 0.05, scale + 0.05, 1);
      ringRef.current.material.opacity = Math.max(0, 1 - scale / 3);
    } else {
      setVisible(false);
    }
  });

  if (!visible) return null;

  return (
    <mesh ref={ringRef} position={[0, 1, 0]} rotation={[-Math.PI / 2, 0, 0]}>
      <ringGeometry args={[0.5, 0.6, 32]} />
      <meshBasicMaterial
        color={color}
        transparent
        opacity={1}
        side={THREE.DoubleSide}
      />
    </mesh>
  );
}

// =============================================================================
// MAIN COMPONENT
// =============================================================================

export default function AgentMusicReaction({
  agentRef, // Reference to the agent's group for applying animations
  personality = 'normie',
  reaction = 'idle',
  appreciationScore = 50,
  trackEntropy = 50,
  agentName = 'Agent',
  showLabel = true,
  onTip,
}) {
  const reactionGroupRef = useRef(null);
  const leftArmRef = useRef(null);
  const rightArmRef = useRef(null);
  const headRef = useRef(null);

  const [showTipParticles, setShowTipParticles] = useState(false);
  const [reactionKey, setReactionKey] = useState(0);

  // Get reaction config
  const config = REACTION_CONFIGS[reaction] || REACTION_CONFIGS.idle;
  const color = PERSONALITY_COLORS[personality] || PERSONALITY_COLORS.normie;

  // Track reaction changes to trigger burst effect
  const prevReactionRef = useRef(reaction);
  useEffect(() => {
    if (reaction !== prevReactionRef.current && reaction !== 'idle') {
      setReactionKey(k => k + 1);
      prevReactionRef.current = reaction;

      // Trigger tip particles for tipping reaction
      if (reaction === 'tipping') {
        setShowTipParticles(true);
        onTip?.();
        setTimeout(() => setShowTipParticles(false), 100);
      }
    }
  }, [reaction, onTip]);

  // Animation based on reaction type
  useFrame((state) => {
    const t = state.clock.elapsedTime;

    // Apply to agent if ref provided
    if (agentRef?.current) {
      // Body bob
      agentRef.current.position.y = config.bodyBob * Math.sin(t * 4);

      // Jump for dancing/cheering
      if (config.jumpHeight > 0) {
        const jumpCycle = Math.abs(Math.sin(t * 3));
        agentRef.current.position.y += config.jumpHeight * jumpCycle;
      }

      // Rotation (for dancing)
      if (config.rotationSpeed > 0) {
        agentRef.current.rotation.y += 0.02 * config.rotationSpeed;
      }
    }

    // Arm animations (if refs provided via children)
    if (leftArmRef.current) {
      leftArmRef.current.rotation.z = -Math.PI / 6 + Math.sin(t * 4) * config.armSwing;
      leftArmRef.current.rotation.x = Math.sin(t * 3) * config.armSwing * 0.5;
    }
    if (rightArmRef.current) {
      rightArmRef.current.rotation.z = Math.PI / 6 - Math.sin(t * 4 + 1) * config.armSwing;
      rightArmRef.current.rotation.x = Math.cos(t * 3) * config.armSwing * 0.5;
    }

    // Head bob
    if (headRef.current) {
      headRef.current.rotation.x = Math.sin(t * 4) * config.headBob;
    }
  });

  // Calculate visual intensity based on match between personality and entropy
  const matchScore = useMemo(() => {
    if (personality === 'chaos' || personality === 'degen') {
      return trackEntropy / 100; // Love high entropy
    } else if (personality === 'conservative') {
      return (100 - trackEntropy) / 100; // Love low entropy
    }
    return 0.5; // Neutral
  }, [personality, trackEntropy]);

  return (
    <group ref={reactionGroupRef}>
      {/* Reaction burst effect on change */}
      {reactionKey > 0 && (
        <ReactionBurst
          key={reactionKey}
          reaction={reaction}
          color={color}
        />
      )}

      {/* Tip particles */}
      <TipParticles
        active={showTipParticles}
        amount="1"
        color="#ffd700"
      />

      {/* Reaction emoji label */}
      {showLabel && reaction !== 'idle' && (
        <Html position={[0, 2.2, 0]} center>
          <div className="flex flex-col items-center pointer-events-none">
            {/* Emoji reaction */}
            <span className="text-2xl animate-bounce">{config.emoji}</span>

            {/* Appreciation bar */}
            <div className="mt-1 bg-black/60 rounded px-2 py-0.5">
              <div className="flex items-center gap-1">
                <span className="text-[8px] text-gray-400">Vibing:</span>
                <div className="w-10 h-1 bg-gray-700 rounded-full overflow-hidden">
                  <div
                    className="h-full transition-all duration-300"
                    style={{
                      width: `${appreciationScore}%`,
                      backgroundColor: color,
                    }}
                  />
                </div>
              </div>
            </div>

            {/* Personality badge */}
            <span
              className="text-[8px] font-bold mt-0.5 px-1.5 py-0.5 rounded"
              style={{
                backgroundColor: `${color}33`,
                color: color,
                border: `1px solid ${color}`,
              }}
            >
              {personality.toUpperCase()}
            </span>
          </div>
        </Html>
      )}

      {/* Aura glow based on match score */}
      <pointLight
        position={[0, 1, 0]}
        color={color}
        intensity={matchScore * 2}
        distance={3}
      />
    </group>
  );
}

// =============================================================================
// STANDALONE ANIMATED AGENT WITH REACTIONS
// =============================================================================

export function AnimatedAgentWithReaction({
  position = [0, 0, 0],
  name = 'Agent',
  personality = 'normie',
  reaction = 'idle',
  appreciationScore = 50,
  trackEntropy = 50,
  active = false,
}) {
  const groupRef = useRef(null);
  const bodyRef = useRef(null);
  const headRef = useRef(null);
  const leftArmRef = useRef(null);
  const rightArmRef = useRef(null);

  const config = REACTION_CONFIGS[reaction] || REACTION_CONFIGS.idle;
  const color = PERSONALITY_COLORS[personality] || PERSONALITY_COLORS.normie;

  useFrame((state) => {
    const t = state.clock.elapsedTime;

    if (groupRef.current) {
      // Body bob
      groupRef.current.position.y = position[1] + config.bodyBob * Math.sin(t * 4);

      // Jump
      if (config.jumpHeight > 0) {
        groupRef.current.position.y += config.jumpHeight * Math.abs(Math.sin(t * 3));
      }

      // Rotation for dancing
      if (config.rotationSpeed > 0) {
        groupRef.current.rotation.y += 0.02 * config.rotationSpeed;
      }
    }

    // Head bob
    if (headRef.current) {
      headRef.current.rotation.x = Math.sin(t * 4) * config.headBob;
    }

    // Arm swing
    if (leftArmRef.current) {
      leftArmRef.current.rotation.z = -Math.PI / 6 + Math.sin(t * 4) * config.armSwing;
    }
    if (rightArmRef.current) {
      rightArmRef.current.rotation.z = Math.PI / 6 - Math.sin(t * 4 + 1) * config.armSwing;
    }
  });

  const emissiveIntensity = reaction !== 'idle' ? 0.5 : 0.1;

  return (
    <group ref={groupRef} position={position}>
      {/* Body */}
      <mesh ref={bodyRef} position={[0, 0.5, 0]} castShadow>
        <boxGeometry args={[0.4, 0.6, 0.3]} />
        <meshStandardMaterial
          color={color}
          metalness={0.7}
          roughness={0.3}
          emissive={color}
          emissiveIntensity={emissiveIntensity}
        />
      </mesh>

      {/* Head */}
      <mesh ref={headRef} position={[0, 1.1, 0]} castShadow>
        <sphereGeometry args={[0.25, 16, 16]} />
        <meshStandardMaterial
          color={color}
          metalness={0.7}
          roughness={0.3}
          emissive={color}
          emissiveIntensity={emissiveIntensity}
        />
      </mesh>

      {/* Eyes */}
      <mesh position={[0.08, 1.15, 0.2]}>
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

      {/* Arms */}
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

      {/* Antenna */}
      <mesh position={[0, 1.45, 0]}>
        <cylinderGeometry args={[0.02, 0.02, 0.2, 8]} />
        <meshStandardMaterial color={color} metalness={0.8} />
      </mesh>
      <mesh position={[0, 1.6, 0]}>
        <sphereGeometry args={[0.04, 8, 8]} />
        <meshStandardMaterial
          color={reaction !== 'idle' ? color : '#00ffff'}
          emissive={reaction !== 'idle' ? color : '#00ffff'}
          emissiveIntensity={reaction !== 'idle' ? 2 : 0.5}
        />
      </mesh>

      {/* Name and reaction label */}
      <Html position={[0, 1.9, 0]} center>
        <div className="flex flex-col items-center pointer-events-none select-none">
          {/* Reaction emoji */}
          {reaction !== 'idle' && (
            <span className="text-lg mb-0.5">{REACTION_CONFIGS[reaction]?.emoji}</span>
          )}

          {/* Name badge */}
          <div
            className="px-1.5 py-0.5 rounded text-[9px] font-medium whitespace-nowrap"
            style={{
              backgroundColor: `${color}dd`,
              color: '#fff',
              border: `1px solid ${color}`,
            }}
          >
            {name}
            {reaction !== 'idle' && <span className="ml-1 animate-pulse">*</span>}
          </div>

          {/* Appreciation score */}
          {reaction !== 'idle' && (
            <div className="mt-0.5 text-[7px] text-white bg-black/60 rounded px-1 py-0.5">
              Vibe: {appreciationScore}%
            </div>
          )}
        </div>
      </Html>

      {/* Reaction aura */}
      {reaction !== 'idle' && (
        <pointLight
          position={[0, 1, 0]}
          color={color}
          intensity={1.5}
          distance={3}
        />
      )}
    </group>
  );
}
