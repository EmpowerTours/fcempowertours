'use client';

import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X, Music, Palette, Globe, ArrowLeft, User, ExternalLink, ShoppingCart, Loader2 } from 'lucide-react';
import Link from 'next/link';

interface UserProfileModalProps {
  walletAddress: string;
  onClose: () => void;
  onBack?: () => void;
  buyerAddress?: string; // Current user's wallet for purchasing
  buyerFid?: number;
  isDarkMode?: boolean;
}

const ENVIO_ENDPOINT = process.env.NEXT_PUBLIC_ENVIO_ENDPOINT!;
const NEYNAR_API_KEY = process.env.NEXT_PUBLIC_NEYNAR_API_KEY || '';

interface UserProfile {
  walletAddress: string;
  fid?: number;
  username?: string;
  displayName?: string;
  pfpUrl?: string;
  bio?: string;
}

interface NFTItem {
  id: string;
  tokenId: string;
  name?: string;
  imageUrl?: string;
  isArt: boolean;
}

interface LicenseItem {
  id: string;
  licenseId: string;
  masterTokenId: string;
  active: boolean;
  masterName?: string;
  masterImage?: string;
  isArt?: boolean;
  // Resale info
  forSale?: boolean;
  salePrice?: string;
  listingId?: string;
}

interface ResaleListing {
  listingId: string;
  licenseId: number;
  seller: string;
  price: string;
  nftName: string;
  imageUrl?: string;
  isArt: boolean;
  active: boolean;
}

interface PassportItem {
  id: string;
  tokenId: string;
  countryCode?: string;
}

const getCountryFlag = (countryCode: string): string => {
  if (!countryCode || countryCode.length !== 2) return '🌍';
  const codePoints = countryCode.toUpperCase().split('').map(char => 127397 + char.charCodeAt(0));
  return String.fromCodePoint(...codePoints);
};

const resolveIPFS = (url: string): string => {
  if (!url) return '';
  if (url.startsWith('ipfs://')) {
    return url.replace('ipfs://', 'https://harlequin-used-hare-224.mypinata.cloud/ipfs/');
  }
  return url;
};

export const UserProfileModal: React.FC<UserProfileModalProps> = ({ walletAddress, onClose, onBack, buyerAddress, buyerFid, isDarkMode = true }) => {
  const [mounted, setMounted] = useState(false);
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [createdNFTs, setCreatedNFTs] = useState<NFTItem[]>([]);
  const [purchasedLicenses, setPurchasedLicenses] = useState<LicenseItem[]>([]);
  const [passports, setPassports] = useState<PassportItem[]>([]);
  const [activeTab, setActiveTab] = useState<'created' | 'purchased' | 'passports'>('purchased');
  const [purchasing, setPurchasing] = useState<string | null>(null);
  const [purchaseError, setPurchaseError] = useState<string | null>(null);
  const [purchaseSuccess, setPurchaseSuccess] = useState<string | null>(null);

  const canPurchase = buyerAddress && buyerAddress.toLowerCase() !== walletAddress.toLowerCase();

  useEffect(() => {
    setMounted(true);
    if (walletAddress) {
      loadUserProfile();
    }
  }, [walletAddress]);

  const loadUserProfile = async () => {
    setLoading(true);
    try {
      const query = `
        query GetUserData($address: String!) {
          CreatedNFT: MusicNFT(where: {artist: {_eq: $address}, isBurned: {_eq: false}}, order_by: {mintedAt: desc}, limit: 50) {
            id
            tokenId
            name
            imageUrl
            isArt
          }
          PurchasedLicenses: MusicLicense(where: {licensee: {_eq: $address}}, order_by: {createdAt: desc}, limit: 50) {
            id
            licenseId
            masterTokenId
            active
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
          }
        }
      `;

      const response = await fetch(ENVIO_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query, variables: { address: walletAddress.toLowerCase() } }),
      });

      const result = await response.json();

      if (result.data) {
        setCreatedNFTs(result.data.CreatedNFT || []);

        // Process purchased licenses
        const licenses = (result.data.PurchasedLicenses || []).map((l: any) => ({
          ...l,
          masterName: l.masterToken?.name,
          masterImage: l.masterToken?.imageUrl,
          isArt: l.masterToken?.isArt,
        }));

        // Fetch resale listings for this seller
        try {
          const resaleResponse = await fetch(`/api/music/list-for-sale?seller=${walletAddress}`);
          const resaleData = await resaleResponse.json();

          if (resaleData.success && resaleData.listings) {
            // Map listings to licenses
            const listingMap = new Map<number, ResaleListing>();
            resaleData.listings.forEach((listing: ResaleListing) => {
              if (listing.active) {
                listingMap.set(listing.licenseId, listing);
              }
            });

            // Merge resale info into licenses
            licenses.forEach((license: LicenseItem) => {
              const listing = listingMap.get(parseInt(license.licenseId));
              if (listing) {
                license.forSale = true;
                license.salePrice = listing.price;
                license.listingId = listing.listingId;
              }
            });
          }
        } catch (err) {
          console.error('[UserProfileModal] Error fetching resale listings:', err);
        }

        setPurchasedLicenses(licenses);
        setPassports(result.data.PassportNFT || []);

        // Set default tab based on data
        if (result.data.CreatedNFT?.length > 0) {
          setActiveTab('created');
        } else if (result.data.PurchasedLicenses?.length > 0) {
          setActiveTab('purchased');
        } else {
          setActiveTab('passports');
        }
      }

      // Get Farcaster profile
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
            });
          } else {
            setProfile({ walletAddress });
          }
        } else {
          setProfile({ walletAddress });
        }
      } catch {
        setProfile({ walletAddress });
      }
    } catch (err) {
      console.error('[UserProfileModal] Error:', err);
      setProfile({ walletAddress });
    } finally {
      setLoading(false);
    }
  };

  const userType = createdNFTs.length > 0 ? 'artist' : (purchasedLicenses.length > 0 ? 'collector' : 'explorer');

  const handlePurchase = async (license: LicenseItem) => {
    if (!buyerAddress || !license.forSale || !license.salePrice || !license.listingId) return;

    setPurchasing(license.licenseId);
    setPurchaseError(null);
    setPurchaseSuccess(null);

    try {
      const response = await fetch('/api/execute-delegated', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'buy_resale',
          userAddress: buyerAddress,
          fid: buyerFid || 0,
          params: {
            licenseId: license.licenseId,
            seller: walletAddress,
            price: license.salePrice,
            listingId: license.listingId
          }
        })
      });

      const data = await response.json();

      if (data.success) {
        setPurchaseSuccess(`Successfully purchased for ${license.salePrice} WMON!`);
        // Update the license to remove for sale status
        setPurchasedLicenses(prev => prev.map(l =>
          l.licenseId === license.licenseId
            ? { ...l, forSale: false, salePrice: undefined, listingId: undefined }
            : l
        ));
        // Clear success message after 5 seconds
        setTimeout(() => setPurchaseSuccess(null), 5000);
      } else {
        setPurchaseError(data.error || 'Purchase failed');
      }
    } catch (error: any) {
      setPurchaseError(error.message || 'Purchase failed');
    } finally {
      setPurchasing(null);
    }
  };

  if (!mounted) return null;

  const modalContent = (
    <div
      className={`fixed inset-0 flex items-center justify-center p-2 sm:p-4 ${isDarkMode ? 'bg-black' : 'bg-white'}`}
      style={{ zIndex: 9999, backgroundColor: isDarkMode ? '#000000' : '#ffffff' }}
      onClick={onClose}
    >
      <div
        className={`rounded-2xl w-full max-w-lg max-h-[90vh] overflow-hidden shadow-2xl flex flex-col ${isDarkMode ? 'bg-gradient-to-br from-gray-900 via-black to-gray-900 border border-purple-500/30' : 'bg-white border border-gray-200'}`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header - Fixed */}
        <div className="bg-gradient-to-r from-purple-500/20 to-cyan-500/20 border-b border-purple-500/30 p-3 flex-shrink-0">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3 min-w-0">
              {onBack && (
                <button
                  onClick={onBack}
                  className="text-gray-400 hover:text-white p-1 hover:bg-white/10 rounded-full transition-colors flex-shrink-0"
                >
                  <ArrowLeft className="w-5 h-5" />
                </button>
              )}
              {profile?.pfpUrl ? (
                <img
                  src={profile.pfpUrl}
                  alt={profile.username || 'Profile'}
                  className="rounded-full border-2 border-purple-500/50 object-cover flex-shrink-0"
                  style={{ width: 48, height: 48, minWidth: 48, maxWidth: 48 }}
                />
              ) : (
                <div
                  className="bg-gradient-to-br from-purple-500 to-cyan-500 rounded-full flex items-center justify-center flex-shrink-0"
                  style={{ width: 48, height: 48, minWidth: 48 }}
                >
                  <User className="w-6 h-6 text-white" />
                </div>
              )}
              <div className="min-w-0">
                <h2 className="text-base font-bold text-white truncate">
                  {profile?.displayName || profile?.username || 'User'}
                </h2>
                <p className="text-xs text-gray-400 font-mono truncate">
                  {walletAddress.slice(0, 10)}...{walletAddress.slice(-8)}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-1 flex-shrink-0">
              <a
                href={`https://monadscan.com/address/${walletAddress}`}
                target="_blank"
                rel="noopener noreferrer"
                className="p-2 text-gray-400 hover:text-white hover:bg-white/10 rounded-lg transition-colors"
              >
                <ExternalLink className="w-4 h-4" />
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
          <div className="mt-2 flex items-center gap-2">
            <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs ${
              userType === 'artist' ? 'bg-purple-500/20 text-purple-300' :
              userType === 'collector' ? 'bg-cyan-500/20 text-cyan-300' :
              'bg-gray-500/20 text-gray-300'
            }`}>
              {userType === 'artist' ? '🎨 Artist' : userType === 'collector' ? '🏆 Collector' : '🌱 Explorer'}
            </span>
          </div>
        </div>

        {/* Stats Row - Fixed */}
        <div className="grid grid-cols-3 gap-2 p-3 border-b border-gray-700/50 flex-shrink-0">
          <div className="text-center">
            <p className="text-lg font-bold text-white">{createdNFTs.length}</p>
            <p className="text-xs text-gray-400">Created</p>
          </div>
          <div className="text-center">
            <p className="text-lg font-bold text-white">{purchasedLicenses.length}</p>
            <p className="text-xs text-gray-400">Purchased</p>
          </div>
          <div className="text-center">
            <p className="text-lg font-bold text-white">{passports.length}</p>
            <p className="text-xs text-gray-400">Passports</p>
          </div>
        </div>

        {/* Tabs - Fixed */}
        <div className="flex border-b border-gray-700/50 flex-shrink-0">
          <button
            onClick={() => setActiveTab('created')}
            className={`flex-1 py-2 text-xs font-medium transition-colors ${
              activeTab === 'created' ? 'text-purple-400 border-b-2 border-purple-400' : 'text-gray-400 hover:text-white'
            }`}
          >
            Created
          </button>
          <button
            onClick={() => setActiveTab('purchased')}
            className={`flex-1 py-2 text-xs font-medium transition-colors ${
              activeTab === 'purchased' ? 'text-cyan-400 border-b-2 border-cyan-400' : 'text-gray-400 hover:text-white'
            }`}
          >
            Purchased
          </button>
          <button
            onClick={() => setActiveTab('passports')}
            className={`flex-1 py-2 text-xs font-medium transition-colors ${
              activeTab === 'passports' ? 'text-pink-400 border-b-2 border-pink-400' : 'text-gray-400 hover:text-white'
            }`}
          >
            Passports
          </button>
        </div>

        {/* Content - Scrollable */}
        <div className="flex-1 overflow-y-auto p-3">
          {loading ? (
            <div className="text-center py-8">
              <div className="animate-spin text-3xl mb-2">🌍</div>
              <p className="text-gray-400 text-sm">Loading...</p>
            </div>
          ) : activeTab === 'created' ? (
            createdNFTs.length === 0 ? (
              <div className="text-center py-8">
                <p className="text-gray-500 text-sm">No created NFTs</p>
              </div>
            ) : (
              <div className="grid grid-cols-3 gap-2">
                {createdNFTs.map((nft) => (
                  <div key={nft.id} className="bg-purple-500/10 border border-purple-500/20 rounded-lg overflow-hidden">
                    <div className="aspect-square">
                      {nft.imageUrl ? (
                        <img src={resolveIPFS(nft.imageUrl)} alt={nft.name || ''} className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full bg-purple-500/20 flex items-center justify-center text-2xl">
                          {nft.isArt ? '🎨' : '🎵'}
                        </div>
                      )}
                    </div>
                    <div className="p-1.5">
                      <p className="text-white text-xs font-medium truncate">{nft.name || `#${nft.tokenId}`}</p>
                    </div>
                  </div>
                ))}
              </div>
            )
          ) : activeTab === 'purchased' ? (
            purchasedLicenses.length === 0 ? (
              <div className="text-center py-8">
                <p className="text-gray-500 text-sm">No purchased NFTs</p>
              </div>
            ) : (
              <>
                {/* Purchase status messages */}
                {purchaseSuccess && (
                  <div className="mb-3 p-2 bg-green-500/20 border border-green-500/30 rounded-lg">
                    <p className="text-green-400 text-xs text-center">✅ {purchaseSuccess}</p>
                  </div>
                )}
                {purchaseError && (
                  <div className="mb-3 p-2 bg-red-500/20 border border-red-500/30 rounded-lg">
                    <p className="text-red-400 text-xs text-center">❌ {purchaseError}</p>
                  </div>
                )}
                <div className="grid grid-cols-2 gap-2">
                  {purchasedLicenses.map((license) => (
                    <div key={license.id} className={`${license.forSale ? 'bg-green-500/10 border-green-500/30' : 'bg-cyan-500/10 border-cyan-500/20'} border rounded-lg overflow-hidden`}>
                      <div className="aspect-square relative">
                        {license.masterImage ? (
                          <img src={resolveIPFS(license.masterImage)} alt={license.masterName || ''} className="w-full h-full object-cover" />
                        ) : (
                          <div className="w-full h-full bg-cyan-500/20 flex items-center justify-center text-2xl">
                            {license.isArt ? '🖼️' : '🎧'}
                          </div>
                        )}
                        {/* For Sale Badge */}
                        {license.forSale && (
                          <div className="absolute top-1 right-1 bg-green-500 text-white text-[10px] px-1.5 py-0.5 rounded-full font-bold">
                            FOR SALE
                          </div>
                        )}
                      </div>
                      <div className="p-2">
                        <p className="text-white text-xs font-medium truncate">{license.masterName || `License #${license.licenseId}`}</p>
                        <div className="flex items-center justify-between mt-1">
                          <span className={`text-xs px-1.5 py-0.5 rounded ${license.active ? 'bg-green-500/20 text-green-400' : 'bg-gray-500/20 text-gray-400'}`}>
                            {license.active ? 'Active' : 'Expired'}
                          </span>
                          {license.forSale && license.salePrice && (
                            <span className="text-green-400 text-xs font-bold">{license.salePrice} WMON</span>
                          )}
                        </div>
                        {/* Buy Button */}
                        {license.forSale && canPurchase && (
                          <button
                            onClick={() => handlePurchase(license)}
                            disabled={purchasing === license.licenseId}
                            className="w-full mt-2 py-1.5 bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-600 hover:to-emerald-700 text-white text-xs rounded-lg font-medium transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-1"
                          >
                            {purchasing === license.licenseId ? (
                              <>
                                <Loader2 className="w-3 h-3 animate-spin" />
                                Buying...
                              </>
                            ) : (
                              <>
                                <ShoppingCart className="w-3 h-3" />
                                Buy {license.salePrice} WMON
                              </>
                            )}
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )
          ) : (
            passports.length === 0 ? (
              <div className="text-center py-8">
                <p className="text-gray-500 text-sm">No passports</p>
              </div>
            ) : (
              <div className="grid grid-cols-4 gap-2">
                {passports.map((passport) => (
                  <div key={passport.id} className="bg-pink-500/10 border border-pink-500/20 rounded-lg p-2 text-center">
                    <span className="text-2xl block">{passport.countryCode ? getCountryFlag(passport.countryCode) : '🌍'}</span>
                    <p className="text-white text-xs mt-1">#{passport.tokenId}</p>
                  </div>
                ))}
              </div>
            )
          )}
        </div>

        {/* Footer - Fixed */}
        {userType === 'artist' && (
          <div className="border-t border-gray-700/50 p-3 flex-shrink-0">
            <Link
              href={`/artist/${walletAddress}`}
              className="block w-full py-2 text-center bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-500 hover:to-pink-500 text-white rounded-lg text-sm font-medium transition-colors"
            >
              View Artist Page →
            </Link>
          </div>
        )}
      </div>
    </div>
  );

  return createPortal(modalContent, document.body);
};

export default UserProfileModal;
