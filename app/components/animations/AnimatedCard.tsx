"use client";

import { motion } from "framer-motion";
import { ReactNode } from "react";

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
  className = "",
  onClick,
  hoverScale = true,
}: AnimatedCardProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{
        duration: 0.5,
        delay,
        ease: [0.22, 1, 0.36, 1],
      }}
      whileHover={
        hoverScale
          ? {
              scale: 1.03,
              y: -5,
              transition: { duration: 0.2 },
            }
          : {}
      }
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
  color = "purple",
}: {
  value: number;
  label: string;
  delay?: number;
  color?: "purple" | "blue" | "pink" | "yellow" | "teal";
}) {
  // One surface, not five pastel fills. The colour now touches the NUMBER only,
  // which is the part carrying meaning -- a card tinted end to end just says
  // "this is a card". The `color` prop stays so callers do not change.
  const accent = {
    purple: "text-purple-600",
    blue: "text-blue-600",
    pink: "text-pink-600",
    yellow: "text-amber-600",
    teal: "text-teal-600",
  };

  return (
    // A short fade only. The spring pop on the number and the hover scale made
    // a static figure behave like a notification; tabular-nums stops the digits
    // shifting when a count changes.
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.25, delay }}
      className="rounded-lg border border-gray-200 bg-white p-4 text-center"
    >
      <p className={`text-2xl font-semibold tabular-nums ${accent[color]}`}>
        {value}
      </p>
      <p className="text-xs text-gray-500 mt-1">{label}</p>
    </motion.div>
  );
}

// Music NFT card with special animations
export function MusicNFTCard({
  children,
  delay = 0,
  className = "",
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
        ease: [0.22, 1, 0.36, 1],
      }}
      whileHover={{
        y: -10,
        rotateX: 5,
        boxShadow: "0 20px 40px rgba(0,0,0,0.15)",
        transition: { duration: 0.3 },
      }}
      className={className}
      style={{ transformStyle: "preserve-3d" }}
    >
      {children}
    </motion.div>
  );
}
