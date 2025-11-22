'use client';

import dynamic from 'next/dynamic';
import React, { Component, ReactNode } from 'react';
import { monadProjects } from '@/lib/galaxy/projects';

// Error boundary to catch Three.js/React errors
class GalaxyErrorBoundary extends Component<
  { children: ReactNode },
  { hasError: boolean }
> {
  constructor(props: { children: ReactNode }) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('Galaxy Error:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return <GalaxyFallback />;
    }
    return this.props.children;
  }
}

// 2D Fallback UI when 3D fails
function GalaxyFallback() {
  return (
    <div className="w-full min-h-screen" style={{ background: '#0a0a1a' }}>
      <div className="max-w-6xl mx-auto px-4 py-8">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-white mb-2">🌌 Monad Galaxy</h1>
          <p className="text-gray-400">Explore the Monad ecosystem</p>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {monadProjects.slice(0, 20).map((project) => (
            <a
              key={project.id}
              href={project.url}
              target="_blank"
              rel="noopener noreferrer"
              className="p-4 rounded-xl border border-purple-500/30 hover:border-purple-500 transition-all"
              style={{ background: 'rgba(131, 110, 249, 0.1)' }}
            >
              <div className="text-2xl mb-2">{project.icon}</div>
              <h3 className="text-white font-semibold text-sm">{project.name}</h3>
              <p className="text-gray-400 text-xs mt-1">{project.category}</p>
            </a>
          ))}
        </div>
      </div>
    </div>
  );
}

// Dynamically import GalaxyClient to avoid SSR issues with Three.js
const GalaxyClient = dynamic(
  () => import('./GalaxyClient').then((mod) => mod.GalaxyClient),
  {
    ssr: false,
    loading: () => (
      <div
        className="w-full h-screen flex items-center justify-center"
        style={{ background: '#0a0a1a' }}
      >
        <div className="text-center">
          <div
            className="w-16 h-16 mx-auto mb-4 rounded-full animate-pulse"
            style={{ background: 'linear-gradient(135deg, #836EF9, #A855F7)' }}
          />
          <p style={{ color: '#a0a0a0' }}>Loading Galaxy...</p>
        </div>
      </div>
    ),
  }
);

export function GalaxyWrapper() {
  return (
    <GalaxyErrorBoundary>
      <GalaxyClient />
    </GalaxyErrorBoundary>
  );
}
