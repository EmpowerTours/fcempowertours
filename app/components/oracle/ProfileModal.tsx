'use client';

import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X, Globe, Music, Palette, MapPin, Ticket, Search, Loader2, User, Wallet, Copy, ExternalLink } from 'lucide-react';
import { getAddressExplorerUrl } from '@/app/chains';

interface ProfileModalProps {
  walletAddress: string;
  userFid?: number;
  username?: string;
  pfpUrl?: string;
  onClose: () => void;
  onViewUserProfile?: (address: string) => void;
  isDarkMode?: boolean;
}

interface UserStats {
  passports: number;
  musicCreated: number;
  artCreated: number;
  musicPurchased: number;
  countries: string[];
}

interface SafeBalance {
  safeAddress: string;
  monBalance: string;
  wmonBalance: string;
}

interface SearchedUser {
  fid: number;
  username: string;
  displayName?: string;
  pfpUrl?: string;
  walletAddress?: string;
  bio?: string;
  followerCount?: number;
  userType?: 'artist' | 'collector' | 'new';
  isPrivate?: boolean;
  stats?: {
    createdMusic?: number;
    createdArt?: number;
    passports?: number;
  };
}

const ENVIO_ENDPOINT = process.env.NEXT_PUBLIC_ENVIO_ENDPOINT!;

export const ProfileModal: React.FC<ProfileModalProps> = ({
  walletAddress,
  userFid,
  username,
  pfpUrl,
  onClose,
  onViewUserProfile,
  isDarkMode = true
}) => {
  const [mounted, setMounted] = useState(false);
  const [stats, setStats] = useState<UserStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [searchedUser, setSearchedUser] = useState<SearchedUser | null>(null);
  const [showFullProfile, setShowFullProfile] = useState(false);
  const [safeBalance, setSafeBalance] = useState<SafeBalance | null>(null);
  const [copiedAddress, setCopiedAddress] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (walletAddress) {
      loadStats(walletAddress);
      loadSafeBalance(walletAddress);
    } else {
      setLoading(false);
    }
  }, [walletAddress]);

  const loadSafeBalance = async (address: string) => {
    try {
      const response = await fetch(`/api/user-safe?address=${address}`);
      const data = await response.json();
      if (data.success) {
        setSafeBalance({
          safeAddress: data.safeAddress || '',
          monBalance: data.balance || '0',
          wmonBalance: data.wmonBalance || '0'
        });
      }
    } catch (error) {
      console.error('[ProfileModal] Safe balance load error:', error);
    }
  };

  const copyAddress = (address: string) => {
    navigator.clipboard.writeText(address);
    setCopiedAddress(true);
    setTimeout(() => setCopiedAddress(false), 2000);
  };

  const loadStats = async (address: string) => {
    setLoading(true);
    try {
      const query = `
        query GetStats($address: String!) {
          PassportNFT(where: {owner: {_eq: $address}}) {
            tokenId
            countryCode
          }
          CreatedMusic: MusicNFT(where: {artist: {_eq: $address}, isArt: {_eq: false}, isBurned: {_eq: false}}) {
            tokenId
          }
          CreatedArt: MusicNFT(where: {artist: {_eq: $address}, isArt: {_eq: true}, isBurned: {_eq: false}}) {
            tokenId
          }
          PurchasedMusic: MusicLicense(where: {licensee: {_eq: $address}}) {
            licenseId
          }
        }
      `;

      const response = await fetch(ENVIO_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query, variables: { address: address.toLowerCase() } })
      });

      const result = await response.json();
      const data = result.data || {};

      const countries = [...new Set(
        (data.PassportNFT || [])
          .map((p: any) => p.countryCode)
          .filter((c: string) => c && c !== 'XX')
      )] as string[];

      setStats({
        passports: (data.PassportNFT || []).length,
        musicCreated: (data.CreatedMusic || []).length,
        artCreated: (data.CreatedArt || []).length,
        musicPurchased: (data.PurchasedMusic || []).length,
        countries
      });
    } catch (error) {
      console.error('[ProfileModal] Stats load error:', error);
      setStats({
        passports: 0,
        musicCreated: 0,
        artCreated: 0,
        musicPurchased: 0,
        countries: []
      });
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = async () => {
    if (!searchQuery.trim()) return;

    setSearchLoading(true);
    setSearchError(null);

    try {
      const response = await fetch(`/api/user/public-profile?username=${encodeURIComponent(searchQuery.trim())}`);
      const data = await response.json();

      if (data.success && data.profile) {
        setSearchedUser({
          fid: data.profile.fid,
          username: data.profile.username,
          displayName: data.profile.displayName,
          pfpUrl: data.profile.pfpUrl,
          walletAddress: data.profile.walletAddress,
          bio: data.profile.bio,
          followerCount: data.profile.followerCount,
          userType: data.profile.userType,
          isPrivate: !data.profile.privacySettings?.isPublicProfile,
          stats: data.profile.stats
        });
      } else {
        setSearchError(data.error || 'User not found');
        setSearchedUser(null);
      }
    } catch (error) {
      setSearchError('Search failed');
      setSearchedUser(null);
    } finally {
      setSearchLoading(false);
    }
  };

  const clearSearch = () => {
    setSearchedUser(null);
    setSearchQuery('');
    setSearchError(null);
    setShowFullProfile(false);
  };

  if (!mounted) return null;

  const ProfilePicture = ({ src, alt, size = 48 }: { src?: string; alt: string; size?: number }) => (
    src ? (
      <img
        src={src}
        alt={alt}
        className="rounded-full border-2 border-purple-500 object-cover flex-shrink-0"
        style={{ width: size, height: size, minWidth: size, maxWidth: size }}
      />
    ) : (
      <div
        className="bg-gradient-to-br from-purple-500 to-cyan-500 rounded-full flex items-center justify-center flex-shrink-0"
        style={{ width: size, height: size, minWidth: size }}
      >
        <User className="text-white" style={{ width: size * 0.5, height: size * 0.5 }} />
      </div>
    )
  );

  // Modal with theme-aware background
  const modalContent = (
    <div
      className={`fixed inset-0 flex items-center justify-center p-4 ${isDarkMode ? 'bg-black' : 'bg-white'}`}
      style={{ zIndex: 9999, backgroundColor: isDarkMode ? '#000000' : '#ffffff' }}
      onClick={onClose}
    >
      <div
        className={`rounded-2xl w-full max-w-md max-h-[95vh] overflow-hidden shadow-2xl ${isDarkMode ? 'bg-gray-900 border border-gray-700' : 'bg-white border border-gray-200'}`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="bg-gray-800 border-b border-gray-700 p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-3">
              <ProfilePicture
                src={searchedUser?.pfpUrl || pfpUrl}
                alt={searchedUser?.username || username || 'Profile'}
              />
              <div className="min-w-0">
                <h2 className="text-lg font-bold text-white truncate">
                  {searchedUser?.displayName || searchedUser?.username || username || 'My Profile'}
                </h2>
                {(searchedUser?.username || username) && (
                  <p className="text-sm text-purple-400">@{searchedUser?.username || username}</p>
                )}
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-2 text-gray-400 hover:text-white hover:bg-gray-700 rounded-lg transition-colors flex-shrink-0"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Search */}
          <div className="flex gap-2">
            <div className="flex-1 relative">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                placeholder="Search username..."
                className="w-full pl-3 pr-9 py-2 rounded-lg text-sm focus:outline-none"
                style={{
                  backgroundColor: '#111827',
                  color: '#ffffff',
                  border: '1px solid #4b5563',
                }}
              />
              <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
            </div>
            <button
              onClick={handleSearch}
              disabled={searchLoading || !searchQuery.trim()}
              className="px-4 py-2 bg-purple-600 hover:bg-purple-500 disabled:bg-gray-600 text-white rounded-lg text-sm transition-colors"
            >
              {searchLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Search'}
            </button>
          </div>

          {searchError && <p className="text-red-400 text-xs mt-2">{searchError}</p>}

          {searchedUser && (
            <button
              onClick={clearSearch}
              className="mt-2 text-xs text-gray-400 hover:text-white"
            >
              ← Back to my profile
            </button>
          )}
        </div>

        {/* Content */}
        <div className="p-4 overflow-y-auto max-h-[calc(95vh-160px)]">
          {searchedUser ? (
            // Searched User View
            <div className="space-y-4">
              {searchedUser.isPrivate ? (
                <div className="text-center py-8">
                  <div className="text-4xl mb-3">🔒</div>
                  <p className="text-gray-400">This profile is private</p>
                </div>
              ) : (
                <>
                  {/* User Type */}
                  <div className={`p-4 rounded-xl text-center ${
                    searchedUser.userType === 'artist' ? 'bg-purple-900 border border-purple-700' :
                    searchedUser.userType === 'collector' ? 'bg-cyan-900 border border-cyan-700' :
                    'bg-gray-800 border border-gray-700'
                  }`}>
                    <div className="text-3xl mb-1">
                      {searchedUser.userType === 'artist' ? '🎨' : searchedUser.userType === 'collector' ? '🏆' : '🌱'}
                    </div>
                    <p className="font-bold text-white capitalize">
                      {searchedUser.userType || 'Explorer'}
                    </p>
                    {searchedUser.followerCount !== undefined && (
                      <p className="text-xs text-gray-400 mt-1">{searchedUser.followerCount} followers</p>
                    )}
                  </div>

                  {/* Bio */}
                  {searchedUser.bio && (
                    <p className="text-sm text-gray-300 bg-gray-800 rounded-lg p-3 border border-gray-700">{searchedUser.bio}</p>
                  )}

                  {/* Stats */}
                  {searchedUser.stats && (
                    <div className="grid grid-cols-3 gap-2">
                      <StatBox icon={<Music className="w-4 h-4" />} value={searchedUser.stats.createdMusic || 0} label="Music" color="purple" />
                      <StatBox icon={<Palette className="w-4 h-4" />} value={searchedUser.stats.createdArt || 0} label="Art" color="amber" />
                      <StatBox icon={<Globe className="w-4 h-4" />} value={searchedUser.stats.passports || 0} label="Passports" color="cyan" />
                    </div>
                  )}

                  {/* View Full Profile Button - opens in modal */}
                  {searchedUser.walletAddress && onViewUserProfile && (
                    <button
                      onClick={() => {
                        setShowFullProfile(true);
                        onViewUserProfile(searchedUser.walletAddress!);
                      }}
                      className="w-full py-3 bg-purple-600 hover:bg-purple-500 text-white rounded-xl font-medium transition-colors"
                    >
                      View Full Profile
                    </button>
                  )}
                </>
              )}
            </div>
          ) : loading ? (
            <div className="text-center py-12">
              <Loader2 className="w-8 h-8 text-purple-400 animate-spin mx-auto mb-3" />
              <p className="text-gray-400">Loading stats...</p>
            </div>
          ) : stats ? (
            // Own Stats View
            <div className="space-y-4">
              {/* Safe Wallet - At top for visibility */}
              {safeBalance && (
                <div className="bg-gradient-to-br from-cyan-900/50 to-purple-900/50 border border-cyan-700/50 rounded-xl p-4">
                  <div className="flex items-center justify-between mb-3">
                    <h4 className="font-medium text-white flex items-center gap-2">
                      <Wallet className="w-5 h-5 text-cyan-400" />
                      Your Safe Wallet
                    </h4>
                    <a
                      href={getAddressExplorerUrl(safeBalance.safeAddress)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm text-cyan-400 hover:text-cyan-300 flex items-center gap-1"
                    >
                      View <ExternalLink className="w-4 h-4" />
                    </a>
                  </div>

                  {/* Balances */}
                  <div className="grid grid-cols-2 gap-3 mb-3">
                    <div className="bg-black/30 rounded-lg p-3 text-center">
                      <p className="text-2xl font-bold text-white">{parseFloat(safeBalance.monBalance).toFixed(2)}</p>
                      <p className="text-sm text-gray-400">MON</p>
                    </div>
                    <div className="bg-black/30 rounded-lg p-3 text-center">
                      <p className="text-2xl font-bold text-cyan-400">{parseFloat(safeBalance.wmonBalance).toFixed(2)}</p>
                      <p className="text-sm text-gray-400">WMON</p>
                    </div>
                  </div>

                  {/* Safe Address */}
                  <div className="flex items-center gap-2 bg-black/30 rounded-lg px-3 py-2">
                    <p className="text-xs text-gray-300 font-mono truncate flex-1">{safeBalance.safeAddress}</p>
                    <button
                      onClick={() => copyAddress(safeBalance.safeAddress)}
                      className={`px-3 py-1 rounded text-sm font-medium transition-all ${
                        copiedAddress ? 'bg-green-500 text-white' : 'bg-cyan-600 hover:bg-cyan-500 text-white'
                      }`}
                    >
                      {copiedAddress ? '✓ Copied' : 'Copy'}
                    </button>
                  </div>

                  {parseFloat(safeBalance.monBalance) < 0.1 && (
                    <p className="text-sm text-yellow-400 mt-3 text-center">
                      Send MON to this address to enable transactions
                    </p>
                  )}
                </div>
              )}

              {/* Stats Grid */}
              <div className="grid grid-cols-2 gap-3">
                <StatBox icon={<Globe className="w-5 h-5" />} value={stats.passports} label="Passports" color="purple" />
                <StatBox icon={<Music className="w-5 h-5" />} value={stats.musicCreated} label="Music Created" color="blue" />
                <StatBox icon={<Palette className="w-5 h-5" />} value={stats.artCreated} label="Art Created" color="amber" />
                <StatBox icon={<Ticket className="w-5 h-5" />} value={stats.musicPurchased} label="Purchased" color="pink" />
              </div>

              {/* Countries */}
              {stats.countries.length > 0 && (
                <div className="bg-gray-800 border border-gray-700 rounded-xl p-3">
                  <h4 className="font-medium text-white mb-2 flex items-center gap-2">
                    <MapPin className="w-4 h-4 text-cyan-400" />
                    Countries Collected
                  </h4>
                  <div className="flex flex-wrap gap-2">
                    {stats.countries.map((code) => (
                      <span key={code} className="px-2 py-1 bg-purple-900 text-purple-300 text-sm rounded-lg border border-purple-700">
                        {code}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="text-center py-12">
              <div className="text-4xl mb-3">🔍</div>
              <p className="text-gray-400">Search for a user or connect wallet</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );

  return createPortal(modalContent, document.body);
};

// Stat Box Component
const StatBox = ({ icon, value, label, color }: { icon: React.ReactNode; value: number; label: string; color: string }) => {
  const colors: Record<string, string> = {
    purple: 'bg-purple-900 border-purple-700 text-purple-400',
    blue: 'bg-blue-900 border-blue-700 text-blue-400',
    amber: 'bg-amber-900 border-amber-700 text-amber-400',
    pink: 'bg-pink-900 border-pink-700 text-pink-400',
    cyan: 'bg-cyan-900 border-cyan-700 text-cyan-400',
  };

  return (
    <div className={`${colors[color]} border rounded-xl p-3 text-center`}>
      <div className="mx-auto mb-1">{icon}</div>
      <p className="text-xl font-bold text-white">{value}</p>
      <p className="text-xs text-gray-400">{label}</p>
    </div>
  );
};

export default ProfileModal;
