'use client';

import { useRef, useMemo, useState, useEffect } from 'react';
import { useFrame } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import * as THREE from 'three';

/**
 * AgentRadio - 3D Radio Component for AgentWorld
 *
 * A visual radio object in the 3D scene that:
 * - Displays current track info
 * - Shows animated sound waves when music is "playing"
 * - Pulses with track entropy (chaos = wild, calm = subtle)
 * - Triggers agent reactions when new tracks start
 *
 * This does NOT play audio - it just visualizes the on-chain radio state
 * for AI agents to "react" to.
 */

// =============================================================================
// TYPES (inline for JSX compatibility)
// =============================================================================

// TrackInfo shape expected:
// { tokenId, name, artist, imageUrl, entropy, isRandom, startedAt, duration }

// =============================================================================
// SUB-COMPONENTS
// =============================================================================

function SoundWave({ active = true, entropy = 50, index = 0 }) {
  const meshRef = useRef(null);
  const materialRef = useRef(null);

  useFrame((state) => {
    if (!meshRef.current || !materialRef.current || !active) return;

    const t = state.clock.elapsedTime;
    const entropyFactor = entropy / 100;

    // Scale based on entropy - high entropy = bigger waves
    const baseScale = 0.8 + entropyFactor * 0.6;
    const waveSpeed = 2 + entropyFactor * 4;
    const waveAmplitude = 0.1 + entropyFactor * 0.3;

    const scale = baseScale + Math.sin(t * waveSpeed + index * 0.8) * waveAmplitude;
    meshRef.current.scale.set(scale, scale, 1);

    // Opacity pulses with the beat
    const opacity = 0.3 + Math.sin(t * waveSpeed + index) * 0.2 * entropyFactor;
    materialRef.current.opacity = Math.max(0.1, opacity);

    // Color shifts with entropy - low = blue, high = pink/red
    const hue = 0.55 - entropyFactor * 0.2; // Blue to pink
    const color = new THREE.Color().setHSL(hue, 0.8, 0.6);
    materialRef.current.color = color;
  });

  return (
    <mesh
      ref={meshRef}
      position={[0, 8 - index * 0.5, 0]}
      rotation={[Math.PI / 2, 0, 0]}
    >
      <torusGeometry args={[1.5 + index * 0.6, 0.04, 8, 32]} />
      <meshBasicMaterial
        ref={materialRef}
        color="#00d9ff"
        transparent
        opacity={0.4}
      />
    </mesh>
  );
}

function VinylDisc({ spinning = true, entropy = 50 }) {
  const discRef = useRef(null);
  const labelRef = useRef(null);

  useFrame((state) => {
    if (!discRef.current) return;

    if (spinning) {
      // Spin speed based on entropy - higher = faster
      const spinSpeed = 0.5 + (entropy / 100) * 1.5;
      discRef.current.rotation.y += 0.01 * spinSpeed;
    }

    // Subtle bob
    discRef.current.position.y = 5.5 + Math.sin(state.clock.elapsedTime * 2) * 0.05;
  });

  return (
    <group ref={discRef} position={[0, 5.5, 0]}>
      {/* Vinyl disc */}
      <mesh rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[1.2, 1.2, 0.05, 32]} />
        <meshStandardMaterial
          color="#1a1a1a"
          metalness={0.3}
          roughness={0.7}
        />
      </mesh>

      {/* Label in center */}
      <mesh ref={labelRef} position={[0, 0.03, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.4, 0.4, 0.02, 32]} />
        <meshStandardMaterial
          color="#ff6b35"
          emissive="#ff6b35"
          emissiveIntensity={0.3}
        />
      </mesh>

      {/* Groove rings */}
      {[0.5, 0.7, 0.9, 1.1].map((radius, i) => (
        <mesh key={i} position={[0, 0.03, 0]} rotation={[Math.PI / 2, 0, 0]}>
          <torusGeometry args={[radius, 0.01, 8, 32]} />
          <meshBasicMaterial color="#333" />
        </mesh>
      ))}
    </group>
  );
}

function SpeakerCone({ position, scale = 1 }) {
  const coneRef = useRef(null);

  useFrame((state) => {
    if (!coneRef.current) return;
    // Speaker pump effect
    const pump = 1 + Math.sin(state.clock.elapsedTime * 8) * 0.03;
    coneRef.current.scale.z = pump;
  });

  return (
    <group position={position} scale={scale}>
      {/* Speaker box */}
      <mesh>
        <boxGeometry args={[0.8, 1.2, 0.5]} />
        <meshStandardMaterial color="#2d2d2d" roughness={0.8} />
      </mesh>

      {/* Woofer */}
      <mesh ref={coneRef} position={[0, 0.2, 0.26]}>
        <cylinderGeometry args={[0.25, 0.15, 0.1, 16]} />
        <meshStandardMaterial color="#1a1a1a" metalness={0.5} />
      </mesh>

      {/* Tweeter */}
      <mesh position={[0, -0.3, 0.26]}>
        <sphereGeometry args={[0.08, 16, 16]} />
        <meshStandardMaterial
          color="#00ffff"
          emissive="#00ffff"
          emissiveIntensity={0.5}
        />
      </mesh>

      {/* Grill */}
      <mesh position={[0, 0, 0.26]}>
        <planeGeometry args={[0.7, 1.1]} />
        <meshBasicMaterial color="#1a1a1a" transparent opacity={0.3} />
      </mesh>
    </group>
  );
}

function RadioTower({ active = true }) {
  return (
    <group>
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

      {/* Base platform */}
      <mesh position={[0, 0.1, 0]} receiveShadow>
        <cylinderGeometry args={[2, 2.2, 0.2, 32]} />
        <meshStandardMaterial color="#1a1a2e" roughness={0.7} />
      </mesh>
    </group>
  );
}

// =============================================================================
// MAIN COMPONENT
// =============================================================================

export default function AgentRadio({
  position = [0, 0, 0],
  currentTrack = null,
  isPlaying = true,
  onTrackChange,
}) {
  const groupRef = useRef(null);
  const [prevTrackId, setPrevTrackId] = useState(null);

  // Track entropy for visual effects (0-100)
  const entropy = currentTrack?.entropy ?? 50;

  // Detect track changes and trigger callback
  useEffect(() => {
    if (currentTrack && currentTrack.tokenId !== prevTrackId) {
      setPrevTrackId(currentTrack.tokenId);
      onTrackChange?.(currentTrack);
    }
  }, [currentTrack, prevTrackId, onTrackChange]);

  // Ambient glow based on entropy
  const glowColor = useMemo(() => {
    // Low entropy = calm blue, high entropy = energetic pink/purple
    const hue = 0.6 - (entropy / 100) * 0.2;
    return new THREE.Color().setHSL(hue, 0.8, 0.5);
  }, [entropy]);

  return (
    <group ref={groupRef} position={position}>
      {/* Radio Tower Structure */}
      <RadioTower active={isPlaying} />

      {/* Vinyl Disc (only visible when playing) */}
      {isPlaying && currentTrack && (
        <VinylDisc spinning={isPlaying} entropy={entropy} />
      )}

      {/* Sound Waves (animated rings) */}
      {isPlaying && [0, 1, 2, 3].map((i) => (
        <SoundWave
          key={i}
          active={isPlaying}
          entropy={entropy}
          index={i}
        />
      ))}

      {/* Speakers on each side */}
      <SpeakerCone position={[-1.5, 0.6, 0]} />
      <SpeakerCone position={[1.5, 0.6, 0]} />

      {/* Ground glow effect */}
      <mesh position={[0, 0.05, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[3, 32]} />
        <meshBasicMaterial
          color={glowColor}
          transparent
          opacity={isPlaying ? 0.3 : 0.1}
        />
      </mesh>

      {/* Ambient light from radio */}
      <pointLight
        position={[0, 5, 0]}
        color={glowColor}
        intensity={isPlaying ? 2 : 0.5}
        distance={10}
      />

      {/* Track Info Label */}
      <Html position={[0, 10, 0]} center>
        <div className="text-center pointer-events-none select-none">
          {/* Status Badge */}
          <div className={`inline-block px-3 py-1 rounded-full text-[10px] font-bold mb-1 ${
            isPlaying
              ? 'bg-green-500/90 text-white'
              : 'bg-gray-600/80 text-gray-300'
          }`}>
            {isPlaying ? 'ON AIR' : 'OFFLINE'}
          </div>

          {/* Track Name */}
          {currentTrack && (
            <div className="bg-black/80 backdrop-blur-sm rounded-lg px-3 py-2 border border-purple-500/30">
              <p className="text-white text-sm font-bold truncate max-w-[150px]">
                {currentTrack.name || 'Unknown Track'}
              </p>
              <p className="text-purple-300 text-[10px]">
                {currentTrack.artist || 'Unknown Artist'}
              </p>
              {currentTrack.isRandom && (
                <span className="text-[8px] text-yellow-400 mt-0.5 inline-block">
                  Random Pick (Pyth Entropy)
                </span>
              )}
              {/* Entropy indicator */}
              <div className="mt-1 flex items-center gap-1 justify-center">
                <span className="text-[8px] text-gray-400">Vibe:</span>
                <div className="w-12 h-1 bg-gray-700 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-blue-400 to-pink-500 transition-all duration-500"
                    style={{ width: `${entropy}%` }}
                  />
                </div>
                <span className="text-[8px] text-gray-400">{entropy}%</span>
              </div>
            </div>
          )}

          {!currentTrack && isPlaying && (
            <div className="bg-black/80 rounded-lg px-3 py-2">
              <p className="text-gray-400 text-xs">Waiting for track...</p>
            </div>
          )}
        </div>
      </Html>

      {/* "AGENT RADIO" label at base */}
      <Html position={[0, 0.5, 2]} center>
        <div className="px-3 py-1 bg-gradient-to-r from-purple-600 to-pink-600 rounded-lg text-[11px] text-white font-bold whitespace-nowrap shadow-lg">
          AGENT RADIO
        </div>
      </Html>
    </group>
  );
}
