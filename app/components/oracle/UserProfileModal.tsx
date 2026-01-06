'use client';

import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X, Music, Palette, Globe, ArrowLeft, User, ExternalLink } from 'lucide-react';
import Link from 'next/link';

interface UserProfileModalProps {
  walletAddress: string;
  onClose: () => void;
  onBack?: () => void;
}

const ENVIO_ENDPOINT = process.env.NEXT_PUBLIC_ENVIO_ENDPOINT || 'https://indexer.dev.hyperindex.xyz/157f9ed/v1/graphql';
const NEYNAR_API_KEY = process.env.NEXT_PUBLIC_NEYNAR_API_KEY || '';

interface UserProfile {
  walletAddress: string;
  fid?: number;
  username?: string;
  displayName?: string;
  pfpUrl?: string;
  bio?: string;
  followerCount?: number;
}

interface NFTItem {
  id: string;
  tokenId: string;
  name?: string;
  imageUrl?: string;
  isArt: boolean;
  price?: string;
  txHash?: string;
}

interface LicenseItem {
  id: string;
  licenseId: string;
  masterTokenId: string;
  active: boolean;
  createdAt: string;
  txHash?: string;
  masterName?: string;
  masterImage?: string;
  isArt?: boolean;
}

interface PassportItem {
  id: string;
  tokenId: string;
  countryCode?: string;
  mintedAt: string;
}

// Helper to get country flag emoji
const getCountryFlag = (countryCode: string): string => {
  if (!countryCode || countryCode.length !== 2) return '🌍';
  const codePoints = countryCode
    .toUpperCase()
    .split('')
    .map(char => 127397 + char.charCodeAt(0));
  return String.fromCodePoint(...codePoints);
};

// IPFS URL Resolver
const resolveIPFS = (url: string): string => {
  if (!url) return '';
  if (url.startsWith('ipfs://')) {
    return url.replace('ipfs://', 'https://harlequin-used-hare-224.mypinata.cloud/ipfs/');
  }
  if (url.includes('/ipfs/')) {
    const cid = url.split('/ipfs/')[1]?.split('?')[0];
    return `https://harlequin-used-hare-224.mypinata.cloud/ipfs/${cid}`;
  }
  return url;
};

export const UserProfileModal: React.FC<UserProfileModalProps> = ({ walletAddress, onClose, onBack }) => {
  const [mounted, setMounted] = useState(false);
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [createdNFTs, setCreatedNFTs] = useState<NFTItem[]>([]);
  const [purchasedLicenses, setPurchasedLicenses] = useState<LicenseItem[]>([]);
  const [passports, setPassports] = useState<PassportItem[]>([]);
  const [activeTab, setActiveTab] = useState<'created' | 'purchased' | 'passports'>('purchased');

  useEffect(() => {
    setMounted(true);
    if (walletAddress) {
      loadUserProfile();
    }
  }, [walletAddress]);

  const loadUserProfile = async () => {
    setLoading(true);
    try {
      // Load blockchain data
      const query = `
        query GetUserData($address: String!) {
          CreatedNFT: MusicNFT(where: {artist: {_eq: $address}, isBurned: {_eq: false}}, order_by: {mintedAt: desc}, limit: 50) {
            id
            tokenId
            name
            imageUrl
            isArt
            price
            txHash
          }
          PurchasedLicenses: MusicLicense(where: {licensee: {_eq: $address}}, order_by: {createdAt: desc}, limit: 50) {
            id
            licenseId
            masterTokenId
            active
            createdAt
            txHash
            masterToken {
              name
              imageUrl
              isArt
            }
          }
          PassportNFT(where: {owner: {_eq: $address}}, order_by: {mintedAt: desc}) {
            id
            tokenId
            countryCode
            mintedAt
          }
        }
      `;

      const response = await fetch(ENVIO_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query,
          variables: { address: walletAddress.toLowerCase() }
        }),
      });

      const result = await response.json();

      if (result.data) {
        setCreatedNFTs(result.data.CreatedNFT || []);
        setPurchasedLicenses((result.data.PurchasedLicenses || []).map((l: any) => ({
          ...l,
          masterName: l.masterToken?.name,
          masterImage: l.masterToken?.imageUrl,
          isArt: l.masterToken?.isArt,
        })));
        setPassports(result.data.PassportNFT || []);

        // Determine which tab to show by default
        if (result.data.CreatedNFT?.length > 0) {
          setActiveTab('created');
        } else if (result.data.PurchasedLicenses?.length > 0) {
          setActiveTab('purchased');
        } else if (result.data.PassportNFT?.length > 0) {
          setActiveTab('passports');
        }
      }

      // Try to get Farcaster profile from wallet address
      try {
        const fcResponse = await fetch(
          `https://api.neynar.com/v2/farcaster/user/bulk-by-address?addresses=${walletAddress}`,
          { headers: { 'api_key': NEYNAR_API_KEY } }
        );
        if (fcResponse.ok) {
          const fcData = await fcResponse.json();
          const fcUser = fcData[walletAddress.toLowerCase()]?.[0];
          if (fcUser) {
            setProfile({
              walletAddress,
              fid: fcUser.fid,
              username: fcUser.username,
              displayName: fcUser.display_name,
              pfpUrl: fcUser.pfp_url,
              bio: fcUser.profile?.bio?.text,
              followerCount: fcUser.follower_count,
            });
          } else {
            setProfile({ walletAddress });
          }
        } else {
          setProfile({ walletAddress });
        }
      } catch (err) {
        console.error('[UserProfileModal] Farcaster lookup failed:', err);
        setProfile({ walletAddress });
      }
    } catch (err) {
      console.error('[UserProfileModal] Error loading profile:', err);
      setProfile({ walletAddress });
    } finally {
      setLoading(false);
    }
  };

  const userType = createdNFTs.length > 0 ? 'artist' : (purchasedLicenses.length > 0 ? 'collector' : 'explorer');

  if (!mounted) return null;

  const modalContent = (
    <div
      className="fixed inset-0 bg-black/90 backdrop-blur-md flex items-center justify-center p-4"
      style={{ zIndex: 9999 }}
      onClick={onClose}
    >
      <div
        className="bg-gradient-to-br from-gray-900 via-black to-gray-900 border border-purple-500/30 rounded-3xl w-full max-w-2xl max-h-[90vh] overflow-hidden shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="bg-gradient-to-r from-purple-500/20 to-cyan-500/20 border-b border-purple-500/30 p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-3">
              {onBack && (
                <button
                  onClick={onBack}
                  className="text-gray-400 hover:text-white p-1 hover:bg-white/10 rounded-full transition-colors"
                >
                  <ArrowLeft className="w-5 h-5" />
                </button>
              )}
              {profile?.pfpUrl ? (
                <img
                  src={profile.pfpUrl}
                  alt={profile.username || 'Profile'}
                  className="w-14 h-14 rounded-full border-2 border-purple-500/50 object-cover"
                />
              ) : (
                <div className="w-14 h-14 bg-gradient-to-br from-purple-500 to-cyan-500 rounded-full flex items-center justify-center">
                  <User className="w-7 h-7 text-white" />
                </div>
              )}
              <div>
                <h2 className="text-lg font-bold text-white">
                  {profile?.displayName || profile?.username || 'Unknown User'}
                </h2>
                {profile?.username && (
                  <p className="text-sm text-purple-400">@{profile.username}</p>
                )}
                <p className="text-xs text-gray-400 font-mono">
                  {walletAddress.slice(0, 8)}...{walletAddress.slice(-6)}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <a
                href={`https://testnet.monadscan.com/address/${walletAddress}`}
                target="_blank"
                rel="noopener noreferrer"
                className="p-2 text-gray-400 hover:text-white hover:bg-white/10 rounded-lg transition-colors"
              >
                <ExternalLink className="w-5 h-5" />
              </a>
              <button
                onClick={onClose}
                className="p-2 text-gray-400 hover:text-white hover:bg-white/10 rounded-lg transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* User Type Badge */}
          <div className={`inline-flex items-center gap-2 px-3 py-1 rounded-full text-sm ${
            userType === 'artist'
              ? 'bg-purple-500/20 text-purple-300 border border-purple-500/30'
              : userType === 'collector'
              ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30'
              : 'bg-gray-500/20 text-gray-300 border border-gray-500/30'
          }`}>
            {userType === 'artist' ? '🎨 Artist' : userType === 'collector' ? '🏆 Collector' : '🌱 Explorer'}
          </div>

          {profile?.bio && (
            <p className="text-sm text-gray-300 mt-3">{profile.bio}</p>
          )}
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-3 p-4 border-b border-gray-700/50">
          <div className="text-center">
            <p className="text-2xl font-bold text-white">{createdNFTs.length}</p>
            <p className="text-xs text-gray-400">Created</p>
          </div>
          <div className="text-center">
            <p className="text-2xl font-bold text-white">{purchasedLicenses.length}</p>
            <p className="text-xs text-gray-400">Purchased</p>
          </div>
          <div className="text-center">
            <p className="text-2xl font-bold text-white">{passports.length}</p>
            <p className="text-xs text-gray-400">Passports</p>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-gray-700/50">
          <button
            onClick={() => setActiveTab('created')}
            className={`flex-1 py-3 text-sm font-medium transition-colors ${
              activeTab === 'created'
                ? 'text-purple-400 border-b-2 border-purple-400'
                : 'text-gray-400 hover:text-white'
            }`}
          >
            Created ({createdNFTs.length})
          </button>
          <button
            onClick={() => setActiveTab('purchased')}
            className={`flex-1 py-3 text-sm font-medium transition-colors ${
              activeTab === 'purchased'
                ? 'text-cyan-400 border-b-2 border-cyan-400'
                : 'text-gray-400 hover:text-white'
            }`}
          >
            Purchased ({purchasedLicenses.length})
          </button>
          <button
            onClick={() => setActiveTab('passports')}
            className={`flex-1 py-3 text-sm font-medium transition-colors ${
              activeTab === 'passports'
                ? 'text-pink-400 border-b-2 border-pink-400'
                : 'text-gray-400 hover:text-white'
            }`}
          >
            Passports ({passports.length})
          </button>
        </div>

        {/* Content */}
        <div className="p-4 overflow-y-auto max-h-[calc(90vh-350px)]">
          {loading ? (
            <div className="text-center py-12">
              <div className="animate-spin text-4xl mb-3">🌍</div>
              <p className="text-gray-400">Loading profile...</p>
            </div>
          ) : activeTab === 'created' ? (
            createdNFTs.length === 0 ? (
              <div className="text-center py-12">
                <p className="text-gray-500">No created NFTs</p>
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {createdNFTs.map((nft) => (
                  <div key={nft.id} className="bg-purple-500/10 border border-purple-500/20 rounded-xl overflow-hidden">
                    {nft.imageUrl ? (
                      <img
                        src={resolveIPFS(nft.imageUrl)}
                        alt={nft.name || `NFT #${nft.tokenId}`}
                        className="w-full aspect-square object-cover"
                      />
                    ) : (
                      <div className="w-full aspect-square bg-purple-500/20 flex items-center justify-center text-4xl">
                        {nft.isArt ? '🎨' : '🎵'}
                      </div>
                    )}
                    <div className="p-2">
                      <p className="font-medium text-white text-sm truncate">{nft.name || `#${nft.tokenId}`}</p>
                      <span className={`text-xs px-2 py-0.5 rounded ${nft.isArt ? 'bg-cyan-500/20 text-cyan-400' : 'bg-purple-500/20 text-purple-400'}`}>
                        {nft.isArt ? 'Art' : 'Music'}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )
          ) : activeTab === 'purchased' ? (
            purchasedLicenses.length === 0 ? (
              <div className="text-center py-12">
                <p className="text-gray-500">No purchased NFTs</p>
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {purchasedLicenses.map((license) => (
                  <div key={license.id} className="bg-cyan-500/10 border border-cyan-500/20 rounded-xl overflow-hidden">
                    {license.masterImage ? (
                      <img
                        src={resolveIPFS(license.masterImage)}
                        alt={license.masterName || `License #${license.licenseId}`}
                        className="w-full aspect-square object-cover"
                      />
                    ) : (
                      <div className="w-full aspect-square bg-cyan-500/20 flex items-center justify-center text-4xl">
                        {license.isArt ? '🖼️' : '🎧'}
                      </div>
                    )}
                    <div className="p-2">
                      <p className="font-medium text-white text-sm truncate">{license.masterName || `License #${license.licenseId}`}</p>
                      <div className="flex justify-between items-center mt-1">
                        <span className={`text-xs px-2 py-0.5 rounded ${license.active ? 'bg-green-500/20 text-green-400' : 'bg-gray-500/20 text-gray-400'}`}>
                          {license.active ? 'Active' : 'Expired'}
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )
          ) : (
            passports.length === 0 ? (
              <div className="text-center py-12">
                <p className="text-gray-500">No passports</p>
              </div>
            ) : (
              <div className="grid grid-cols-3 sm:grid-cols-4 gap-3">
                {passports.map((passport) => (
                  <div key={passport.id} className="bg-pink-500/10 border border-pink-500/20 rounded-xl p-4 text-center">
                    <span className="text-4xl block mb-2">
                      {passport.countryCode ? getCountryFlag(passport.countryCode) : '🌍'}
                    </span>
                    <p className="font-medium text-white text-sm">#{passport.tokenId}</p>
                    {passport.countryCode && (
                      <p className="text-xs text-pink-400">{passport.countryCode}</p>
                    )}
                  </div>
                ))}
              </div>
            )
          )}
        </div>

        {/* Footer - Link to Artist Page if applicable */}
        {userType === 'artist' && (
          <div className="border-t border-gray-700/50 p-3">
            <Link
              href={`/artist/${walletAddress}`}
              className="block w-full py-2 text-center bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-500 hover:to-pink-500 text-white rounded-xl font-medium transition-colors"
            >
              View Full Artist Profile →
            </Link>
          </div>
        )}
      </div>
    </div>
  );

  return createPortal(modalContent, document.body);
};

export default UserProfileModal;
