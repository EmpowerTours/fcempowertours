'use client';

import { motion } from 'framer-motion';
import { ReactNode } from 'react';

interface AnimatedCardProps {
  children: ReactNode;
  delay?: number;
  className?: string;
  onClick?: () => void;
  hoverScale?: boolean;
}

export default function AnimatedCard({
  children,
  delay = 0,
  className = '',
  onClick,
  hoverScale = true
}: AnimatedCardProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{
        duration: 0.5,
        delay,
        ease: [0.22, 1, 0.36, 1]
      }}
      whileHover={hoverScale ? {
        scale: 1.03,
        y: -5,
        transition: { duration: 0.2 }
      } : {}}
      whileTap={onClick ? { scale: 0.98 } : {}}
      onClick={onClick}
      className={className}
    >
      {children}
    </motion.div>
  );
}

// Stats card with counter animation
export function AnimatedStatCard({
  value,
  label,
  delay = 0,
  color = 'purple'
}: {
  value: number;
  label: string;
  delay?: number;
  color?: 'purple' | 'blue' | 'pink' | 'yellow' | 'teal';
}) {
  const colors = {
    purple: 'bg-purple-50 text-purple-600',
    blue: 'bg-blue-50 text-blue-600',
    pink: 'bg-pink-50 text-pink-600',
    yellow: 'bg-amber-50 text-amber-600',
    teal: 'bg-teal-50 text-teal-600'
  };

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{
        duration: 0.5,
        delay,
        ease: [0.22, 1, 0.36, 1]
      }}
      whileHover={{ scale: 1.05 }}
      className={`${colors[color]} rounded-lg p-4 text-center cursor-default`}
    >
      <motion.p
        className="text-3xl font-bold"
        initial={{ opacity: 0, scale: 0 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{
          duration: 0.5,
          delay: delay + 0.2,
          type: 'spring',
          stiffness: 200
        }}
      >
        {value}
      </motion.p>
      <p className="text-sm text-gray-600 mt-1">{label}</p>
    </motion.div>
  );
}

// Music NFT card with special animations
export function MusicNFTCard({
  children,
  delay = 0,
  className = ''
}: {
  children: ReactNode;
  delay?: number;
  className?: string;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 30, rotateX: -15 }}
      animate={{ opacity: 1, y: 0, rotateX: 0 }}
      transition={{
        duration: 0.6,
        delay,
        ease: [0.22, 1, 0.36, 1]
      }}
      whileHover={{
        y: -10,
        rotateX: 5,
        boxShadow: '0 20px 40px rgba(0,0,0,0.15)',
        transition: { duration: 0.3 }
      }}
      className={className}
      style={{ transformStyle: 'preserve-3d' }}
    >
      {children}
    </motion.div>
  );
}
