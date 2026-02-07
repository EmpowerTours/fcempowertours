'use client';

import { useState, useEffect } from 'react';
import { useFarcasterContext } from '@/app/hooks/useFarcasterContext';
import Link from 'next/link';

// Animation styles
const styles = `
  @keyframes fadeIn {
    from { opacity: 0; transform: translateY(20px); }
    to { opacity: 1; transform: translateY(0); }
  }
  @keyframes pulse {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.7; }
  }
  .animate-fadeIn {
    animation: fadeIn 0.5s ease-out;
  }
  .animate-pulse {
    animation: pulse 2s infinite;
  }
`;

// Contract address (deploy and update)
const EMPOWERTWEAKS_ADDRESS = process.env.NEXT_PUBLIC_EMPOWERTWEAKS_CONTRACT || '';

// Category icons
const categoryIcons: Record<string, string> = {
  tweaks: '⚙️',
  themes: '🎨',
  utilities: '🔧',
  apps: '📱',
  widgets: '📊',
  lockscreen: '🔒',
  statusbar: '📶',
  keyboard: '⌨️',
};

// Mock data for development (replace with contract calls)
const mockTweaks = [
  {
    id: 1,
    name: 'Snowboard',
    description: 'Modern theming engine for iOS. Apply themes, icons, and more.',
    developer: '0x1234...5678',
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
  },
  {
    id: 2,
    name: 'Filza File Manager',
    description: 'Full-featured file manager with root access. Browse, edit, and manage all files.',
    developer: '0xabcd...efgh',
    developerName: 'TIGI Software',
    priceInTours: '100',
    priceInMon: '1.0',
    category: 'utilities',
    iconHash: '',
    totalSales: 3211,
    rating: 4.9,
    reviewCount: 567,
    isVerified: true,
    compatibleVersions: ['18.0', '18.1'],
  },
  {
    id: 3,
    name: 'LocationFaker',
    description: 'Fake your GPS location in any app. Perfect for Pokemon GO, location-locked apps.',
    developer: '0x9876...5432',
    developerName: 'Nepeta',
    priceInTours: '75',
    priceInMon: '0.75',
    category: 'tweaks',
    iconHash: '',
    totalSales: 892,
    rating: 4.5,
    reviewCount: 123,
    isVerified: true,
    compatibleVersions: ['18.0', '18.1', '18.2'],
  },
  {
    id: 4,
    name: 'Prysm',
    description: 'Complete control center replacement with customizable toggles and modules.',
    developer: '0x1111...2222',
    developerName: 'LaughingQuoll',
    priceInTours: '150',
    priceInMon: '1.5',
    category: 'tweaks',
    iconHash: '',
    totalSales: 2156,
    rating: 4.7,
    reviewCount: 345,
    isVerified: true,
    compatibleVersions: ['18.0', '18.1'],
  },
  {
    id: 5,
    name: 'Velvet',
    description: 'Beautiful notification banners with blur effects and animations.',
    developer: '0x3333...4444',
    developerName: 'Chariz',
    priceInTours: '25',
    priceInMon: '0.25',
    category: 'tweaks',
    iconHash: '',
    totalSales: 445,
    rating: 4.3,
    reviewCount: 67,
    isVerified: false,
    compatibleVersions: ['18.1', '18.2'],
  },
  {
    id: 6,
    name: 'PokeGo++ ',
    description: 'Enhanced Pokemon GO with joystick, teleport, and IV checker.',
    developer: '0x5555...6666',
    developerName: 'Global++',
    priceInTours: '200',
    priceInMon: '2.0',
    category: 'apps',
    iconHash: '',
    totalSales: 5678,
    rating: 4.6,
    reviewCount: 890,
    isVerified: true,
    compatibleVersions: ['18.0', '18.1'],
  },
];

interface Tweak {
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
}

export default function TweaksPage() {
  const { user, walletAddress, isLoading: contextLoading, requestWallet } = useFarcasterContext();

  const [tweaks, setTweaks] = useState<Tweak[]>(mockTweaks);
  const [filteredTweaks, setFilteredTweaks] = useState<Tweak[]>(mockTweaks);
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<'popular' | 'newest' | 'price'>('popular');
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [purchasing, setPurchasing] = useState<number | null>(null);

  // Filter and sort tweaks
  useEffect(() => {
    let filtered = [...tweaks];

    // Category filter
    if (selectedCategory !== 'all') {
      filtered = filtered.filter(t => t.category === selectedCategory);
    }

    // Search filter
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(t =>
        t.name.toLowerCase().includes(query) ||
        t.description.toLowerCase().includes(query) ||
        t.developerName.toLowerCase().includes(query)
      );
    }

    // Sort
    if (sortBy === 'popular') {
      filtered.sort((a, b) => b.totalSales - a.totalSales);
    } else if (sortBy === 'price') {
      filtered.sort((a, b) => parseFloat(a.priceInTours) - parseFloat(b.priceInTours));
    }

    setFilteredTweaks(filtered);
  }, [tweaks, selectedCategory, searchQuery, sortBy]);

  const handlePurchase = async (tweakId: number, paymentType: 'tours' | 'mon') => {
    if (!walletAddress) {
      await requestWallet();
      return;
    }

    setPurchasing(tweakId);

    try {
      // TODO: Implement actual contract call
      // For now, simulate purchase
      await new Promise(resolve => setTimeout(resolve, 2000));

      alert(`Successfully purchased tweak #${tweakId} with ${paymentType.toUpperCase()}!`);
    } catch (error) {
      console.error('Purchase failed:', error);
      alert('Purchase failed. Please try again.');
    } finally {
      setPurchasing(null);
    }
  };

  const categories = ['all', 'tweaks', 'themes', 'utilities', 'apps', 'widgets', 'lockscreen', 'statusbar', 'keyboard'];

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: styles }} />
      <div className="min-h-screen bg-gradient-to-br from-gray-900 via-purple-900 to-gray-900">
        {/* Header */}
        <div className="bg-black/30 backdrop-blur-lg border-b border-white/10">
          <div className="max-w-7xl mx-auto px-4 py-6">
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-3xl font-bold text-white flex items-center gap-3">
                  <span className="text-4xl">📦</span>
                  EmpowerTweaks
                </h1>
                <p className="text-purple-300 mt-1">Decentralized Jailbreak Marketplace on Monad</p>
              </div>

              <div className="flex items-center gap-4">
                {walletAddress ? (
                  <div className="px-4 py-2 bg-green-500/20 border border-green-500/50 rounded-lg">
                    <p className="text-green-400 text-sm font-mono">
                      {walletAddress.slice(0, 6)}...{walletAddress.slice(-4)}
                    </p>
                  </div>
                ) : (
                  <button
                    onClick={requestWallet}
                    className="px-6 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg font-medium transition-all"
                  >
                    Connect Wallet
                  </button>
                )}

                <button
                  onClick={() => setShowUploadModal(true)}
                  className="px-6 py-2 bg-gradient-to-r from-pink-600 to-purple-600 hover:from-pink-700 hover:to-purple-700 text-white rounded-lg font-medium transition-all flex items-center gap-2"
                >
                  <span>➕</span> Upload Tweak
                </button>
              </div>
            </div>

            {/* Search Bar */}
            <div className="mt-6 flex gap-4">
              <div className="flex-1 relative">
                <input
                  type="text"
                  placeholder="Search tweaks, themes, apps..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full px-6 py-3 bg-white/10 border border-white/20 rounded-xl text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-purple-500"
                />
                <span className="absolute right-4 top-3.5 text-gray-400">🔍</span>
              </div>

              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as any)}
                className="px-4 py-3 bg-white/10 border border-white/20 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-purple-500"
              >
                <option value="popular">Most Popular</option>
                <option value="newest">Newest</option>
                <option value="price">Price: Low to High</option>
              </select>
            </div>
          </div>
        </div>

        <div className="max-w-7xl mx-auto px-4 py-8">
          <div className="flex gap-8">
            {/* Sidebar - Categories */}
            <div className="w-64 shrink-0">
              <div className="bg-white/5 backdrop-blur-lg rounded-2xl border border-white/10 p-4 sticky top-8">
                <h3 className="text-white font-bold mb-4">Categories</h3>
                <div className="space-y-2">
                  {categories.map((cat) => (
                    <button
                      key={cat}
                      onClick={() => setSelectedCategory(cat)}
                      className={`w-full text-left px-4 py-2 rounded-lg transition-all flex items-center gap-2 ${
                        selectedCategory === cat
                          ? 'bg-purple-600 text-white'
                          : 'text-gray-300 hover:bg-white/10'
                      }`}
                    >
                      <span>{cat === 'all' ? '📋' : categoryIcons[cat] || '📦'}</span>
                      <span className="capitalize">{cat}</span>
                    </button>
                  ))}
                </div>

                {/* Stats */}
                <div className="mt-8 pt-4 border-t border-white/10">
                  <h3 className="text-white font-bold mb-4">Platform Stats</h3>
                  <div className="space-y-3 text-sm">
                    <div className="flex justify-between">
                      <span className="text-gray-400">Total Tweaks</span>
                      <span className="text-white font-bold">{tweaks.length}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-400">Total Sales</span>
                      <span className="text-white font-bold">
                        {tweaks.reduce((sum, t) => sum + t.totalSales, 0).toLocaleString()}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-400">Developers</span>
                      <span className="text-white font-bold">
                        {new Set(tweaks.map(t => t.developer)).size}
                      </span>
                    </div>
                  </div>
                </div>

                {/* iOS Compatibility Notice */}
                <div className="mt-6 p-4 bg-yellow-500/10 border border-yellow-500/30 rounded-xl">
                  <p className="text-yellow-300 text-xs">
                    <strong>⚠️ Requires Jailbreak</strong><br />
                    Tweaks require a jailbroken iOS device to install and use.
                  </p>
                </div>
              </div>
            </div>

            {/* Main Content - Tweak Grid */}
            <div className="flex-1">
              {/* Results Header */}
              <div className="flex items-center justify-between mb-6">
                <p className="text-gray-400">
                  Showing <span className="text-white font-bold">{filteredTweaks.length}</span> tweaks
                  {selectedCategory !== 'all' && (
                    <span> in <span className="text-purple-400 capitalize">{selectedCategory}</span></span>
                  )}
                </p>
              </div>

              {/* Tweak Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {filteredTweaks.map((tweak, index) => (
                  <div
                    key={tweak.id}
                    className="bg-white/5 backdrop-blur-lg rounded-2xl border border-white/10 overflow-hidden hover:border-purple-500/50 transition-all hover:scale-[1.02] animate-fadeIn"
                    style={{ animationDelay: `${index * 0.1}s` }}
                  >
                    {/* Tweak Header */}
                    <div className="p-4 border-b border-white/10">
                      <div className="flex items-start gap-3">
                        {/* Icon Placeholder */}
                        <div className="w-14 h-14 rounded-xl bg-gradient-to-br from-purple-600 to-pink-600 flex items-center justify-center text-2xl shrink-0">
                          {categoryIcons[tweak.category] || '📦'}
                        </div>

                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <h3 className="text-white font-bold truncate">{tweak.name}</h3>
                            {tweak.isVerified && (
                              <span className="text-blue-400 text-sm" title="Verified">✓</span>
                            )}
                          </div>
                          <p className="text-gray-400 text-sm">{tweak.developerName}</p>
                        </div>
                      </div>
                    </div>

                    {/* Description */}
                    <div className="p-4">
                      <p className="text-gray-300 text-sm line-clamp-2">{tweak.description}</p>

                      {/* iOS Versions */}
                      <div className="mt-3 flex flex-wrap gap-1">
                        {tweak.compatibleVersions.map((v) => (
                          <span
                            key={v}
                            className="px-2 py-0.5 bg-white/10 text-gray-300 text-xs rounded"
                          >
                            iOS {v}
                          </span>
                        ))}
                      </div>

                      {/* Stats */}
                      <div className="mt-4 flex items-center gap-4 text-sm">
                        <div className="flex items-center gap-1">
                          <span className="text-yellow-400">★</span>
                          <span className="text-white">{tweak.rating}</span>
                          <span className="text-gray-500">({tweak.reviewCount})</span>
                        </div>
                        <div className="text-gray-400">
                          {tweak.totalSales.toLocaleString()} sales
                        </div>
                      </div>
                    </div>

                    {/* Purchase Section */}
                    <div className="p-4 bg-white/5 border-t border-white/10">
                      <div className="flex items-center justify-between mb-3">
                        <div>
                          <p className="text-purple-400 font-bold">{tweak.priceInTours} TOURS</p>
                          <p className="text-gray-500 text-xs">or {tweak.priceInMon} MON</p>
                        </div>
                      </div>

                      <div className="flex gap-2">
                        <button
                          onClick={() => handlePurchase(tweak.id, 'tours')}
                          disabled={purchasing === tweak.id}
                          className="flex-1 px-4 py-2 bg-purple-600 hover:bg-purple-700 disabled:bg-purple-800 disabled:cursor-wait text-white rounded-lg text-sm font-medium transition-all"
                        >
                          {purchasing === tweak.id ? '⏳ Processing...' : 'Buy with TOURS'}
                        </button>
                        <button
                          onClick={() => handlePurchase(tweak.id, 'mon')}
                          disabled={purchasing === tweak.id}
                          className="px-4 py-2 bg-white/10 hover:bg-white/20 disabled:cursor-wait text-white rounded-lg text-sm font-medium transition-all"
                        >
                          MON
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {/* Empty State */}
              {filteredTweaks.length === 0 && (
                <div className="text-center py-16">
                  <div className="text-6xl mb-4">🔍</div>
                  <h3 className="text-xl font-bold text-white mb-2">No tweaks found</h3>
                  <p className="text-gray-400">Try a different search or category</p>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Upload Modal */}
        {showUploadModal && (
          <UploadTweakModal onClose={() => setShowUploadModal(false)} />
        )}

        {/* Footer */}
        <div className="bg-black/30 border-t border-white/10 py-8 mt-16">
          <div className="max-w-7xl mx-auto px-4 text-center">
            <p className="text-gray-400 text-sm">
              EmpowerTweaks - Decentralized Jailbreak Marketplace
            </p>
            <p className="text-gray-500 text-xs mt-2">
              Powered by Monad • IPFS Storage • NFT Ownership
            </p>
            <div className="mt-4 flex justify-center gap-6 text-sm">
              <Link href="/world" className="text-purple-400 hover:text-purple-300">
                Agent World
              </Link>
              <Link href="/market" className="text-purple-400 hover:text-purple-300">
                Music NFTs
              </Link>
              <Link href="/nft" className="text-purple-400 hover:text-purple-300">
                Create NFT
              </Link>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

// Upload Tweak Modal Component
function UploadTweakModal({ onClose }: { onClose: () => void }) {
  const { walletAddress, requestWallet } = useFarcasterContext();

  const [step, setStep] = useState(1);
  const [uploading, setUploading] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    category: 'tweaks',
    priceInTours: '50',
    priceInMon: '0.5',
    compatibleVersions: ['18.1'],
    debFile: null as File | null,
    iconFile: null as File | null,
  });

  const handleSubmit = async () => {
    if (!walletAddress) {
      await requestWallet();
      return;
    }

    if (!formData.debFile || !formData.name) {
      alert('Please fill in all required fields');
      return;
    }

    setUploading(true);

    try {
      // TODO: Implement actual upload to IPFS + contract call
      await new Promise(resolve => setTimeout(resolve, 3000));

      alert('Tweak uploaded successfully!');
      onClose();
    } catch (error) {
      console.error('Upload failed:', error);
      alert('Upload failed. Please try again.');
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-gray-900 rounded-2xl border border-white/20 max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        {/* Modal Header */}
        <div className="p-6 border-b border-white/10 flex items-center justify-between">
          <h2 className="text-xl font-bold text-white">Upload New Tweak</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white text-2xl"
          >
            ×
          </button>
        </div>

        {/* Modal Content */}
        <div className="p-6 space-y-6">
          {/* Tweak Name */}
          <div>
            <label className="block text-white font-medium mb-2">Tweak Name *</label>
            <input
              type="text"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              placeholder="e.g., MyAwesomeTweak"
              className="w-full px-4 py-3 bg-white/10 border border-white/20 rounded-xl text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-purple-500"
            />
          </div>

          {/* Description */}
          <div>
            <label className="block text-white font-medium mb-2">Description *</label>
            <textarea
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              placeholder="Describe what your tweak does..."
              rows={3}
              className="w-full px-4 py-3 bg-white/10 border border-white/20 rounded-xl text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-purple-500"
            />
          </div>

          {/* Category */}
          <div>
            <label className="block text-white font-medium mb-2">Category</label>
            <select
              value={formData.category}
              onChange={(e) => setFormData({ ...formData, category: e.target.value })}
              className="w-full px-4 py-3 bg-white/10 border border-white/20 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-purple-500"
            >
              <option value="tweaks">⚙️ Tweaks</option>
              <option value="themes">🎨 Themes</option>
              <option value="utilities">🔧 Utilities</option>
              <option value="apps">📱 Apps</option>
              <option value="widgets">📊 Widgets</option>
              <option value="lockscreen">🔒 Lock Screen</option>
              <option value="statusbar">📶 Status Bar</option>
              <option value="keyboard">⌨️ Keyboard</option>
            </select>
          </div>

          {/* Pricing */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-white font-medium mb-2">Price in TOURS</label>
              <input
                type="number"
                value={formData.priceInTours}
                onChange={(e) => setFormData({ ...formData, priceInTours: e.target.value })}
                placeholder="50"
                className="w-full px-4 py-3 bg-white/10 border border-white/20 rounded-xl text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-purple-500"
              />
            </div>
            <div>
              <label className="block text-white font-medium mb-2">Price in MON</label>
              <input
                type="number"
                step="0.01"
                value={formData.priceInMon}
                onChange={(e) => setFormData({ ...formData, priceInMon: e.target.value })}
                placeholder="0.5"
                className="w-full px-4 py-3 bg-white/10 border border-white/20 rounded-xl text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-purple-500"
              />
            </div>
          </div>

          {/* File Upload - .deb */}
          <div>
            <label className="block text-white font-medium mb-2">.deb Package File *</label>
            <div className="border-2 border-dashed border-white/20 rounded-xl p-6 text-center hover:border-purple-500/50 transition-all cursor-pointer">
              <input
                type="file"
                accept=".deb"
                onChange={(e) => setFormData({ ...formData, debFile: e.target.files?.[0] || null })}
                className="hidden"
                id="deb-upload"
              />
              <label htmlFor="deb-upload" className="cursor-pointer">
                {formData.debFile ? (
                  <div>
                    <div className="text-4xl mb-2">📦</div>
                    <p className="text-green-400 font-medium">{formData.debFile.name}</p>
                    <p className="text-gray-400 text-sm">{(formData.debFile.size / 1024).toFixed(0)} KB</p>
                  </div>
                ) : (
                  <div>
                    <div className="text-4xl mb-2">📤</div>
                    <p className="text-gray-300">Click to upload .deb file</p>
                    <p className="text-gray-500 text-sm">Max 50MB</p>
                  </div>
                )}
              </label>
            </div>
          </div>

          {/* File Upload - Icon */}
          <div>
            <label className="block text-white font-medium mb-2">Icon Image (Optional)</label>
            <div className="border-2 border-dashed border-white/20 rounded-xl p-6 text-center hover:border-purple-500/50 transition-all cursor-pointer">
              <input
                type="file"
                accept="image/*"
                onChange={(e) => setFormData({ ...formData, iconFile: e.target.files?.[0] || null })}
                className="hidden"
                id="icon-upload"
              />
              <label htmlFor="icon-upload" className="cursor-pointer">
                {formData.iconFile ? (
                  <div>
                    <img
                      src={URL.createObjectURL(formData.iconFile)}
                      alt="Icon preview"
                      className="w-20 h-20 rounded-xl mx-auto mb-2 object-cover"
                    />
                    <p className="text-green-400 font-medium">{formData.iconFile.name}</p>
                  </div>
                ) : (
                  <div>
                    <div className="text-4xl mb-2">🖼️</div>
                    <p className="text-gray-300">Click to upload icon</p>
                    <p className="text-gray-500 text-sm">PNG, JPG - Recommended 512x512</p>
                  </div>
                )}
              </label>
            </div>
          </div>

          {/* iOS Compatibility */}
          <div>
            <label className="block text-white font-medium mb-2">Compatible iOS Versions</label>
            <div className="flex flex-wrap gap-2">
              {['17.0', '17.1', '17.2', '18.0', '18.1', '18.2'].map((version) => (
                <button
                  key={version}
                  onClick={() => {
                    const versions = formData.compatibleVersions.includes(version)
                      ? formData.compatibleVersions.filter(v => v !== version)
                      : [...formData.compatibleVersions, version];
                    setFormData({ ...formData, compatibleVersions: versions });
                  }}
                  className={`px-4 py-2 rounded-lg font-medium transition-all ${
                    formData.compatibleVersions.includes(version)
                      ? 'bg-purple-600 text-white'
                      : 'bg-white/10 text-gray-300 hover:bg-white/20'
                  }`}
                >
                  iOS {version}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Modal Footer */}
        <div className="p-6 border-t border-white/10 flex gap-4">
          <button
            onClick={onClose}
            className="flex-1 px-6 py-3 bg-white/10 hover:bg-white/20 text-white rounded-xl font-medium transition-all"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={uploading || !formData.debFile || !formData.name}
            className="flex-1 px-6 py-3 bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-xl font-medium transition-all"
          >
            {uploading ? '⏳ Uploading to IPFS...' : '🚀 Publish Tweak'}
          </button>
        </div>

        {/* Platform Fee Notice */}
        <div className="px-6 pb-6">
          <div className="p-4 bg-blue-500/10 border border-blue-500/30 rounded-xl">
            <p className="text-blue-300 text-sm">
              <strong>Platform Fee:</strong> 2.5% on sales. You receive 97.5% of every purchase directly to your wallet.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
