'use client';

import React, { useState, useEffect } from 'react';
import { X, Trophy, MapPin, Music, Palette, Ticket, Globe, Star, TrendingUp } from 'lucide-react';

interface ProfileModalProps {
  walletAddress: string;
  userFid?: number;
  username?: string;
  pfpUrl?: string;
  onClose: () => void;
}

interface AchievementStats {
  passports: number;
  musicCreated: number;
  artCreated: number;
  musicPurchased: number;
  itinerariesCreated: number;
  itinerariesPurchased: number;
  itinerariesCompleted: number;
  totalEarnings: string;
  countries: string[];
}

const ENVIO_ENDPOINT = process.env.NEXT_PUBLIC_ENVIO_ENDPOINT || 'https://indexer.dev.hyperindex.xyz/157f9ed/v1/graphql';

export const ProfileModal: React.FC<ProfileModalProps> = ({
  walletAddress,
  userFid,
  username,
  pfpUrl,
  onClose
}) => {
  const [stats, setStats] = useState<AchievementStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadStats();
  }, [walletAddress]);

  const loadStats = async () => {
    if (!walletAddress) return;
    setLoading(true);

    try {
      const addresses = [walletAddress.toLowerCase()];

      const query = `
        query GetAchievements($addresses: [String!]!) {
          PassportNFT(where: {owner: {_in: $addresses}}) {
            tokenId
            countryCode
          }
          CreatedMusic: MusicNFT(where: {artist: {_in: $addresses}, isArt: {_eq: false}, isBurned: {_eq: false}}) {
            tokenId
          }
          CreatedArt: MusicNFT(where: {artist: {_in: $addresses}, isArt: {_eq: true}, isBurned: {_eq: false}}) {
            tokenId
          }
          PurchasedMusic: MusicLicense(where: {licensee: {_in: $addresses}}) {
            licenseId
          }
          ItineraryCreated: ItineraryNFT_ItineraryCreated(where: {creator: {_in: $addresses}}) {
            itineraryId
            totalPurchases
          }
          ItineraryPurchased: ItineraryNFT_ItineraryPurchased(where: {buyer: {_in: $addresses}}) {
            itineraryId
          }
          ItineraryCompleted: ItineraryNFT_ItineraryCompleted(where: {user: {_in: $addresses}}) {
            itineraryId
          }
        }
      `;

      const response = await fetch(ENVIO_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query, variables: { addresses } })
      });

      const result = await response.json();
      const data = result.data || {};

      // Extract unique countries from passports
      const countries = [...new Set(
        (data.PassportNFT || [])
          .map((p: any) => p.countryCode)
          .filter((c: string) => c && c !== 'XX')
      )] as string[];

      // Calculate total earnings from itineraries
      const totalPurchases = (data.ItineraryCreated || [])
        .reduce((sum: number, i: any) => sum + (i.totalPurchases || 0), 0);
      const estimatedEarnings = totalPurchases * 7; // 70% of 10 WMON average price

      setStats({
        passports: (data.PassportNFT || []).length,
        musicCreated: (data.CreatedMusic || []).length,
        artCreated: (data.CreatedArt || []).length,
        musicPurchased: (data.PurchasedMusic || []).length,
        itinerariesCreated: (data.ItineraryCreated || []).length,
        itinerariesPurchased: (data.ItineraryPurchased || []).length,
        itinerariesCompleted: (data.ItineraryCompleted || []).length,
        totalEarnings: estimatedEarnings.toFixed(0),
        countries
      });
    } catch (error) {
      console.error('Failed to load stats:', error);
    } finally {
      setLoading(false);
    }
  };

  const achievementLevel = stats ? (
    stats.passports +
    stats.musicCreated +
    stats.artCreated +
    stats.itinerariesCreated +
    stats.itinerariesCompleted
  ) : 0;

  const getLevelTitle = (level: number) => {
    if (level >= 50) return { title: 'Legend', color: 'from-yellow-400 to-amber-600', emoji: '👑' };
    if (level >= 30) return { title: 'Expert', color: 'from-purple-500 to-pink-600', emoji: '🌟' };
    if (level >= 15) return { title: 'Explorer', color: 'from-cyan-500 to-blue-600', emoji: '🗺️' };
    if (level >= 5) return { title: 'Adventurer', color: 'from-green-500 to-emerald-600', emoji: '🎒' };
    return { title: 'Newcomer', color: 'from-gray-400 to-gray-600', emoji: '🌱' };
  };

  const levelInfo = getLevelTitle(achievementLevel);

  return (
    <div className="fixed inset-0 bg-black/90 backdrop-blur-md z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="bg-gradient-to-br from-gray-900 via-black to-gray-900 border border-purple-500/30 rounded-3xl w-full max-w-lg max-h-[85vh] overflow-hidden shadow-2xl shadow-purple-500/10"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="bg-gradient-to-r from-purple-500/20 to-cyan-500/20 border-b border-purple-500/30 p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              {pfpUrl ? (
                <img
                  src={pfpUrl}
                  alt={username || 'Profile'}
                  className="w-12 h-12 rounded-full border-2 border-purple-500/50"
                />
              ) : (
                <div className="w-12 h-12 bg-gradient-to-br from-purple-500 to-cyan-500 rounded-full flex items-center justify-center">
                  <Trophy className="w-6 h-6 text-white" />
                </div>
              )}
              <div>
                <h2 className="text-lg font-bold text-white">
                  {username ? `@${username}` : 'Achievements'}
                </h2>
                <p className="text-xs text-gray-400">
                  {walletAddress.slice(0, 6)}...{walletAddress.slice(-4)}
                </p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-white p-2 hover:bg-white/10 rounded-full transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="p-4 overflow-y-auto max-h-[calc(85vh-100px)]">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <div className="animate-spin text-4xl">🌍</div>
            </div>
          ) : stats ? (
            <div className="space-y-4">
              {/* Level Badge */}
              <div className={`bg-gradient-to-r ${levelInfo.color} p-4 rounded-xl text-center`}>
                <div className="text-4xl mb-2">{levelInfo.emoji}</div>
                <h3 className="text-xl font-bold text-white">{levelInfo.title}</h3>
                <p className="text-white/80 text-sm">Level {achievementLevel} Explorer</p>
              </div>

              {/* Stats Grid */}
              <div className="grid grid-cols-3 gap-3">
                <div className="bg-purple-500/10 border border-purple-500/30 rounded-xl p-3 text-center">
                  <Globe className="w-5 h-5 text-purple-400 mx-auto mb-1" />
                  <p className="text-2xl font-bold text-white">{stats.passports}</p>
                  <p className="text-xs text-gray-400">Passports</p>
                </div>
                <div className="bg-blue-500/10 border border-blue-500/30 rounded-xl p-3 text-center">
                  <Music className="w-5 h-5 text-blue-400 mx-auto mb-1" />
                  <p className="text-2xl font-bold text-white">{stats.musicCreated}</p>
                  <p className="text-xs text-gray-400">Music NFTs</p>
                </div>
                <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-3 text-center">
                  <Palette className="w-5 h-5 text-amber-400 mx-auto mb-1" />
                  <p className="text-2xl font-bold text-white">{stats.artCreated}</p>
                  <p className="text-xs text-gray-400">Art NFTs</p>
                </div>
              </div>

              {/* Itinerary Stats */}
              <div className="bg-gradient-to-r from-cyan-500/10 to-green-500/10 border border-cyan-500/30 rounded-xl p-4">
                <div className="flex items-center gap-2 mb-3">
                  <MapPin className="w-5 h-5 text-cyan-400" />
                  <h4 className="font-bold text-white">Travel Itineraries</h4>
                </div>
                <div className="grid grid-cols-3 gap-2 text-center">
                  <div>
                    <p className="text-xl font-bold text-cyan-400">{stats.itinerariesCreated}</p>
                    <p className="text-xs text-gray-400">Created</p>
                  </div>
                  <div>
                    <p className="text-xl font-bold text-green-400">{stats.itinerariesPurchased}</p>
                    <p className="text-xs text-gray-400">Purchased</p>
                  </div>
                  <div>
                    <p className="text-xl font-bold text-yellow-400">{stats.itinerariesCompleted}</p>
                    <p className="text-xs text-gray-400">Completed</p>
                  </div>
                </div>
              </div>

              {/* Earnings */}
              {parseFloat(stats.totalEarnings) > 0 && (
                <div className="bg-gradient-to-r from-green-500/10 to-emerald-500/10 border border-green-500/30 rounded-xl p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <TrendingUp className="w-5 h-5 text-green-400" />
                      <span className="text-white font-medium">Creator Earnings</span>
                    </div>
                    <span className="text-xl font-bold text-green-400">
                      ~{stats.totalEarnings} WMON
                    </span>
                  </div>
                  <p className="text-xs text-gray-400 mt-1">
                    From itinerary sales (70% creator share)
                  </p>
                </div>
              )}

              {/* Countries Visited */}
              {stats.countries.length > 0 && (
                <div className="bg-black/40 border border-gray-700/50 rounded-xl p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <Star className="w-5 h-5 text-yellow-400" />
                    <h4 className="font-medium text-white">Countries Collected</h4>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {stats.countries.map((code) => (
                      <span
                        key={code}
                        className="px-2 py-1 bg-purple-500/20 text-purple-300 text-xs rounded-lg"
                      >
                        {code}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Purchased Stats */}
              <div className="bg-black/40 border border-gray-700/50 rounded-xl p-4">
                <div className="flex items-center gap-2 mb-2">
                  <Ticket className="w-5 h-5 text-pink-400" />
                  <h4 className="font-medium text-white">Collection</h4>
                </div>
                <p className="text-sm text-gray-400">
                  {stats.musicPurchased} music licenses owned
                </p>
              </div>
            </div>
          ) : (
            <div className="text-center py-12">
              <p className="text-gray-400">No data available</p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-gray-700/50 p-3">
          <a
            href="/profile"
            className="block w-full py-2 text-center text-cyan-400 hover:text-cyan-300 text-sm font-medium transition-colors"
          >
            View Full Profile
          </a>
        </div>
      </div>
    </div>
  );
};
