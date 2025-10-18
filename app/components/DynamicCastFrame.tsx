'use client';

import React, { useEffect, useState, useMemo } from 'react';
import { motion } from 'framer-motion';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Loader2 } from 'lucide-react';

const prompts = [
  '🎧 Discover the latest artist NFTs',
  '🌍 Empower your music journeys',
  '🚀 Mint your first track on Monad',
  '🎶 Connect with global creators',
];

interface Props {
  fid?: string;
  artist?: string;
}

export default function DynamicCastFrame({ fid, artist }: Props) {
  const [index, setIndex] = useState(0);
  const [loading, setLoading] = useState(false);

  // ✅ Precompute the prompt text (avoids re-render string building)
  const promptText = useMemo(() => prompts[index], [index]);

  // ✅ Use one lightweight interval
  useEffect(() => {
    const id = setInterval(() => {
      setIndex((i) => (i + 1) % prompts.length);
    }, 5000);
    return () => clearInterval(id);
  }, []);

  // ✅ Handle mock mint / cast action
  const handleAction = async () => {
    setLoading(true);
    try {
      await new Promise((r) => setTimeout(r, 2000)); // simulate API
      alert('✅ Cast or mint simulated');
    } finally {
      setLoading(false);
    }
  };

  // ✅ Framer motion variants (smoother, less layout thrash)
  const borderVariants = {
    animate: {
      rotate: 360,
      transition: {
        repeat: Infinity,
        ease: 'linear',
        duration: 10,
      },
    },
  };

  return (
    <Card className="relative flex flex-col items-center justify-center w-full max-w-md p-6 mx-auto text-center shadow-lg bg-gradient-to-br from-zinc-900 to-zinc-800 text-white rounded-2xl border border-zinc-700">
      {/* Animated border ring */}
      <motion.div
        className="absolute inset-0 rounded-2xl border-4 border-blue-500/40"
        variants={borderVariants}
        animate="animate"
      />

      {/* Dynamic prompt */}
      <motion.h2
        key={index}
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -10 }}
        transition={{ duration: 0.4 }}
        className="relative z-10 text-lg sm:text-xl font-semibold"
      >
        {promptText}
      </motion.h2>

      {/* Artist / FID Info */}
      {artist && (
        <p className="relative z-10 text-sm text-zinc-400 mt-2">
          Artist: <span className="text-blue-400">{artist}</span>
        </p>
      )}
      {fid && (
        <p className="relative z-10 text-xs text-zinc-500">
          Farcaster ID: {fid}
        </p>
      )}

      {/* Action Button */}
      <Button
        onClick={handleAction}
        disabled={loading}
        className="relative z-10 mt-4 bg-blue-600 hover:bg-blue-500 text-white font-semibold"
      >
        {loading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : '⚡ Cast It'}
      </Button>
    </Card>
  );
}
