'use client';

import { useState, useEffect } from 'react';
import { useFarcasterContext } from '@/app/hooks/useFarcasterContext';
import Link from 'next/link';

const ENVIO_ENDPOINT = process.env.NEXT_PUBLIC_ENVIO_ENDPOINT || 'https://indexer.dev.hyperindex.xyz/5e18e81/v1/graphql';

const EXPERIENCE_TYPES = [
  { id: 'food', emoji: '🍽️', name: 'Food', color: 'from-orange-500 to-red-500' },
  { id: 'attraction', emoji: '🏛️', name: 'Attraction', color: 'from-blue-500 to-indigo-500' },
  { id: 'cultural', emoji: '🎭', name: 'Cultural', color: 'from-purple-500 to-pink-500' },
  { id: 'nature', emoji: '🌿', name: 'Nature', color: 'from-green-500 to-emerald-500' },
  { id: 'entertainment', emoji: '🎪', name: 'Fun', color: 'from-yellow-500 to-orange-500' },
  { id: 'shopping', emoji: '🛍️', name: 'Shopping', color: 'from-pink-500 to-rose-500' },
];

const SAMPLE_EXPERIENCES = [
  { id: '1', name: 'Tacos El Pastor', city: 'Mexico City', country: 'Mexico', type: 'food', emoji: '🌮', price: '5', rating: 4.8, reviews: 23 },
  { id: '2', name: 'Eiffel Tower', city: 'Paris', country: 'France', type: 'attraction', emoji: '🗼', price: '15', rating: 4.9, reviews: 156 },
  { id: '3', name: 'Shibuya Crossing', city: 'Tokyo', country: 'Japan', type: 'cultural', emoji: '🚶', price: '0', rating: 4.7, reviews: 89 },
  { id: '4', name: 'Central Park', city: 'New York', country: 'USA', type: 'nature', emoji: '🌳', price: '0', rating: 4.6, reviews: 234 },
];

interface Experience {
  id: string;
  name: string;
  city: string;
  country: string;
  type: string;
  emoji: string;
  price: string;
  rating: number;
  reviews: number;
  creator?: string;
  imageHash?: string;
}

export default function ItineraryMarketPage() {
  const { walletAddress } = useFarcasterContext();

  const [activeTab, setActiveTab] = useState<'explore' | 'nearby' | 'saved'>('explore');
  const [selectedType, setSelectedType] = useState<string | null>(null);
  const [experiences, setExperiences] = useState<Experience[]>(SAMPLE_EXPERIENCES);
  const [loading, setLoading] = useState(false);
  const [selectedExperience, setSelectedExperience] = useState<Experience | null>(null);

  // Load from indexer
  useEffect(() => {
    loadExperiences();
  }, []);

  const loadExperiences = async () => {
    setLoading(true);
    try {
      const query = `
        query GetExperiences {
          ItineraryNFT_ItineraryCreated(order_by: {block_timestamp: desc}, limit: 20) {
            tokenId
            creator
            name
            description
            price
          }
        }
      `;

      const res = await fetch(ENVIO_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query })
      });

      const data = await res.json();
      const items = data.data?.ItineraryNFT_ItineraryCreated || [];

      if (items.length > 0) {
        const mapped = items.map((item: any, i: number) => ({
          id: item.tokenId,
          name: item.name || `Experience #${item.tokenId}`,
          city: 'Unknown',
          country: 'Unknown',
          type: 'general',
          emoji: '📍',
          price: (Number(item.price) / 1e18).toFixed(0),
          rating: 4.5 + Math.random() * 0.5,
          reviews: Math.floor(Math.random() * 50),
          creator: item.creator,
        }));
        setExperiences([...mapped, ...SAMPLE_EXPERIENCES]);
      }
    } catch (err) {
      console.error('Failed to load:', err);
    } finally {
      setLoading(false);
    }
  };

  const filteredExperiences = selectedType
    ? experiences.filter(e => e.type === selectedType)
    : experiences;

  // Experience Detail Modal
  if (selectedExperience) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-purple-900 via-black to-blue-900">
        {/* Header */}
        <div className="sticky top-0 bg-black/80 backdrop-blur-lg z-10 p-4 flex items-center gap-4">
          <button
            onClick={() => setSelectedExperience(null)}
            className="w-10 h-10 bg-white/10 rounded-full flex items-center justify-center text-white"
          >
            ←
          </button>
          <h1 className="text-white font-bold text-lg flex-1">{selectedExperience.name}</h1>
        </div>

        {/* Hero */}
        <div className="h-48 bg-gradient-to-br from-purple-600 to-pink-600 flex items-center justify-center">
          <span className="text-8xl">{selectedExperience.emoji}</span>
        </div>

        {/* Content */}
        <div className="p-4 -mt-6">
          <div className="bg-white/10 backdrop-blur-xl rounded-2xl p-5 border border-white/20">
            <div className="flex items-start justify-between mb-4">
              <div>
                <h2 className="text-2xl font-bold text-white">{selectedExperience.name}</h2>
                <p className="text-white/60">{selectedExperience.city}, {selectedExperience.country}</p>
              </div>
              <div className="text-right">
                <div className="flex items-center gap-1 text-yellow-400">
                  <span>⭐</span>
                  <span className="font-bold">{selectedExperience.rating.toFixed(1)}</span>
                </div>
                <p className="text-white/50 text-xs">{selectedExperience.reviews} reviews</p>
              </div>
            </div>

            {/* Quick Stats */}
            <div className="grid grid-cols-3 gap-3 mb-6">
              <div className="bg-white/5 rounded-xl p-3 text-center">
                <p className="text-2xl">{selectedExperience.emoji}</p>
                <p className="text-white/60 text-xs capitalize">{selectedExperience.type}</p>
              </div>
              <div className="bg-white/5 rounded-xl p-3 text-center">
                <p className="text-xl font-bold text-green-400">{selectedExperience.price}</p>
                <p className="text-white/60 text-xs">TOURS</p>
              </div>
              <div className="bg-white/5 rounded-xl p-3 text-center">
                <p className="text-xl">📍</p>
                <p className="text-white/60 text-xs">Check-in</p>
              </div>
            </div>

            {/* Actions */}
            <div className="space-y-3">
              <button className="w-full bg-gradient-to-r from-green-500 to-emerald-500 text-white font-bold py-4 rounded-xl text-lg active:scale-95 transition-transform">
                🎫 Purchase Guide ({selectedExperience.price} TOURS)
              </button>
              <button className="w-full bg-white/10 text-white font-bold py-4 rounded-xl border border-white/20 active:scale-95 transition-transform">
                💾 Save for Later
              </button>
            </div>

            {/* Creator */}
            {selectedExperience.creator && (
              <div className="mt-4 pt-4 border-t border-white/10">
                <p className="text-white/50 text-xs">Created by</p>
                <p className="text-purple-400 text-sm font-mono">
                  {selectedExperience.creator.slice(0, 8)}...{selectedExperience.creator.slice(-6)}
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-900 via-black to-blue-900">
      {/* Header */}
      <div className="sticky top-0 bg-black/80 backdrop-blur-lg z-10 p-4">
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-2xl font-bold text-white">Experiences</h1>
          <Link
            href="/itinerary"
            className="bg-gradient-to-r from-purple-500 to-pink-500 text-white px-4 py-2 rounded-full text-sm font-semibold"
          >
            + Create
          </Link>
        </div>

        {/* Tabs */}
        <div className="flex gap-2">
          {(['explore', 'nearby', 'saved'] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`flex-1 py-2 rounded-full text-sm font-semibold transition-all ${
                activeTab === tab
                  ? 'bg-white text-purple-900'
                  : 'bg-white/10 text-white/70'
              }`}
            >
              {tab === 'explore' && '🌍 '}
              {tab === 'nearby' && '📍 '}
              {tab === 'saved' && '💾 '}
              {tab.charAt(0).toUpperCase() + tab.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {/* Category Filter - Horizontal Scroll */}
      <div className="px-4 py-3 overflow-x-auto">
        <div className="flex gap-2 min-w-max">
          <button
            onClick={() => setSelectedType(null)}
            className={`px-4 py-2 rounded-full text-sm font-semibold transition-all ${
              selectedType === null
                ? 'bg-white text-purple-900'
                : 'bg-white/10 text-white/70 border border-white/20'
            }`}
          >
            All
          </button>
          {EXPERIENCE_TYPES.map((type) => (
            <button
              key={type.id}
              onClick={() => setSelectedType(selectedType === type.id ? null : type.id)}
              className={`px-4 py-2 rounded-full text-sm font-semibold transition-all flex items-center gap-1 ${
                selectedType === type.id
                  ? `bg-gradient-to-r ${type.color} text-white`
                  : 'bg-white/10 text-white/70 border border-white/20'
              }`}
            >
              <span>{type.emoji}</span>
              <span>{type.name}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Experience Cards */}
      <div className="px-4 pb-24">
        {loading ? (
          <div className="text-center py-12">
            <div className="text-4xl animate-bounce mb-2">🗺️</div>
            <p className="text-white/60">Loading experiences...</p>
          </div>
        ) : filteredExperiences.length === 0 ? (
          <div className="text-center py-12">
            <div className="text-4xl mb-2">🔍</div>
            <p className="text-white/60">No experiences found</p>
            <Link href="/itinerary" className="text-purple-400 mt-2 inline-block">
              Be the first to create one!
            </Link>
          </div>
        ) : (
          <div className="space-y-3">
            {filteredExperiences.map((exp) => (
              <button
                key={exp.id}
                onClick={() => setSelectedExperience(exp)}
                className="w-full bg-white/10 backdrop-blur-sm rounded-2xl p-4 border border-white/10 hover:border-purple-500/50 transition-all active:scale-[0.98] text-left"
              >
                <div className="flex items-center gap-4">
                  {/* Emoji Avatar */}
                  <div className={`w-14 h-14 rounded-xl bg-gradient-to-br ${
                    EXPERIENCE_TYPES.find(t => t.id === exp.type)?.color || 'from-gray-500 to-gray-600'
                  } flex items-center justify-center text-2xl`}>
                    {exp.emoji}
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <h3 className="text-white font-bold truncate">{exp.name}</h3>
                    <p className="text-white/50 text-sm">{exp.city}, {exp.country}</p>
                    <div className="flex items-center gap-3 mt-1">
                      <span className="text-yellow-400 text-xs flex items-center gap-1">
                        ⭐ {exp.rating.toFixed(1)}
                      </span>
                      <span className="text-white/40 text-xs">
                        {exp.reviews} reviews
                      </span>
                    </div>
                  </div>

                  {/* Price */}
                  <div className="text-right">
                    <p className="text-green-400 font-bold">{exp.price}</p>
                    <p className="text-white/40 text-xs">TOURS</p>
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Bottom Navigation Hint */}
      <div className="fixed bottom-0 left-0 right-0 bg-gradient-to-t from-black via-black/80 to-transparent p-4 pt-8">
        <div className="flex justify-center">
          <Link
            href="/itinerary"
            className="bg-gradient-to-r from-purple-500 to-pink-500 text-white px-8 py-4 rounded-full font-bold text-lg shadow-lg shadow-purple-500/30 active:scale-95 transition-transform"
          >
            ✨ Share Your Experience
          </Link>
        </div>
      </div>
    </div>
  );
}
