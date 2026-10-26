import React from 'react';
import { createPortal } from 'react-dom';
import { motion, useReducedMotion } from 'motion/react';

export interface LiquidWaveData {
  id: number;
  x: number;
  y: number;
  maxRadius: number;
  isDark: boolean;
}

interface LiquidThemeWaveProps {
  wave: LiquidWaveData | null;
}

export const LiquidThemeWave: React.FC<LiquidThemeWaveProps> = ({ wave }) => {
  const reducedMotion = useReducedMotion();

  if (typeof document === 'undefined' || !wave || reducedMotion) {
    return null;
  }

  const { x, y, maxRadius, isDark, id } = wave;
  const diameter = Math.ceil(maxRadius * 2);

  return createPortal(
    <div
      key={id}
      className="pointer-events-none fixed inset-0 z-[999999] overflow-hidden select-none"
      aria-hidden="true"
    >
      {/* 1. Primary organic liquid wave crest */}
      <motion.div
        initial={{
          width: 0,
          height: 0,
          opacity: 0.95,
          rotate: 0,
        }}
        animate={{
          width: diameter,
          height: diameter,
          opacity: [0.95, 0.75, 0],
          rotate: 35,
        }}
        transition={{
          duration: 0.72,
          ease: [0.22, 1, 0.36, 1],
        }}
        style={{
          position: 'absolute',
          left: x,
          top: y,
          transform: 'translate(-50%, -50%)',
          borderRadius: '48% 52% 51% 49% / 51% 49% 52% 48%',
          border: isDark
            ? '2px solid rgba(255, 122, 47, 0.55)'
            : '2px solid rgba(255, 255, 255, 0.85)',
          boxShadow: isDark
            ? '0 0 35px 6px rgba(255, 122, 47, 0.35), inset 0 0 25px 4px rgba(124, 196, 255, 0.25)'
            : '0 0 35px 6px rgba(255, 255, 255, 0.55), inset 0 0 25px 4px rgba(226, 96, 15, 0.2)',
        }}
      />

      {/* 2. Secondary trailing harmonic ripple */}
      <motion.div
        initial={{
          width: 0,
          height: 0,
          opacity: 0.65,
          rotate: 15,
        }}
        animate={{
          width: Math.ceil(diameter * 0.9),
          height: Math.ceil(diameter * 0.9),
          opacity: [0.7, 0.45, 0],
          rotate: -20,
        }}
        transition={{
          duration: 0.68,
          delay: 0.04,
          ease: [0.22, 1, 0.36, 1],
        }}
        style={{
          position: 'absolute',
          left: x,
          top: y,
          transform: 'translate(-50%, -50%)',
          borderRadius: '52% 48% 49% 51% / 49% 51% 48% 52%',
          border: isDark
            ? '1.5px solid rgba(124, 196, 255, 0.45)'
            : '1.5px solid rgba(251, 191, 36, 0.5)',
          boxShadow: isDark
            ? '0 0 22px rgba(124, 196, 255, 0.2)'
            : '0 0 22px rgba(251, 191, 36, 0.25)',
        }}
      />

      {/* 3. Micro liquid droplet splashes originating from the button */}
      <motion.div
        initial={{ x: 0, y: 0, scale: 0, opacity: 1 }}
        animate={{
          x: -28,
          y: 20,
          scale: [0, 1.3, 0],
          opacity: [1, 0.8, 0],
        }}
        transition={{ duration: 0.36, ease: 'easeOut' }}
        style={{
          position: 'absolute',
          left: x,
          top: y,
          width: 6,
          height: 6,
          borderRadius: '50%',
          backgroundColor: isDark ? 'rgba(255, 122, 47, 0.85)' : 'rgba(255, 255, 255, 0.95)',
          boxShadow: '0 0 6px rgba(255, 122, 47, 0.4)',
        }}
      />
      <motion.div
        initial={{ x: 0, y: 0, scale: 0, opacity: 1 }}
        animate={{
          x: -36,
          y: 4,
          scale: [0, 1.1, 0],
          opacity: [1, 0.8, 0],
        }}
        transition={{ duration: 0.38, delay: 0.02, ease: 'easeOut' }}
        style={{
          position: 'absolute',
          left: x,
          top: y,
          width: 5,
          height: 5,
          borderRadius: '50%',
          backgroundColor: isDark ? 'rgba(124, 196, 255, 0.85)' : 'rgba(251, 191, 36, 0.95)',
          boxShadow: '0 0 6px rgba(124, 196, 255, 0.4)',
        }}
      />
      <motion.div
        initial={{ x: 0, y: 0, scale: 0, opacity: 1 }}
        animate={{
          x: -18,
          y: 32,
          scale: [0, 1, 0],
          opacity: [1, 0.8, 0],
        }}
        transition={{ duration: 0.34, delay: 0.03, ease: 'easeOut' }}
        style={{
          position: 'absolute',
          left: x,
          top: y,
          width: 5,
          height: 5,
          borderRadius: '50%',
          backgroundColor: isDark ? 'rgba(255, 122, 47, 0.8)' : 'rgba(255, 255, 255, 0.9)',
          boxShadow: '0 0 6px rgba(255, 122, 47, 0.4)',
        }}
      />
      <motion.div
        initial={{ x: 0, y: 0, scale: 0, opacity: 1 }}
        animate={{
          x: -12,
          y: -18,
          scale: [0, 1.2, 0],
          opacity: [1, 0.8, 0],
        }}
        transition={{ duration: 0.32, delay: 0.01, ease: 'easeOut' }}
        style={{
          position: 'absolute',
          left: x,
          top: y,
          width: 4,
          height: 4,
          borderRadius: '50%',
          backgroundColor: isDark ? 'rgba(124, 196, 255, 0.8)' : 'rgba(251, 191, 36, 0.9)',
          boxShadow: '0 0 5px rgba(124, 196, 255, 0.4)',
        }}
      />
    </div>,
    document.body,
  );
};
