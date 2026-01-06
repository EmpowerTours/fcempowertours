'use client';

import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X, Trophy, MapPin, Music, Palette, Ticket, Globe, Star, TrendingUp, Search, Loader2, ArrowLeft } from 'lucide-react';

interface ProfileModalProps {
  walletAddress: string;
  userFid?: number;
  username?: string;
  pfpUrl?: string;
  onClose: () => void;
  searchMode?: boolean; // If true, show search input
  onSearchUser?: (username: string) => void;
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
  onClose,
  searchMode = false,
  onSearchUser
}) => {
  const [mounted, setMounted] = useState(false);
  const [stats, setStats] = useState<AchievementStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);

  // For portal rendering
  useEffect(() => {
    setMounted(true);
    console.log('[ProfileModal] Mounted');
    return () => setMounted(false);
  }, []);
  const [searchedUser, setSearchedUser] = useState<{
    fid: number;
    username: string;
    displayName?: string;
    pfpUrl?: string;
    walletAddress?: string;
    bio?: string;
    followerCount?: number;
    userType?: 'artist' | 'collector' | 'new';
    isVerified?: boolean;
    stats?: {
      createdMusic?: number;
      createdArt?: number;
      purchasedMusic?: number;
      purchasedArt?: number;
      passports?: number;
      experiences?: number;
    };
    createdNFTs?: Array<{
      id: string;
      tokenId: number;
      name: string;
      imageUrl?: string;
      isArt: boolean;
      price?: string;
    }>;
    passports?: Array<{
      tokenId: number;
      countryCode?: string;
    }>;
    isPrivate?: boolean;
    privacyMessage?: string;
  } | null>(null);

  // Use searched user's data if available
  const displayWallet = searchedUser?.walletAddress || walletAddress;
  const displayUsername = searchedUser?.username || username;
  const displayPfp = searchedUser?.pfpUrl || pfpUrl;
  const displayFid = searchedUser?.fid || userFid;

  useEffect(() => {
    console.log('[ProfileModal] Mounted, walletAddress:', displayWallet);
    loadStats();
  }, [displayWallet]);

  const loadStats = async () => {
    if (!displayWallet) {
      console.log('[ProfileModal] No wallet address, skipping stats load');
      setLoading(false);
      return;
    }
    setLoading(true);
    console.log('[ProfileModal] Loading stats for:', displayWallet);

    try {
      const addresses = [displayWallet.toLowerCase()];

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

      const newStats = {
        passports: (data.PassportNFT || []).length,
        musicCreated: (data.CreatedMusic || []).length,
        artCreated: (data.CreatedArt || []).length,
        musicPurchased: (data.PurchasedMusic || []).length,
        itinerariesCreated: (data.ItineraryCreated || []).length,
        itinerariesPurchased: (data.ItineraryPurchased || []).length,
        itinerariesCompleted: (data.ItineraryCompleted || []).length,
        totalEarnings: estimatedEarnings.toFixed(0),
        countries
      };
      console.log('[ProfileModal] Stats loaded:', newStats);
      setStats(newStats);
    } catch (error) {
      console.error('[ProfileModal] Failed to load stats:', error);
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

  // Search for Farcaster user using public profile API
  const handleSearch = async () => {
    if (!searchQuery.trim()) return;

    setSearchLoading(true);
    setSearchError(null);

    try {
      console.log('[ProfileModal] Searching for user:', searchQuery);
      // Use the public-profile API which respects privacy settings
      const response = await fetch(`/api/user/public-profile?username=${encodeURIComponent(searchQuery.trim())}`);
      const data = await response.json();

      if (data.success && data.profile) {
        const profile = data.profile;
        console.log('[ProfileModal] Found user profile:', profile.username, 'Type:', profile.userType);

        // Check if profile is private
        if (!profile.privacySettings?.isPublicProfile) {
          setSearchedUser({
            fid: profile.fid,
            username: profile.username,
            displayName: profile.displayName,
            pfpUrl: profile.pfpUrl,
            isPrivate: true,
            privacyMessage: profile.message || 'This user has set their profile to private'
          });
        } else {
          setSearchedUser({
            fid: profile.fid,
            username: profile.username,
            displayName: profile.displayName,
            pfpUrl: profile.pfpUrl,
            walletAddress: profile.walletAddress,
            bio: profile.bio,
            followerCount: profile.followerCount,
            userType: profile.userType,
            isVerified: profile.isVerified,
            stats: profile.stats,
            createdNFTs: profile.createdNFTs,
            passports: profile.passports,
            isPrivate: false
          });
        }
        setSearchError(null);
      } else {
        setSearchError(data.error || 'User not found');
        setSearchedUser(null);
      }
    } catch (error) {
      console.error('[ProfileModal] Search error:', error);
      setSearchError('Failed to search user');
      setSearchedUser(null);
    } finally {
      setSearchLoading(false);
    }
  };

  // Clear search and show own profile
  const clearSearch = () => {
    setSearchedUser(null);
    setSearchQuery('');
    setSearchError(null);
  };

  // Don't render until mounted (for portal)
  if (!mounted) return null;

  const modalContent = (
    <div
      className="fixed inset-0 bg-black/90 backdrop-blur-md flex items-center justify-center p-4"
      style={{ zIndex: 9999, position: 'fixed', top: 0, left: 0, right: 0, bottom: 0 }}
      onClick={onClose}
    >
      <div
        className="bg-gradient-to-br from-gray-900 via-black to-gray-900 border border-purple-500/30 rounded-3xl w-full max-w-lg max-h-[85vh] overflow-hidden shadow-2xl shadow-purple-500/10"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="bg-gradient-to-r from-purple-500/20 to-cyan-500/20 border-b border-purple-500/30 p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-3">
              {searchedUser && (
                <button
                  onClick={clearSearch}
                  className="text-gray-400 hover:text-white p-1 hover:bg-white/10 rounded-full transition-colors mr-1"
                >
                  <ArrowLeft className="w-4 h-4" />
                </button>
              )}
              {displayPfp ? (
                <img
                  src={displayPfp}
                  alt={displayUsername || 'Profile'}
                  className="w-12 h-12 rounded-full border-2 border-purple-500/50"
                />
              ) : (
                <div className="w-12 h-12 bg-gradient-to-br from-purple-500 to-cyan-500 rounded-full flex items-center justify-center">
                  <Trophy className="w-6 h-6 text-white" />
                </div>
              )}
              <div>
                <h2 className="text-lg font-bold text-white">
                  {displayUsername ? `@${displayUsername}` : 'Achievements'}
                </h2>
                <p className="text-xs text-gray-400">
                  {displayWallet ? `${displayWallet.slice(0, 6)}...${displayWallet.slice(-4)}` : 'No wallet connected'}
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

          {/* Search Input */}
          <div className="flex gap-2">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                placeholder="Search Farcaster username..."
                className="w-full pl-9 pr-3 py-2 bg-black/40 border border-purple-500/30 rounded-lg text-white text-sm placeholder-gray-500 focus:border-purple-500 focus:outline-none"
              />
            </div>
            <button
              onClick={handleSearch}
              disabled={searchLoading || !searchQuery.trim()}
              className="px-4 py-2 bg-purple-600 hover:bg-purple-500 disabled:bg-gray-700 disabled:cursor-not-allowed text-white rounded-lg font-medium text-sm transition-colors flex items-center gap-2"
            >
              {searchLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
            </button>
          </div>
          {searchError && (
            <p className="text-red-400 text-xs mt-2">{searchError}</p>
          )}
        </div>

        {/* Content */}
        <div className="p-4 overflow-y-auto max-h-[calc(85vh-180px)]">
          {/* Private Profile View */}
          {searchedUser?.isPrivate ? (
            <div className="text-center py-12">
              <div className="text-4xl mb-4">🔒</div>
              <h3 className="text-lg font-bold text-white mb-2">Private Profile</h3>
              <p className="text-gray-400 text-sm">{searchedUser.privacyMessage}</p>
              {searchedUser.bio && (
                <p className="text-gray-500 text-xs mt-4 italic">"{searchedUser.bio}"</p>
              )}
            </div>
          ) : searchedUser && !searchedUser.isPrivate ? (
            /* Searched User Public Profile - Role Based */
            <div className="space-y-4">
              {/* User Type Badge */}
              <div className={`p-4 rounded-xl text-center ${
                searchedUser.userType === 'artist'
                  ? 'bg-gradient-to-r from-purple-500/20 to-pink-500/20 border border-purple-500/30'
                  : searchedUser.userType === 'collector'
                  ? 'bg-gradient-to-r from-cyan-500/20 to-blue-500/20 border border-cyan-500/30'
                  : 'bg-gradient-to-r from-gray-500/20 to-gray-600/20 border border-gray-500/30'
              }`}>
                <div className="text-4xl mb-2">
                  {searchedUser.userType === 'artist' ? '🎨' : searchedUser.userType === 'collector' ? '🏆' : '🌱'}
                </div>
                <h3 className="text-xl font-bold text-white capitalize">
                  {searchedUser.userType === 'artist' ? 'Artist' : searchedUser.userType === 'collector' ? 'Collector' : 'New Explorer'}
                </h3>
                {searchedUser.isVerified && (
                  <span className="inline-flex items-center gap-1 text-cyan-400 text-xs mt-1">
                    ✓ Verified
                  </span>
                )}
                {searchedUser.followerCount !== undefined && (
                  <p className="text-gray-400 text-xs mt-1">{searchedUser.followerCount.toLocaleString()} followers</p>
                )}
              </div>

              {/* Bio */}
              {searchedUser.bio && (
                <div className="bg-black/40 border border-gray-700/50 rounded-xl p-3">
                  <p className="text-gray-300 text-sm">{searchedUser.bio}</p>
                </div>
              )}

              {/* Stats Grid - Only if available */}
              {searchedUser.stats && (
                <div className="grid grid-cols-3 gap-3">
                  {searchedUser.stats.createdMusic !== undefined && (
                    <div className="bg-blue-500/10 border border-blue-500/30 rounded-xl p-3 text-center">
                      <Music className="w-5 h-5 text-blue-400 mx-auto mb-1" />
                      <p className="text-2xl font-bold text-white">{searchedUser.stats.createdMusic}</p>
                      <p className="text-xs text-gray-400">Music</p>
                    </div>
                  )}
                  {searchedUser.stats.createdArt !== undefined && (
                    <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-3 text-center">
                      <Palette className="w-5 h-5 text-amber-400 mx-auto mb-1" />
                      <p className="text-2xl font-bold text-white">{searchedUser.stats.createdArt}</p>
                      <p className="text-xs text-gray-400">Art</p>
                    </div>
                  )}
                  {searchedUser.stats.passports !== undefined && (
                    <div className="bg-purple-500/10 border border-purple-500/30 rounded-xl p-3 text-center">
                      <Globe className="w-5 h-5 text-purple-400 mx-auto mb-1" />
                      <p className="text-2xl font-bold text-white">{searchedUser.stats.passports}</p>
                      <p className="text-xs text-gray-400">Passports</p>
                    </div>
                  )}
                </div>
              )}

              {/* Created NFTs Preview - For Artists */}
              {searchedUser.createdNFTs && searchedUser.createdNFTs.length > 0 && (
                <div className="bg-black/40 border border-gray-700/50 rounded-xl p-4">
                  <h4 className="font-bold text-white mb-3 flex items-center gap-2">
                    {searchedUser.userType === 'artist' ? <Music className="w-4 h-4 text-purple-400" /> : <Ticket className="w-4 h-4 text-cyan-400" />}
                    Created Works
                  </h4>
                  <div className="grid grid-cols-4 gap-2">
                    {searchedUser.createdNFTs.slice(0, 8).map((nft) => (
                      <div key={nft.id} className="aspect-square rounded-lg overflow-hidden bg-gray-800">
                        {nft.imageUrl ? (
                          <img
                            src={nft.imageUrl.startsWith('ipfs://') ? nft.imageUrl.replace('ipfs://', 'https://harlequin-used-hare-224.mypinata.cloud/ipfs/') : nft.imageUrl}
                            alt={nft.name}
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-2xl">
                            {nft.isArt ? '🎨' : '🎵'}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                  {searchedUser.createdNFTs.length > 8 && (
                    <p className="text-xs text-gray-500 text-center mt-2">
                      +{searchedUser.createdNFTs.length - 8} more
                    </p>
                  )}
                </div>
              )}

              {/* Passports Preview */}
              {searchedUser.passports && searchedUser.passports.length > 0 && (
                <div className="bg-black/40 border border-gray-700/50 rounded-xl p-4">
                  <h4 className="font-bold text-white mb-2 flex items-center gap-2">
                    <Globe className="w-4 h-4 text-purple-400" />
                    Passport Collection
                  </h4>
                  <div className="flex flex-wrap gap-2">
                    {searchedUser.passports.slice(0, 10).map((p) => (
                      <span
                        key={p.tokenId}
                        className="px-2 py-1 bg-purple-500/20 text-purple-300 text-xs rounded-lg"
                      >
                        {p.countryCode || `#${p.tokenId}`}
                      </span>
                    ))}
                    {searchedUser.passports.length > 10 && (
                      <span className="px-2 py-1 bg-gray-700/50 text-gray-400 text-xs rounded-lg">
                        +{searchedUser.passports.length - 10}
                      </span>
                    )}
                  </div>
                </div>
              )}

              {/* View Artist Page Link */}
              {searchedUser.userType === 'artist' && searchedUser.walletAddress && (
                <a
                  href={`/artist/${searchedUser.walletAddress}`}
                  className="block w-full py-3 text-center bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-500 hover:to-pink-500 text-white rounded-xl font-medium transition-colors"
                >
                  View Full Artist Profile →
                </a>
              )}
            </div>
          ) : !displayWallet ? (
            /* No wallet - prompt to search or connect */
            <div className="text-center py-12">
              <div className="text-4xl mb-4">🔍</div>
              <p className="text-gray-400">Search for a Farcaster user above or connect your wallet</p>
            </div>
          ) : loading ? (
            /* Loading own stats */
            <div className="flex items-center justify-center py-12">
              <div className="animate-spin text-4xl">🌍</div>
            </div>
          ) : stats ? (
            /* Own Profile Stats */
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

  // Render via portal to document.body
  return createPortal(modalContent, document.body);
};
