'use client';

/**
 * AgentWorldRadioIntegration.jsx
 *
 * Example showing how to integrate the AgentRadio components
 * with the existing AgentWorld3DScene.
 *
 * This demonstrates:
 * 1. Adding AgentRadio to the 3D scene
 * 2. Using useAgentRadio hook for state management
 * 3. Triggering agent reactions when tracks change
 * 4. Displaying RadioUI overlay
 */

import React, { useState, useCallback } from 'react';
import { useAgentRadio } from '@/app/hooks/useAgentRadio';
import AgentRadio from './AgentRadio';
import { AnimatedAgentWithReaction } from './AgentMusicReaction';
import RadioUI from './RadioUI';

// =============================================================================
// EXAMPLE: 3D Scene Elements (to be added to AgentWorld3DScene)
// =============================================================================

/**
 * AgentRadioScene - Add this to the existing Scene component in AgentWorld3DScene.tsx
 *
 * Usage in AgentWorld3DScene:
 *
 * import AgentRadio from './AgentRadio';
 * import { AnimatedAgentWithReaction } from './AgentMusicReaction';
 *
 * // Inside the Scene component:
 * <AgentRadio
 *   position={AI_ZONE_POSITIONS.radio_tower}
 *   currentTrack={currentTrack}
 *   isPlaying={radioActive}
 *   onTrackChange={handleTrackChange}
 * />
 *
 * // For each agent, wrap with reaction component:
 * <AnimatedAgentWithReaction
 *   position={agentPosition}
 *   name={agent.name}
 *   personality={getAgentPersonality(agent)}
 *   reaction={agentReaction}
 *   appreciationScore={appreciation}
 *   trackEntropy={currentTrack?.entropy || 50}
 *   active={isActive}
 * />
 */

export function AgentRadioSceneElements({
  currentTrack,
  isPlaying,
  agents,
  agentAppreciations,
  onTrackChange,
}) {
  return (
    <>
      {/* Radio Tower with visualization */}
      <AgentRadio
        position={[0, 0, 0]} // radio_tower position
        currentTrack={currentTrack}
        isPlaying={isPlaying}
        onTrackChange={onTrackChange}
      />

      {/* Agents with music reactions */}
      {agents.map((agent, index) => {
        const appreciation = agentAppreciations.find(
          a => a.agentAddress === agent.address
        );

        // Calculate position in circle around radio
        const angle = (index / agents.length) * Math.PI * 2;
        const radius = 5;
        const position = [
          Math.cos(angle) * radius,
          0,
          Math.sin(angle) * radius,
        ];

        return (
          <AnimatedAgentWithReaction
            key={agent.address}
            position={position}
            name={agent.name}
            personality={appreciation?.agentPersonality || 'normie'}
            reaction={appreciation?.lastReaction || 'idle'}
            appreciationScore={appreciation?.appreciationScore || 50}
            trackEntropy={currentTrack?.entropy || 50}
            active={agent.lastActionAt > Date.now() - 5 * 60 * 1000}
          />
        );
      })}
    </>
  );
}

// =============================================================================
// FULL INTEGRATION WRAPPER
// =============================================================================

/**
 * AgentWorldWithRadio - Wrapper component that adds radio functionality
 *
 * This can be used as a replacement for the existing AgentWorldModal
 * or integrated into it.
 */

export default function AgentWorldRadioIntegration({ children }) {
  const {
    currentTrack,
    queue,
    agentAppreciations,
    stats,
    lastEvent,
    loading,
    queueTrack,
    nextTrack,
    refresh,
  } = useAgentRadio();

  const [radioUIMinimized, setRadioUIMinimized] = useState(false);

  // Handle track change - trigger agent reactions
  const handleTrackChange = useCallback((track) => {
    console.log('[AgentWorldRadio] Track changed:', track.name);
    // Agent appreciations are automatically calculated in the hook
  }, []);

  // Handle queue action
  const handleQueueTrack = useCallback(async () => {
    // This would open a modal to select a track
    // For now, just log
    console.log('[AgentWorldRadio] Queue track requested');
  }, []);

  // Handle skip to random
  const handleSkipToRandom = useCallback(async () => {
    if (!confirm('Skip to random song? (Uses Pyth Entropy)')) return;
    const result = await nextTrack('0x...'); // Pass user address
    if (result.success) {
      console.log('[AgentWorldRadio] Skip TX:', result.txHash);
    } else {
      console.error('[AgentWorldRadio] Skip failed:', result.error);
    }
  }, [nextTrack]);

  return (
    <>
      {/* Render children (the 3D scene) */}
      {children}

      {/* Radio UI Overlay */}
      <RadioUI
        currentTrack={currentTrack}
        queue={queue}
        agentAppreciations={agentAppreciations}
        stats={stats}
        lastEvent={lastEvent}
        loading={loading}
        onQueueTrack={handleQueueTrack}
        onSkipToRandom={handleSkipToRandom}
        onRefresh={refresh}
        minimized={radioUIMinimized}
        onToggleMinimize={() => setRadioUIMinimized(!radioUIMinimized)}
        position="bottom-left"
      />
    </>
  );
}

// =============================================================================
// USAGE INSTRUCTIONS
// =============================================================================

/**
 * HOW TO INTEGRATE:
 *
 * 1. In AgentWorld3DScene.tsx, add imports:
 *
 *    import AgentRadio from './AgentRadio';
 *    import { AnimatedAgentWithReaction } from './AgentMusicReaction';
 *    import { useAgentRadio } from '@/app/hooks/useAgentRadio';
 *
 * 2. In the Scene component, add the AgentRadio:
 *
 *    const { currentTrack, agentAppreciations } = useAgentRadio();
 *
 *    // Replace existing RadioTower with AgentRadio:
 *    <AgentRadio
 *      position={[0, 0, 0]}
 *      currentTrack={currentTrack}
 *      isPlaying={radioActive}
 *    />
 *
 * 3. Update RobotAgent to use reactions:
 *
 *    // Get appreciation for this agent
 *    const appreciation = agentAppreciations.find(a => a.agentAddress === agent.address);
 *
 *    // Use AnimatedAgentWithReaction instead of plain RobotAgent for full reactions
 *    // Or pass reaction props to existing RobotAgent
 *
 * 4. In AgentWorldModal.tsx, add the RadioUI overlay:
 *
 *    import RadioUI from './RadioUI';
 *
 *    // Inside the modal, after the 3D canvas:
 *    <RadioUI
 *      currentTrack={currentTrack}
 *      queue={queue}
 *      agentAppreciations={agentAppreciations}
 *      stats={stats}
 *      position="bottom-left"
 *    />
 *
 * 5. The useAgentRadio hook handles:
 *    - Real-time SSE updates from the radio
 *    - Agent appreciation calculations based on personality + entropy
 *    - Queue management
 *    - Contract event listening
 */
