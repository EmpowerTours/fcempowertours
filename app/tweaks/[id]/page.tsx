'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useFarcasterContext } from '@/app/hooks/useFarcasterContext';
import Link from 'next/link';

// Tweak Detail Page - /tweaks/[id]
// Shows full details, reviews, versions, and purchase options

const styles = `
  @keyframes fadeIn {
    from { opacity: 0; transform: translateY(20px); }
    to { opacity: 1; transform: translateY(0); }
  }
  .animate-fadeIn {
    animation: fadeIn 0.5s ease-out;
  }
`;

interface TweakDetails {
  id: number;
  name: string;
  description: string;
  developer: string;
  developerName: string;
  priceInTours: string;
  priceInMon: string;
  category: string;
  iconHash: string;
  totalSales: number;
  rating: number;
  reviewCount: number;
  isVerified: boolean;
  compatibleVersions: string[];
  createdAt: number;
  updatedAt: number;
  changelog?: string;
  screenshots?: string[];
}

interface Review {
  reviewer: string;
  reviewerName: string;
  rating: number;
  comment: string;
  timestamp: number;
  helpfulVotes: number;
}

interface Version {
  versionNumber: string;
  changelog: string;
  timestamp: number;
}

// Mock data
const mockTweakDetails: Record<number, TweakDetails> = {
  1: {
    id: 1,
    name: 'Snowboard',
    description: `Snowboard is the modern theming engine for iOS. It allows you to completely customize your device's appearance with themes, icons, badges, fonts, and more.

Features:
• Apply icon themes and icon masks
• Customize dock, folders, and badges
• Change system fonts
• Apply UI themes (settings, CC, etc.)
• Preset manager for quick switching
• Low memory footprint
• Compatible with most themes

Snowboard is actively maintained and supports the latest iOS versions. It's designed to be lightweight while providing powerful theming capabilities.`,
    developer: '0x1234567890123456789012345678901234567890',
    developerName: 'SparkDev',
    priceInTours: '50',
    priceInMon: '0.5',
    category: 'themes',
    iconHash: '',
    totalSales: 1542,
    rating: 4.8,
    reviewCount: 234,
    isVerified: true,
    compatibleVersions: ['18.0', '18.1', '18.2'],
    createdAt: Date.now() - 86400000 * 365,
    updatedAt: Date.now() - 86400000 * 2,
    changelog: 'Added support for iOS 18.2, fixed icon mask issues, improved performance',
  },
};

const mockReviews: Review[] = [
  {
    reviewer: '0xabc...def',
    reviewerName: 'JailbreakFan',
    rating: 5,
    comment: 'Best theming engine ever! Works perfectly on iOS 18.1. Highly recommended.',
    timestamp: Date.now() - 86400000 * 5,
    helpfulVotes: 42,
  },
  {
    reviewer: '0x123...456',
    reviewerName: 'TweakLover',
    rating: 5,
    comment: 'Finally a theme engine that actually works. Low battery impact too!',
    timestamp: Date.now() - 86400000 * 12,
    helpfulVotes: 28,
  },
  {
    reviewer: '0x789...012',
    reviewerName: 'iOSModder',
    rating: 4,
    comment: 'Great tweak, but some themes still have compatibility issues. Developer is responsive though.',
    timestamp: Date.now() - 86400000 * 20,
    helpfulVotes: 15,
  },
];

const mockVersions: Version[] = [
  { versionNumber: '3.0.1', changelog: 'Added iOS 18.2 support, fixed icon mask bugs', timestamp: Date.now() - 86400000 * 2 },
  { versionNumber: '3.0.0', changelog: 'Major rewrite for iOS 18, new preset system', timestamp: Date.now() - 86400000 * 30 },
  { versionNumber: '2.9.5', changelog: 'Bug fixes and performance improvements', timestamp: Date.now() - 86400000 * 60 },
];

export default function TweakDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { walletAddress, requestWallet } = useFarcasterContext();

  const tweakId = parseInt(params.id as string);

  const [tweak, setTweak] = useState<TweakDetails | null>(null);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [versions, setVersions] = useState<Version[]>([]);
  const [loading, setLoading] = useState(true);
  const [purchasing, setPurchasing] = useState(false);
  const [hasPurchased, setHasPurchased] = useState(false);
  const [activeTab, setActiveTab] = useState<'details' | 'reviews' | 'versions'>('details');

  useEffect(() => {
    // Fetch tweak details
    const fetchTweak = async () => {
      setLoading(true);
      try {
        // In production, fetch from API
        // const res = await fetch(`/api/tweaks?id=${tweakId}`);
        // const data = await res.json();
        // setTweak(data.tweak);

        // For now, use mock data
        await new Promise(r => setTimeout(r, 500));
        setTweak(mockTweakDetails[1]); // Always show Snowboard for demo
        setReviews(mockReviews);
        setVersions(mockVersions);
      } catch (error) {
        console.error('Failed to fetch tweak:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchTweak();
  }, [tweakId]);

  const handlePurchase = async (paymentType: 'tours' | 'mon') => {
    if (!walletAddress) {
      await requestWallet();
      return;
    }

    setPurchasing(true);
    try {
      const res = await fetch('/api/tweaks/purchase', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tweakId,
          buyerAddress: walletAddress,
          paymentType,
        }),
      });

      const data = await res.json();
      if (data.success) {
        setHasPurchased(true);
        alert(`Successfully purchased ${tweak?.name}! You can now download it.`);
      } else {
        alert(data.error || 'Purchase failed');
      }
    } catch (error) {
      console.error('Purchase error:', error);
      alert('Purchase failed. Please try again.');
    } finally {
      setPurchasing(false);
    }
  };

  const handleDownload = async () => {
    try {
      const res = await fetch(`/api/tweaks/download?tweakId=${tweakId}&address=${walletAddress}`);
      const data = await res.json();

      if (data.success) {
        // Open download URL
        window.open(data.download.url, '_blank');
      } else {
        alert(data.error || 'Download failed');
      }
    } catch (error) {
      console.error('Download error:', error);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-900 via-purple-900 to-gray-900 flex items-center justify-center">
        <div className="text-white text-xl">Loading...</div>
      </div>
    );
  }

  if (!tweak) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-900 via-purple-900 to-gray-900 flex items-center justify-center">
        <div className="text-center">
          <div className="text-6xl mb-4">😕</div>
          <h1 className="text-2xl font-bold text-white mb-2">Tweak Not Found</h1>
          <p className="text-gray-400 mb-6">The tweak you're looking for doesn't exist.</p>
          <Link href="/tweaks" className="px-6 py-3 bg-purple-600 text-white rounded-lg">
            Back to Tweaks
          </Link>
        </div>
      </div>
    );
  }

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: styles }} />
      <div className="min-h-screen bg-gradient-to-br from-gray-900 via-purple-900 to-gray-900">
        {/* Header */}
        <div className="bg-black/30 backdrop-blur-lg border-b border-white/10">
          <div className="max-w-5xl mx-auto px-4 py-4">
            <Link href="/tweaks" className="text-purple-400 hover:text-purple-300 flex items-center gap-2">
              ← Back to Tweaks
            </Link>
          </div>
        </div>

        <div className="max-w-5xl mx-auto px-4 py-8">
          {/* Tweak Header */}
          <div className="bg-white/5 backdrop-blur-lg rounded-2xl border border-white/10 p-6 mb-6 animate-fadeIn">
            <div className="flex gap-6">
              {/* Icon */}
              <div className="w-32 h-32 rounded-2xl bg-gradient-to-br from-purple-600 to-pink-600 flex items-center justify-center text-5xl shrink-0">
                🎨
              </div>

              {/* Info */}
              <div className="flex-1">
                <div className="flex items-center gap-3 mb-2">
                  <h1 className="text-3xl font-bold text-white">{tweak.name}</h1>
                  {tweak.isVerified && (
                    <span className="px-2 py-1 bg-blue-500/20 text-blue-400 text-xs rounded-full">
                      ✓ Verified
                    </span>
                  )}
                </div>

                <p className="text-gray-400 mb-3">by {tweak.developerName}</p>

                <div className="flex items-center gap-6 text-sm">
                  <div className="flex items-center gap-1">
                    <span className="text-yellow-400">★</span>
                    <span className="text-white font-bold">{tweak.rating}</span>
                    <span className="text-gray-500">({tweak.reviewCount} reviews)</span>
                  </div>
                  <div className="text-gray-400">
                    {tweak.totalSales.toLocaleString()} downloads
                  </div>
                  <div className="text-gray-400 capitalize">
                    {tweak.category}
                  </div>
                </div>

                {/* iOS Versions */}
                <div className="mt-4 flex gap-2">
                  {tweak.compatibleVersions.map(v => (
                    <span key={v} className="px-3 py-1 bg-white/10 text-gray-300 text-sm rounded-lg">
                      iOS {v}
                    </span>
                  ))}
                </div>
              </div>

              {/* Purchase Card */}
              <div className="w-64 shrink-0">
                <div className="bg-white/10 rounded-xl p-4">
                  <div className="text-center mb-4">
                    <p className="text-2xl font-bold text-purple-400">{tweak.priceInTours} TOURS</p>
                    <p className="text-gray-500 text-sm">or {tweak.priceInMon} MON</p>
                  </div>

                  {hasPurchased ? (
                    <button
                      onClick={handleDownload}
                      className="w-full px-4 py-3 bg-green-600 hover:bg-green-700 text-white rounded-lg font-medium transition-all"
                    >
                      ⬇️ Download .deb
                    </button>
                  ) : (
                    <div className="space-y-2">
                      <button
                        onClick={() => handlePurchase('tours')}
                        disabled={purchasing}
                        className="w-full px-4 py-3 bg-purple-600 hover:bg-purple-700 disabled:bg-purple-800 text-white rounded-lg font-medium transition-all"
                      >
                        {purchasing ? '⏳ Processing...' : 'Buy with TOURS'}
                      </button>
                      <button
                        onClick={() => handlePurchase('mon')}
                        disabled={purchasing}
                        className="w-full px-4 py-2 bg-white/10 hover:bg-white/20 text-white rounded-lg font-medium transition-all"
                      >
                        Buy with MON
                      </button>
                    </div>
                  )}

                  <p className="text-gray-500 text-xs text-center mt-3">
                    Platform fee: 2.5%
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Tabs */}
          <div className="flex gap-4 mb-6">
            {(['details', 'reviews', 'versions'] as const).map(tab => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`px-6 py-2 rounded-lg font-medium transition-all capitalize ${
                  activeTab === tab
                    ? 'bg-purple-600 text-white'
                    : 'bg-white/10 text-gray-300 hover:bg-white/20'
                }`}
              >
                {tab}
                {tab === 'reviews' && ` (${reviews.length})`}
              </button>
            ))}
          </div>

          {/* Tab Content */}
          <div className="bg-white/5 backdrop-blur-lg rounded-2xl border border-white/10 p-6 animate-fadeIn">
            {activeTab === 'details' && (
              <div>
                <h2 className="text-xl font-bold text-white mb-4">Description</h2>
                <div className="text-gray-300 whitespace-pre-line">
                  {tweak.description}
                </div>

                {tweak.changelog && (
                  <div className="mt-8">
                    <h2 className="text-xl font-bold text-white mb-4">Latest Update</h2>
                    <p className="text-gray-400">{tweak.changelog}</p>
                  </div>
                )}
              </div>
            )}

            {activeTab === 'reviews' && (
              <div className="space-y-4">
                <h2 className="text-xl font-bold text-white mb-4">Reviews</h2>
                {reviews.map((review, i) => (
                  <div key={i} className="bg-white/5 rounded-xl p-4">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <span className="text-white font-medium">{review.reviewerName}</span>
                        <div className="flex">
                          {[...Array(5)].map((_, j) => (
                            <span key={j} className={j < review.rating ? 'text-yellow-400' : 'text-gray-600'}>
                              ★
                            </span>
                          ))}
                        </div>
                      </div>
                      <span className="text-gray-500 text-sm">
                        {new Date(review.timestamp).toLocaleDateString()}
                      </span>
                    </div>
                    <p className="text-gray-300">{review.comment}</p>
                    <div className="mt-2 text-sm text-gray-500">
                      👍 {review.helpfulVotes} found this helpful
                    </div>
                  </div>
                ))}
              </div>
            )}

            {activeTab === 'versions' && (
              <div className="space-y-4">
                <h2 className="text-xl font-bold text-white mb-4">Version History</h2>
                {versions.map((version, i) => (
                  <div key={i} className="bg-white/5 rounded-xl p-4">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-purple-400 font-mono font-bold">v{version.versionNumber}</span>
                      <span className="text-gray-500 text-sm">
                        {new Date(version.timestamp).toLocaleDateString()}
                      </span>
                    </div>
                    <p className="text-gray-300">{version.changelog}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
