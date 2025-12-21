'use client';

import { motion } from 'framer-motion';

interface AnimatedLoaderProps {
  size?: 'sm' | 'md' | 'lg';
  text?: string;
}

export default function AnimatedLoader({ size = 'md', text }: AnimatedLoaderProps) {
  const sizes = {
    sm: 'w-8 h-8',
    md: 'w-12 h-12',
    lg: 'w-16 h-16'
  };

  return (
    <div className="flex flex-col items-center justify-center gap-4">
      <div className="relative">
        {/* Outer spinning circle */}
        <motion.div
          className={`${sizes[size]} rounded-full border-4 border-purple-200 border-t-purple-600`}
          animate={{ rotate: 360 }}
          transition={{
            duration: 1,
            repeat: Infinity,
            ease: 'linear'
          }}
        />

        {/* Inner pulsing circle */}
        <motion.div
          className="absolute inset-0 m-auto w-3 h-3 rounded-full bg-purple-600"
          animate={{
            scale: [1, 1.5, 1],
            opacity: [1, 0.5, 1]
          }}
          transition={{
            duration: 1.5,
            repeat: Infinity,
            ease: 'easeInOut'
          }}
        />
      </div>

      {text && (
        <motion.p
          className="text-gray-600 font-medium"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.2 }}
        >
          {text}
        </motion.p>
      )}
    </div>
  );
}

// Music-specific loader with vinyl record animation
export function MusicLoader({ text }: { text?: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-4">
      <div className="relative w-20 h-20">
        {/* Vinyl record */}
        <motion.div
          className="w-full h-full rounded-full bg-gradient-to-br from-gray-900 to-gray-700 shadow-2xl"
          animate={{ rotate: 360 }}
          transition={{
            duration: 2,
            repeat: Infinity,
            ease: 'linear'
          }}
        >
          {/* Center hole */}
          <div className="absolute inset-0 m-auto w-6 h-6 rounded-full bg-gradient-to-br from-purple-600 to-pink-600" />

          {/* Grooves */}
          <div className="absolute inset-0 m-auto w-16 h-16 rounded-full border-2 border-gray-600 opacity-50" />
          <div className="absolute inset-0 m-auto w-12 h-12 rounded-full border-2 border-gray-600 opacity-50" />
        </motion.div>

        {/* Needle */}
        <motion.div
          className="absolute top-0 right-4 w-1 h-8 bg-gray-400 origin-bottom"
          style={{ transformOrigin: 'bottom center' }}
          animate={{
            rotate: [0, -5, 0]
          }}
          transition={{
            duration: 2,
            repeat: Infinity,
            ease: 'easeInOut'
          }}
        />
      </div>

      {text && (
        <motion.p
          className="text-gray-600 font-medium"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.2 }}
        >
          {text}
        </motion.p>
      )}
    </div>
  );
}

// Minimal dots loader
export function DotsLoader() {
  return (
    <div className="flex gap-2">
      {[0, 1, 2].map((i) => (
        <motion.div
          key={i}
          className="w-3 h-3 bg-purple-600 rounded-full"
          animate={{
            y: [-10, 0, -10],
            opacity: [0.5, 1, 0.5]
          }}
          transition={{
            duration: 1,
            repeat: Infinity,
            delay: i * 0.15,
            ease: 'easeInOut'
          }}
        />
      ))}
    </div>
  );
}
