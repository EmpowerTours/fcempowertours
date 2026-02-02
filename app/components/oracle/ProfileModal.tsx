'use client';

import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X, Globe, Music, Palette, MapPin, Ticket, Search, Loader2, User, Wallet, Copy, ExternalLink, FileText, CheckCircle, Edit3, ChevronRight, Play, Users, DollarSign, ChevronDown, Download } from 'lucide-react';
import { getAddressExplorerUrl } from '@/app/chains';
import { getFlagEmoji, getCountryByCode } from '@/lib/passport/countries';
import { EPKModal } from './EPKModal';
import type { EPKMetadata, ArtistStreamingStats } from '@/lib/epk/types';

interface ProfileModalProps {
  walletAddress: string;
  userFid?: number;
  username?: string;
  pfpUrl?: string;
  onClose: () => void;
  onViewUserProfile?: (address: string) => void;
  onMintPassport?: () => void;
  isDarkMode?: boolean;
}

interface PassportData {
  tokenId: string;
  countryCode: string;
}

interface UserStats {
  passports: number;
  musicCreated: number;
  artCreated: number;
  musicPurchased: number;
  countries: string[];
  passportList: PassportData[];
}

interface SafeBalance {
  safeAddress: string;
  monBalance: string;
  wmonBalance: string;
  toursBalance: string;
  toursWalletBalance: string;
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

interface EPKData {
  slug: string;
  artistName: string;
  genre: string;
  fullEpk?: EPKMetadata;
  streamingStats?: ArtistStreamingStats | null;
}

const ENVIO_ENDPOINT = process.env.NEXT_PUBLIC_ENVIO_ENDPOINT!;

export const ProfileModal: React.FC<ProfileModalProps> = ({
  walletAddress,
  userFid,
  username,
  pfpUrl,
  onClose,
  onViewUserProfile,
  onMintPassport,
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
  const [selectedPassport, setSelectedPassport] = useState<PassportData | null>(null);
  const [epkData, setEpkData] = useState<EPKData | null>(null);
  const [epkLoading, setEpkLoading] = useState(false);
  const [showEPKModal, setShowEPKModal] = useState(false);
  const [showEPKSubmodal, setShowEPKSubmodal] = useState(false);
  const [showEPKViewModal, setShowEPKViewModal] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (walletAddress) {
      loadStats(walletAddress);
      loadSafeBalance(walletAddress);
      loadEPKStatus(walletAddress);
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
          wmonBalance: data.wmonBalance || '0',
          toursBalance: data.toursBalance || '0',
          toursWalletBalance: data.toursWalletBalance || '0',
        });
      }
    } catch (error) {
      console.error('[ProfileModal] Safe balance load error:', error);
    }
  };

  const loadEPKStatus = async (address: string) => {
    setEpkLoading(true);
    try {
      const response = await fetch(`/api/epk/${address}`);
      const data = await response.json();
      if (data.success && data.epk) {
        const epk = data.epk;
        setEpkData({
          slug: epk.artist?.slug || '',
          artistName: epk.artist?.name || '',
          genre: Array.isArray(epk.artist?.genre) ? epk.artist.genre.join(', ') : (epk.artist?.genre || ''),
          fullEpk: epk,
          streamingStats: data.streamingStats || null,
        });
      }
    } catch (error) {
      console.error('[ProfileModal] EPK status load error:', error);
    } finally {
      setEpkLoading(false);
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

      const passportList: PassportData[] = (data.PassportNFT || [])
        .filter((p: any) => p.countryCode && p.countryCode !== 'XX')
        .map((p: any) => ({ tokenId: p.tokenId, countryCode: p.countryCode }));

      const countries = [...new Set(passportList.map(p => p.countryCode))] as string[];

      setStats({
        passports: (data.PassportNFT || []).length,
        musicCreated: (data.CreatedMusic || []).length,
        artCreated: (data.CreatedArt || []).length,
        musicPurchased: (data.PurchasedMusic || []).length,
        countries,
        passportList
      });
    } catch (error) {
      console.error('[ProfileModal] Stats load error:', error);
      setStats({
        passports: 0,
        musicCreated: 0,
        artCreated: 0,
        musicPurchased: 0,
        countries: [],
        passportList: []
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
        <div className={`${isDarkMode ? 'bg-gray-800 border-b border-gray-700' : 'bg-gray-100 border-b border-gray-200'} p-4`}>
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-3">
              <ProfilePicture
                src={searchedUser?.pfpUrl || pfpUrl}
                alt={searchedUser?.username || username || 'Profile'}
              />
              <div className="min-w-0">
                <h2 className={`text-lg font-bold truncate ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>
                  {searchedUser?.displayName || searchedUser?.username || username || 'My Profile'}
                </h2>
                {(searchedUser?.username || username) && (
                  <p className="text-sm text-purple-500">@{searchedUser?.username || username}</p>
                )}
              </div>
            </div>
            <button
              onClick={onClose}
              className={`p-2 rounded-lg transition-colors flex-shrink-0 ${isDarkMode ? 'text-gray-400 hover:text-white hover:bg-gray-700' : 'text-gray-500 hover:text-gray-900 hover:bg-gray-200'}`}
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
                className="w-full pl-3 pr-9 py-2 rounded-lg text-sm focus:outline-none border"
                style={{ backgroundColor: isDarkMode ? '#111827' : '#ffffff', color: isDarkMode ? '#ffffff' : '#111827', borderColor: isDarkMode ? '#4b5563' : '#d1d5db' }}
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
                  <div className="grid grid-cols-3 gap-2 mb-3">
                    <div className="bg-black/30 rounded-lg p-3 text-center">
                      <p className="text-xl font-bold text-white">{parseFloat(safeBalance.monBalance).toFixed(2)}</p>
                      <p className="text-xs text-gray-400">MON</p>
                    </div>
                    <div className="bg-black/30 rounded-lg p-3 text-center">
                      <p className="text-xl font-bold text-cyan-400">{parseFloat(safeBalance.wmonBalance).toFixed(2)}</p>
                      <p className="text-xs text-gray-400">WMON</p>
                    </div>
                    <div className="bg-black/30 rounded-lg p-3 text-center">
                      <p className="text-xl font-bold text-green-400">{(parseFloat(safeBalance.toursBalance) + parseFloat(safeBalance.toursWalletBalance)).toFixed(0)}</p>
                      <p className="text-xs text-gray-400">TOURS</p>
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

              {/* EPK Button - only show for artists (musicCreated > 0) */}
              {stats.musicCreated > 0 && (
                <button
                  onClick={() => setShowEPKSubmodal(true)}
                  disabled={epkLoading}
                  className="w-full flex items-center justify-between bg-gray-800 hover:bg-gray-750 border border-gray-700 hover:border-purple-600 rounded-xl p-3 transition-colors"
                >
                  <div className="flex items-center gap-2.5">
                    <FileText className="w-4 h-4 text-purple-400" />
                    <span className="text-sm font-medium text-white">Press Kit</span>
                    {epkLoading ? (
                      <Loader2 className="w-3.5 h-3.5 text-gray-400 animate-spin" />
                    ) : epkData ? (
                      <span className="flex items-center gap-1 text-xs text-green-400">
                        <CheckCircle className="w-3 h-3" /> Live
                      </span>
                    ) : (
                      <span className="text-xs text-gray-500">Not created</span>
                    )}
                  </div>
                  <ChevronRight className="w-4 h-4 text-gray-500" />
                </button>
              )}

              {/* My Passports Section */}
              <div className="bg-gray-800 border border-gray-700 rounded-xl p-3">
                <h4 className="font-medium text-white mb-2 flex items-center gap-2">
                  <Globe className="w-4 h-4 text-cyan-400" />
                  My Passports ({stats.passports})
                </h4>
                {stats.passportList.length > 0 ? (
                  <div className="flex flex-wrap gap-2 mb-3">
                    {stats.passportList.map((passport) => {
                      const country = getCountryByCode(passport.countryCode);
                      return (
                        <button
                          key={passport.tokenId}
                          onClick={() => setSelectedPassport(passport)}
                          className="px-2 py-1 bg-purple-900 hover:bg-purple-800 text-purple-300 text-lg rounded-lg border border-purple-700 hover:border-purple-500 transition-all cursor-pointer"
                          title={`${country?.name || passport.countryCode} - Click to view passport`}
                        >
                          {getFlagEmoji(passport.countryCode)}
                        </button>
                      );
                    })}
                  </div>
                ) : (
                  <p className="text-sm text-gray-400 mb-3">No passports yet. Mint your first one!</p>
                )}
                {onMintPassport && (
                  <button
                    onClick={onMintPassport}
                    className="w-full py-2 bg-gradient-to-r from-cyan-600 to-purple-600 hover:from-cyan-500 hover:to-purple-500 text-white rounded-lg text-sm font-medium transition-all"
                  >
                    Mint New Passport
                  </button>
                )}
              </div>

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

  // Passport Preview Modal - rendered as separate portal for proper z-index stacking
  const passportPreviewModal = selectedPassport && mounted ? createPortal(
    <div
      className="fixed inset-0 flex items-center justify-center p-4"
      style={{ zIndex: 10001, backgroundColor: isDarkMode ? '#000000' : '#f3f4f6' }}
      onClick={() => setSelectedPassport(null)}
    >
      <div
        className="rounded-2xl overflow-hidden max-w-md w-full shadow-2xl"
        style={{ backgroundColor: isDarkMode ? '#111827' : '#ffffff' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Solid header bar */}
        <div
          className="flex items-center justify-between p-4 border-b"
          style={{
            backgroundColor: isDarkMode ? '#1f2937' : '#f9fafb',
            borderColor: isDarkMode ? '#374151' : '#e5e7eb'
          }}
        >
          <h3 className={`text-lg font-bold ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>
            Passport Preview
          </h3>
          <button
            onClick={() => setSelectedPassport(null)}
            className={`p-2 rounded-full transition-colors ${isDarkMode ? 'text-gray-400 hover:text-white hover:bg-gray-700' : 'text-gray-500 hover:text-gray-900 hover:bg-gray-200'}`}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Passport SVG image - no padding, let SVG fill */}
        <div style={{ backgroundColor: isDarkMode ? '#111827' : '#ffffff' }}>
          <img
            src={`/api/passport/image/${selectedPassport.tokenId}`}
            alt={`Passport #${selectedPassport.tokenId}`}
            className="w-full h-auto"
            onError={(e) => {
              (e.target as HTMLImageElement).src = '/images/passport-placeholder.png';
            }}
          />
        </div>

        {/* Solid footer bar */}
        <div
          className="p-3 border-t text-center"
          style={{
            backgroundColor: isDarkMode ? '#1f2937' : '#f9fafb',
            borderColor: isDarkMode ? '#374151' : '#e5e7eb'
          }}
        >
          <p className={`text-sm font-medium ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>
            {getFlagEmoji(selectedPassport.countryCode)} {getCountryByCode(selectedPassport.countryCode)?.name || selectedPassport.countryCode} • #{selectedPassport.tokenId}
          </p>
        </div>
      </div>
    </div>,
    document.body
  ) : null;

  // EPK Submodal - rendered as separate portal for proper z-index stacking
  const epkSubmodal = showEPKSubmodal && mounted ? createPortal(
    <div
      className="fixed inset-0 flex items-center justify-center p-4"
      style={{ zIndex: 10001, backgroundColor: 'rgba(0,0,0,0.85)' }}
      onClick={() => setShowEPKSubmodal(false)}
    >
      <div
        className="rounded-2xl overflow-hidden max-w-sm w-full shadow-2xl bg-gray-900 border border-gray-700"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-700 bg-gray-800">
          <h3 className="text-lg font-bold text-white flex items-center gap-2">
            <FileText className="w-5 h-5 text-purple-400" />
            Press Kit
          </h3>
          <button
            onClick={() => setShowEPKSubmodal(false)}
            className="p-2 rounded-full text-gray-400 hover:text-white hover:bg-gray-700 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-4 space-y-4">
          {epkData ? (
            <>
              {/* Has EPK - show summary + view/edit */}
              <div className="flex items-center gap-2">
                <CheckCircle className="w-4 h-4 text-green-400" />
                <span className="text-sm text-green-400 font-medium">Press Kit Live</span>
              </div>
              <div>
                <p className="text-white font-medium">{epkData.artistName}</p>
                {epkData.genre && (
                  <p className="text-sm text-gray-400 mt-0.5">{epkData.genre}</p>
                )}
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => {
                    setShowEPKSubmodal(false);
                    setShowEPKViewModal(true);
                  }}
                  className="flex-1 py-2.5 bg-purple-600 hover:bg-purple-500 text-white rounded-lg text-sm font-medium transition-colors text-center flex items-center justify-center gap-1.5"
                >
                  <FileText className="w-3.5 h-3.5" />
                  View Press Kit
                </button>
                <button
                  onClick={() => {
                    setShowEPKSubmodal(false);
                    setShowEPKModal(true);
                  }}
                  className="flex-1 py-2.5 bg-gray-700 hover:bg-gray-600 text-white rounded-lg text-sm font-medium transition-colors flex items-center justify-center gap-1.5"
                >
                  <Edit3 className="w-3.5 h-3.5" />
                  Edit EPK
                </button>
              </div>
            </>
          ) : (
            <>
              {/* No EPK - show create prompt */}
              <div className="text-center py-2">
                <div className="w-12 h-12 bg-purple-900/50 rounded-full flex items-center justify-center mx-auto mb-3">
                  <FileText className="w-6 h-6 text-purple-400" />
                </div>
                <p className="text-white font-medium mb-1">No Press Kit Yet</p>
                <p className="text-sm text-gray-400">Create a professional press kit to share with promoters and venues.</p>
              </div>
              <button
                onClick={() => {
                  setShowEPKSubmodal(false);
                  setShowEPKModal(true);
                }}
                className="w-full py-2.5 bg-gradient-to-r from-purple-600 to-cyan-600 hover:from-purple-500 hover:to-cyan-500 text-white rounded-lg text-sm font-medium transition-all"
              >
                Generate Press Kit (5 WMON)
              </button>
            </>
          )}
        </div>
      </div>
    </div>,
    document.body
  ) : null;

  // EPK View Modal - full press kit view as scrollable sub-modal
  const epkViewModal = showEPKViewModal && mounted && epkData?.fullEpk ? createPortal(
    <div
      className="fixed inset-0 flex items-end sm:items-center justify-center"
      style={{ zIndex: 10002, backgroundColor: 'rgba(0,0,0,0.9)' }}
      onClick={() => setShowEPKViewModal(false)}
    >
      <div
        className="w-full sm:max-w-lg max-h-[92vh] overflow-y-auto rounded-t-2xl sm:rounded-2xl shadow-2xl bg-[#0f172a]"
        onClick={(e) => e.stopPropagation()}
      >
        <EPKViewContent
          epk={epkData.fullEpk}
          stats={epkData.streamingStats}
          onClose={() => setShowEPKViewModal(false)}
          onEdit={() => {
            setShowEPKViewModal(false);
            setShowEPKModal(true);
          }}
        />
      </div>
    </div>,
    document.body
  ) : null;

  return (
    <>
      {createPortal(modalContent, document.body)}
      {passportPreviewModal}
      {epkSubmodal}
      {epkViewModal}
      {showEPKModal && (
        <EPKModal
          isOpen={showEPKModal}
          onClose={() => {
            setShowEPKModal(false);
            if (walletAddress) loadEPKStatus(walletAddress);
          }}
          userAddress={walletAddress}
          userFid={userFid}
          existingEpk={epkData?.fullEpk}
        />
      )}
    </>
  );
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

// EPK View Content - full press kit rendered in a sub-modal
const EPKViewContent = ({
  epk,
  stats,
  onClose,
  onEdit,
}: {
  epk: EPKMetadata;
  stats?: ArtistStreamingStats | null;
  onClose: () => void;
  onEdit: () => void;
}) => {
  const [expandedRider, setExpandedRider] = useState<string | null>(null);
  const verified = !!epk.onChain?.ipfsCid;

  return (
    <>
      {/* Sticky Header */}
      <div className="sticky top-0 z-10 flex items-center justify-between p-4 border-b border-white/10 bg-[#0f172a]/95 backdrop-blur-sm">
        <h3 className="text-lg font-bold text-white flex items-center gap-2">
          <FileText className="w-5 h-5 text-purple-400" />
          Press Kit
        </h3>
        <div className="flex items-center gap-2">
          <a
            href={`/api/epk/pdf/${epk.artist.slug || 'epk'}`}
            className="p-2 rounded-full text-gray-400 hover:text-white hover:bg-white/10 transition-colors"
            title="Download PDF"
          >
            <Download className="w-4 h-4" />
          </a>
          <button
            onClick={onEdit}
            className="p-2 rounded-full text-gray-400 hover:text-white hover:bg-white/10 transition-colors"
            title="Edit EPK"
          >
            <Edit3 className="w-4 h-4" />
          </button>
          <button
            onClick={onClose}
            className="p-2 rounded-full text-gray-400 hover:text-white hover:bg-white/10 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Hero */}
      <div className="px-4 pt-6 pb-4 bg-gradient-to-b from-[#1e1b4b] to-[#0f172a]">
        <div className="flex items-center gap-2 mb-3">
          {verified && (
            <span className="inline-flex items-center gap-1 text-xs font-medium text-green-400 bg-green-400/10 border border-green-400/20 rounded-full px-2.5 py-0.5">
              <CheckCircle className="w-3 h-3" />
              On-Chain Verified
            </span>
          )}
        </div>
        <h1 className="text-2xl font-bold text-white mb-2">{epk.artist.name}</h1>
        <div className="flex flex-wrap gap-1.5 mb-2">
          {epk.artist.genre.map((g) => (
            <span key={g} className="text-xs text-purple-300 bg-purple-500/10 border border-purple-500/20 rounded-full px-3 py-0.5">
              {g}
            </span>
          ))}
        </div>
        <p className="flex items-center gap-1.5 text-sm text-slate-400">
          <MapPin className="w-3.5 h-3.5" />
          {epk.artist.location}
        </p>
      </div>

      <div className="px-4 pb-6 space-y-6">
        {/* About */}
        <section>
          <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-wider mb-2">About</h2>
          <p className="text-sm text-slate-300 leading-relaxed">{epk.artist.bio}</p>
        </section>

        {/* Streaming Stats */}
        {stats && (stats.totalPlays > 0 || stats.totalSales > 0) && (
          <section>
            <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-wider mb-3">On-Chain Stats</h2>
            <div className="grid grid-cols-2 gap-2">
              <div className="bg-[#1e293b] rounded-lg p-3 border border-white/5">
                <div className="flex items-center gap-2 mb-1">
                  <Play className="w-3.5 h-3.5 text-purple-400" />
                  <span className="text-xs text-slate-400">Plays</span>
                </div>
                <p className="text-lg font-bold text-white">{stats.totalPlays.toLocaleString()}</p>
              </div>
              <div className="bg-[#1e293b] rounded-lg p-3 border border-white/5">
                <div className="flex items-center gap-2 mb-1">
                  <Users className="w-3.5 h-3.5 text-blue-400" />
                  <span className="text-xs text-slate-400">Listeners</span>
                </div>
                <p className="text-lg font-bold text-white">{stats.uniqueListeners.toLocaleString()}</p>
              </div>
              <div className="bg-[#1e293b] rounded-lg p-3 border border-white/5">
                <div className="flex items-center gap-2 mb-1">
                  <Music className="w-3.5 h-3.5 text-green-400" />
                  <span className="text-xs text-slate-400">Sales</span>
                </div>
                <p className="text-lg font-bold text-white">{stats.totalSales.toLocaleString()}</p>
              </div>
              <div className="bg-[#1e293b] rounded-lg p-3 border border-white/5">
                <div className="flex items-center gap-2 mb-1">
                  <DollarSign className="w-3.5 h-3.5 text-amber-400" />
                  <span className="text-xs text-slate-400">Revenue</span>
                </div>
                <p className="text-lg font-bold text-white">{stats.totalRevenue} WMON</p>
              </div>
            </div>
          </section>
        )}

        {/* Press */}
        {epk.press.length > 0 && (
          <section>
            <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-wider mb-3">Press</h2>
            <div className="space-y-2">
              {epk.press.map((article, i) => (
                <a
                  key={i}
                  href={article.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block bg-[#1e293b] rounded-lg p-3 border border-white/5 hover:border-purple-500/30 transition-colors"
                >
                  <p className="text-xs font-semibold text-purple-400 uppercase tracking-wider">{article.outlet}</p>
                  <p className="text-sm text-white font-medium mt-1 line-clamp-2">{article.title}</p>
                  <p className="text-xs text-slate-500 mt-1">
                    {new Date(article.date).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })}
                  </p>
                </a>
              ))}
            </div>
          </section>
        )}

        {/* Media / Videos */}
        {epk.media.videos.length > 0 && (
          <section>
            <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-wider mb-3">Media</h2>
            <div className="space-y-2">
              {epk.media.videos.map((video, i) => (
                <a
                  key={i}
                  href={video.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-3 bg-[#1e293b] rounded-lg p-3 border border-white/5 hover:border-purple-500/30 transition-colors"
                >
                  <Play className="w-8 h-8 text-purple-400 flex-shrink-0" />
                  <div className="min-w-0">
                    <p className="text-sm text-white font-medium truncate">{video.title}</p>
                    <p className="text-xs text-slate-500 capitalize">{video.platform}</p>
                  </div>
                </a>
              ))}
            </div>
          </section>
        )}

        {/* Booking Info */}
        {epk.booking.inquiryEnabled && (
          <section>
            <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-wider mb-3">Booking</h2>
            <div className="bg-[#1e293b] rounded-lg p-4 border border-white/5 space-y-3">
              <p className="text-sm text-white font-medium">{epk.booking.pricing}</p>
              {epk.booking.minimumDeposit && (
                <p className="text-xs text-slate-400">Min. deposit: {epk.booking.minimumDeposit} WMON</p>
              )}
              <div>
                <p className="text-xs text-slate-500 mb-1">Available For</p>
                <div className="flex flex-wrap gap-1">
                  {epk.booking.availableFor.map((item, i) => (
                    <span key={i} className="text-xs text-slate-300 bg-white/5 rounded-full px-2.5 py-0.5">{item}</span>
                  ))}
                </div>
              </div>
              <div>
                <p className="text-xs text-slate-500 mb-1">Territories</p>
                <p className="text-xs text-slate-300">{epk.booking.territories.join(', ')}</p>
              </div>
            </div>
          </section>
        )}

        {/* Technical Rider (collapsible) */}
        {epk.technicalRider && (
          <section>
            <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-wider mb-3">Technical Rider</h2>
            <div className="space-y-1">
              {Object.values(epk.technicalRider).map((section: any) => (
                <div key={section.title} className="bg-[#1e293b] rounded-lg border border-white/5 overflow-hidden">
                  <button
                    onClick={() => setExpandedRider(expandedRider === `tech-${section.title}` ? null : `tech-${section.title}`)}
                    className="w-full flex items-center justify-between p-3 text-left hover:bg-white/5 transition-colors"
                  >
                    <span className="text-sm text-white font-medium">{section.title}</span>
                    <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform ${expandedRider === `tech-${section.title}` ? 'rotate-180' : ''}`} />
                  </button>
                  {expandedRider === `tech-${section.title}` && (
                    <div className="px-3 pb-3 border-t border-white/5">
                      <ul className="space-y-1 mt-2">
                        {section.items.map((item: string, i: number) => (
                          <li key={i} className="text-xs text-slate-400 flex items-start gap-2">
                            <span className="text-purple-400 mt-0.5">&#8226;</span>
                            {item}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Hospitality Rider (collapsible) */}
        {epk.hospitalityRider && (
          <section>
            <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-wider mb-3">Hospitality Rider</h2>
            <div className="space-y-1">
              {Object.values(epk.hospitalityRider).map((section: any) => (
                <div key={section.title} className="bg-[#1e293b] rounded-lg border border-white/5 overflow-hidden">
                  <button
                    onClick={() => setExpandedRider(expandedRider === `hosp-${section.title}` ? null : `hosp-${section.title}`)}
                    className="w-full flex items-center justify-between p-3 text-left hover:bg-white/5 transition-colors"
                  >
                    <span className="text-sm text-white font-medium">{section.title}</span>
                    <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform ${expandedRider === `hosp-${section.title}` ? 'rotate-180' : ''}`} />
                  </button>
                  {expandedRider === `hosp-${section.title}` && (
                    <div className="px-3 pb-3 border-t border-white/5">
                      <ul className="space-y-1 mt-2">
                        {section.items.map((item: string, i: number) => (
                          <li key={i} className="text-xs text-slate-400 flex items-start gap-2">
                            <span className="text-purple-400 mt-0.5">&#8226;</span>
                            {item}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Socials */}
        {epk.socials && (epk.socials.farcaster || epk.socials.twitter || epk.socials.instagram || epk.socials.website) && (
          <section>
            <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-wider mb-3">Links</h2>
            <div className="flex flex-wrap gap-2">
              {epk.socials.farcaster && (
                <a href={`https://farcaster.xyz/${epk.socials.farcaster}`} target="_blank" rel="noopener noreferrer"
                  className="text-xs text-purple-300 bg-purple-500/10 border border-purple-500/20 rounded-full px-3 py-1.5 hover:bg-purple-500/20 transition-colors">
                  Farcaster
                </a>
              )}
              {epk.socials.twitter && (
                <a href={`https://twitter.com/${epk.socials.twitter}`} target="_blank" rel="noopener noreferrer"
                  className="text-xs text-blue-300 bg-blue-500/10 border border-blue-500/20 rounded-full px-3 py-1.5 hover:bg-blue-500/20 transition-colors">
                  Twitter
                </a>
              )}
              {epk.socials.instagram && (
                <a href={`https://instagram.com/${epk.socials.instagram}`} target="_blank" rel="noopener noreferrer"
                  className="text-xs text-pink-300 bg-pink-500/10 border border-pink-500/20 rounded-full px-3 py-1.5 hover:bg-pink-500/20 transition-colors">
                  Instagram
                </a>
              )}
              {epk.socials.website && (
                <a href={epk.socials.website} target="_blank" rel="noopener noreferrer"
                  className="text-xs text-slate-300 bg-white/5 border border-white/10 rounded-full px-3 py-1.5 hover:bg-white/10 transition-colors">
                  Website
                </a>
              )}
            </div>
          </section>
        )}

        {/* On-Chain Info */}
        {verified && epk.onChain?.ipfsCid && (
          <div className="text-center pt-2 border-t border-white/5">
            <p className="text-xs text-slate-500">
              IPFS: {epk.onChain.ipfsCid.slice(0, 16)}...
            </p>
            <p className="text-xs text-slate-600 mt-1">Powered by EmpowerTours on Monad</p>
          </div>
        )}
      </div>
    </>
  );
};

export default ProfileModal;
