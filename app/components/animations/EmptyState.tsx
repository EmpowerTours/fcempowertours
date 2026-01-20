'use client';

import { motion } from 'framer-motion';
import { ReactNode } from 'react';

interface EmptyStateProps {
  icon?: string;
  title: string;
  description?: string;
  action?: ReactNode;
}

export default function EmptyState({ icon = '🔍', title, description, action }: EmptyStateProps) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.5 }}
      className="text-center py-16 bg-white rounded-2xl shadow-lg"
    >
      {/* Animated icon */}
      <motion.div
        className="text-8xl mb-6"
        animate={{
          scale: [1, 1.1, 1],
          rotate: [0, 5, -5, 0]
        }}
        transition={{
          duration: 3,
          repeat: Infinity,
          ease: 'easeInOut'
        }}
      >
        {icon}
      </motion.div>

      {/* Title */}
      <motion.h3
        className="text-2xl font-bold text-gray-900 mb-2"
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
      >
        {title}
      </motion.h3>

      {/* Description */}
      {description && (
        <motion.p
          className="text-gray-600 mb-6"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
        >
          {description}
        </motion.p>
      )}

      {/* Action button */}
      {action && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
        >
          {action}
        </motion.div>
      )}
    </motion.div>
  );
}

// Music-specific empty state
export function MusicEmptyState({ searchQuery }: { searchQuery?: string }) {
  return (
    <EmptyState
      icon="🎵"
      title={searchQuery ? `No results for "${searchQuery}"` : 'No music NFTs found'}
      description={searchQuery ? 'Try a different search term or browse all tracks' : 'Be the first to mint music on EmpowerTours!'}
    />
  );
}

// Profile empty state
export function ProfileEmptyState() {
  return (
    <EmptyState
      icon="🎨"
      title="No NFTs in your collection"
      description="Start exploring and minting NFTs to build your collection"
    />
  );
}
