"use client";

import React, { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import {
  X,
  RefreshCw,
  Music,
  Palette,
  Ticket,
  Users,
  ShoppingBag,
  MapPin,
  Play,
  DollarSign,
  TrendingUp,
  Headphones,
  BarChart3,
  Loader2,
  Radio,
} from "lucide-react";
import Link from "next/link";
import { getExplorerUrl } from "@/app/chains";

interface DashboardModalProps {
  onClose: () => void;
  onViewProfile?: (address: string) => void;
  isDarkMode?: boolean;
}

interface Stats {
  totalNFTs: number;
  totalMusicNFTs: number;
  totalArtNFTs: number;
  totalPassports: number;
  totalExperiences: number;
  totalUsers: number;
  totalMusicLicensesPurchased: number;
}

interface StreamingStats {
  /** Plays attributed to a real listener — the same events the reward maths pays for. */
  totalPlays: number;
  /** Songs the radio broadcast. Uptime, not engagement; labelled as such below. */
  totalSongsBroadcast: number;
  totalSalesWMON: string;
  uniqueListeners: number;
  uniqueArtists: number;
  recentPlays: {
    user: string;
    masterTokenId: string;
    duration: number;
    timestamp: number;
    txHash: string;
    songName?: string;
    artistAddress?: string;
  }[];
  recentSales: {
    licenseId: string;
    masterTokenId: string;
    buyer: string;
    price: string;
    priceFormatted: string;
    createdAt: string;
    txHash: string;
    songName?: string;
    artistAddress?: string;
  }[];
  topSongs: {
    tokenId: string;
    name: string;
    salesCount: number;
    artist: string;
    totalRevenue: string;
  }[];
  topArtists: {
    address: string;
    totalSales: string;
    songCount: number;
    licensesSold: number;
  }[];
}

// Helper to get country flag emoji
const getCountryFlag = (countryCode: string): string => {
  if (!countryCode || countryCode.length !== 2) return "🌍";
  const codePoints = countryCode
    .toUpperCase()
    .split("")
    .map((char) => 127397 + char.charCodeAt(0));
  return String.fromCodePoint(...codePoints);
};

export const DashboardModal: React.FC<DashboardModalProps> = ({
  onClose,
  onViewProfile,
  isDarkMode = true,
}) => {
  const [mounted, setMounted] = useState(false);
  const [activeTab, setActiveTab] = useState<"activity" | "streaming">(
    "activity",
  );
  const [stats, setStats] = useState<Stats | null>(null);
  const [streamingStats, setStreamingStats] = useState<StreamingStats | null>(
    null,
  );
  const [recentPassports, setRecentPassports] = useState<any[]>([]);
  const [recentMusic, setRecentMusic] = useState<any[]>([]);
  const [recentArt, setRecentArt] = useState<any[]>([]);
  const [recentPurchases, setRecentPurchases] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [streamingLoading, setStreamingLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setMounted(true);
    loadDashboardData();
  }, []);

  useEffect(() => {
    if (activeTab === "streaming" && !streamingStats) {
      loadStreamingStats();
    }
  }, [activeTab]);

  const loadDashboardData = async () => {
    setLoading(true);
    setError(null);
    try {
      // Shares /api/dashboard with app/dashboard/page.tsx. Both used to carry their own copy of
      // the same six-table GraphQL document, which is two places for the same query to drift.
      const response = await fetch("/api/dashboard");
      if (!response.ok) throw new Error(`API returned ${response.status}`);

      const result = await response.json();
      if (!result.success)
        throw new Error(result.error || "Dashboard read failed");

      // An empty panel because a read failed is not the same as an empty panel because nothing
      // is there, and the difference should reach the user rather than stopping at the log.
      if (result.partial) {
        setError(
          `Some data unavailable: ${(result.unavailable || []).join(", ")}`,
        );
      }

      setStats({
        totalNFTs: result.stats.totalNFTs,
        totalMusicNFTs: result.stats.totalMusic,
        totalArtNFTs: result.stats.totalArt,
        totalPassports: result.stats.totalPassports,
        // No contract tracks experiences, and the indexer's count came from events that are no
        // longer readable. 0 is honest here; the tile shows nothing rather than a stale number.
        totalExperiences: 0,
        // Distinct addresses that hold or created something — see the route for why this is not
        // the indexer's "Active Users" figure.
        totalUsers: result.stats.totalParticipants,
        totalMusicLicensesPurchased: result.stats.totalLicenses,
      });

      setRecentMusic(result.music || []);
      setRecentArt(result.art || []);
      setRecentPassports(result.passports || []);
      setRecentPurchases(result.licenses || []);
    } catch (err: any) {
      console.error("[DashboardModal] Error:", err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const loadStreamingStats = async () => {
    setStreamingLoading(true);
    try {
      const response = await fetch("/api/streaming-stats?limit=15");
      const data = await response.json();
      if (data.success && data.stats) {
        setStreamingStats(data.stats);
      }
    } catch (err: any) {
      console.error("[DashboardModal] Streaming stats error:", err);
    } finally {
      setStreamingLoading(false);
    }
  };

  const formatTimeAgo = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return "just now";
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    return `${diffDays}d ago`;
  };

  const handleAddressClick = (address: string) => {
    if (onViewProfile) {
      onViewProfile(address);
    }
  };

  const WalletLink = ({ address }: { address: string }) => (
    <button
      onClick={() => handleAddressClick(address)}
      className="text-muted hover:text-muted hover:underline transition-colors font-mono text-xs"
    >
      {address.slice(0, 6)}...{address.slice(-4)}
    </button>
  );

  if (!mounted) return null;

  const modalContent = (
    <div
      className={`fixed inset-0 flex items-center justify-center p-4 ${isDarkMode ? "bg-black" : "bg-white"}`}
      style={{
        zIndex: 9999,
        backgroundColor: isDarkMode ? "#000000" : "#ffffff",
      }}
      onClick={onClose}
    >
      <div
        className={`rounded-none w-full max-w-4xl max-h-[90vh] overflow-hidden shadow-2xl ${isDarkMode ? "bg-ink-raised border border-rule" : "bg-white border border-gray-200"}`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="bg-ink-raised border-b border-rule p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-3 h-3 rounded-full bg-green-400 animate-pulse" />
              <h2 className="text-xl font-bold text-white">Live Dashboard</h2>
              <span className="text-xs text-gray-400 bg-ink-raised px-2 py-1 rounded-full">
                Live from Monad
              </span>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={
                  activeTab === "streaming"
                    ? loadStreamingStats
                    : loadDashboardData
                }
                disabled={loading || streamingLoading}
                className="p-2 text-gray-400 hover:text-white hover:bg-white/10 rounded-lg transition-colors disabled:opacity-50"
              >
                <RefreshCw
                  className={`w-5 h-5 ${loading || streamingLoading ? "animate-spin" : ""}`}
                />
              </button>
              <button
                onClick={onClose}
                className="p-2 text-gray-400 hover:text-white hover:bg-white/10 rounded-lg transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* Tabs */}
          <div className="flex gap-2 mt-3">
            <button
              onClick={() => setActiveTab("activity")}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-2 ${
                activeTab === "activity"
                  ? "bg-ink-raised text-white"
                  : "text-gray-400 hover:text-white hover:bg-white/10"
              }`}
            >
              <BarChart3 className="w-4 h-4" />
              Activity
            </button>
            <button
              onClick={() => setActiveTab("streaming")}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-2 ${
                activeTab === "streaming"
                  ? "bg-green-500/30 text-white"
                  : "text-gray-400 hover:text-white hover:bg-white/10"
              }`}
            >
              <Headphones className="w-4 h-4" />
              Streaming & Payments
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="p-4 overflow-y-auto max-h-[calc(90vh-140px)]">
          {error && (
            <div className="mb-4 p-3 bg-red-500/20 border border-red-500/30 rounded-lg">
              <p className="text-red-400 text-sm">{error}</p>
            </div>
          )}

          {activeTab === "activity" ? (
            <>
              {/* Stats Grid */}
              {stats && (
                <div className="grid grid-cols-3 md:grid-cols-6 gap-3 mb-6">
                  <StatCard
                    icon={<Music className="w-4 h-4" />}
                    label="Music"
                    value={stats.totalMusicNFTs}
                    color="purple"
                  />
                  <StatCard
                    icon={<Palette className="w-4 h-4" />}
                    label="Art"
                    value={stats.totalArtNFTs}
                    color="cyan"
                  />
                  <StatCard
                    icon={<Ticket className="w-4 h-4" />}
                    label="Passports"
                    value={stats.totalPassports}
                    color="pink"
                  />
                  <StatCard
                    icon={<ShoppingBag className="w-4 h-4" />}
                    label="Purchases"
                    value={stats.totalMusicLicensesPurchased}
                    color="amber"
                  />
                  <StatCard
                    icon={<MapPin className="w-4 h-4" />}
                    label="Experiences"
                    value={stats.totalExperiences}
                    color="green"
                  />
                  <StatCard
                    icon={<Users className="w-4 h-4" />}
                    label="Users"
                    value={stats.totalUsers}
                    color="indigo"
                  />
                </div>
              )}

              {/* Activity Sections */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Recent Music */}
                <ActivitySection
                  title="Recent Music"
                  items={recentMusic}
                  loading={loading}
                >
                  {recentMusic.map((item) => (
                    <div
                      key={item.id}
                      className="p-3 bg-ink-raised border border-rule rounded-lg"
                    >
                      <p className="font-medium text-white text-sm truncate">
                        {item.name || `Music #${item.tokenId}`}
                      </p>
                      <div className="flex justify-between items-center mt-1">
                        <span className="text-xs text-gray-400">
                          Artist: <WalletLink address={item.artist} />
                        </span>
                        {item.txHash && (
                          <a
                            href={getExplorerUrl(item.txHash)}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-xs text-muted hover:text-muted"
                          >
                            TX →
                          </a>
                        )}
                      </div>
                    </div>
                  ))}
                </ActivitySection>

                {/* Recent Art */}
                <ActivitySection
                  title="Recent Art"
                  items={recentArt}
                  loading={loading}
                >
                  {recentArt.map((item) => (
                    <div
                      key={item.id}
                      className="p-3 bg-ink-raised border border-rule rounded-lg"
                    >
                      <p className="font-medium text-white text-sm truncate">
                        {item.name || `Art #${item.tokenId}`}
                      </p>
                      <div className="flex justify-between items-center mt-1">
                        <span className="text-xs text-gray-400">
                          Artist: <WalletLink address={item.artist} />
                        </span>
                        {item.txHash && (
                          <a
                            href={getExplorerUrl(item.txHash)}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-xs text-muted hover:text-muted"
                          >
                            TX →
                          </a>
                        )}
                      </div>
                    </div>
                  ))}
                </ActivitySection>

                {/* Recent Passports */}
                <ActivitySection
                  title="Recent Passports"
                  items={recentPassports}
                  loading={loading}
                >
                  {recentPassports.map((item) => (
                    <div
                      key={item.id}
                      className="p-3 bg-ink-raised border border-rule rounded-lg flex items-center gap-3"
                    >
                      <span className="text-2xl">
                        {item.countryCode
                          ? getCountryFlag(item.countryCode)
                          : "🌍"}
                      </span>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-white text-sm">
                          Passport #{item.tokenId}
                        </p>
                        <span className="text-xs text-gray-400">
                          Owner: <WalletLink address={item.owner} />
                        </span>
                      </div>
                    </div>
                  ))}
                </ActivitySection>

                {/* Recent Purchases */}
                <ActivitySection
                  title="Recent Purchases"
                  items={recentPurchases}
                  loading={loading}
                >
                  {recentPurchases.map((item) => (
                    <div
                      key={item.id}
                      className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-lg"
                    >
                      <p className="font-medium text-white text-sm">
                        License #{item.licenseId}
                      </p>
                      <div className="flex justify-between items-center mt-1">
                        <span className="text-xs text-gray-400">
                          Buyer: <WalletLink address={item.licensee} />
                        </span>
                        <span
                          className={`text-xs px-2 py-0.5 rounded ${item.active ? "bg-green-500/20 text-good" : "bg-gray-500/20 text-gray-400"}`}
                        >
                          {item.active ? "Active" : "Expired"}
                        </span>
                      </div>
                    </div>
                  ))}
                </ActivitySection>
              </div>

              {/* View Full Dashboard Link */}
              <div className="mt-6 text-center">
                <Link
                  href="/dashboard"
                  className="inline-flex items-center gap-2 px-6 py-3 bg-foil hover:bg-foil-bright text-ink rounded-sm font-medium transition-colors"
                >
                  View Full Dashboard →
                </Link>
              </div>
            </>
          ) : (
            /* Streaming Stats Tab */
            <div className="space-y-6">
              {streamingLoading ? (
                <div className="text-center py-12">
                  <Loader2 className="text-muted mx-auto mb-3 h-6 w-6 animate-spin" />
                  <p className="text-gray-400">Loading streaming stats...</p>
                </div>
              ) : streamingStats ? (
                <>
                  {/* Streaming Stats Overview */}
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    <StatCard
                      icon={<Play className="w-4 h-4" />}
                      label="Plays"
                      value={streamingStats.totalPlays}
                      color="green"
                    />
                    {/* Kept separate from Plays on purpose: this counter advances on an empty
                        room, so merging the two overstated engagement by three orders of
                        magnitude. Label it as airtime and it is a useful number again. */}
                    <StatCard
                      icon={<Radio className="w-4 h-4" />}
                      label="Songs Aired"
                      value={streamingStats.totalSongsBroadcast}
                      color="purple"
                    />
                    <StatCard
                      icon={<Headphones className="w-4 h-4" />}
                      label="Listeners"
                      value={streamingStats.uniqueListeners}
                      color="cyan"
                    />
                    <StatCard
                      icon={<Users className="w-4 h-4" />}
                      label="Artists"
                      value={streamingStats.uniqueArtists}
                      color="amber"
                    />
                    <div className="p-3 rounded-sm bg-ink-raised border border-rule text-center">
                      <DollarSign className="w-4 h-4 mx-auto mb-1 text-good" />
                      <p className="text-xl font-bold text-white">
                        {streamingStats.totalSalesWMON}
                      </p>
                      <p className="text-xs text-gray-400">WMON Sales</p>
                    </div>
                  </div>

                  {/* Recent Plays and Payments */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {/* Recent Plays */}
                    <div className="bg-ink-raised border border-rule rounded-sm p-4">
                      <h4 className="font-bold text-white mb-3 flex items-center gap-2">
                        <span>🎧</span> Recent Plays
                        <span className="text-xs font-normal text-gray-500">
                          ({streamingStats.recentPlays.length})
                        </span>
                      </h4>
                      {streamingStats.recentPlays.length === 0 ? (
                        <p className="text-gray-500 text-sm text-center py-4">
                          No plays recorded yet
                        </p>
                      ) : (
                        <div className="space-y-2 max-h-48 overflow-y-auto">
                          {streamingStats.recentPlays.map((play, idx) => (
                            <div
                              key={`${play.txHash}-${idx}`}
                              className="p-3 bg-green-500/10 border border-rule rounded-lg"
                            >
                              <p className="font-medium text-white text-sm truncate">
                                {play.songName || `Song #${play.masterTokenId}`}
                              </p>
                              <div className="flex justify-between items-center mt-1">
                                <span className="text-xs text-gray-400">
                                  <WalletLink address={play.user} /> •{" "}
                                  {play.duration}s
                                </span>
                                <span className="text-xs text-gray-500">
                                  {formatTimeAgo(
                                    new Date(
                                      play.timestamp * 1000,
                                    ).toISOString(),
                                  )}
                                </span>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Recent Sales (Artist Payments) */}
                    <div className="bg-ink-raised border border-rule rounded-sm p-4">
                      <h4 className="font-bold text-white mb-3 flex items-center gap-2">
                        <span>💰</span> Recent Sales
                        <span className="text-xs font-normal text-gray-500">
                          ({streamingStats.recentSales.length})
                        </span>
                      </h4>
                      {streamingStats.recentSales.length === 0 ? (
                        <p className="text-gray-500 text-sm text-center py-4">
                          No sales recorded yet
                        </p>
                      ) : (
                        <div className="space-y-2 max-h-48 overflow-y-auto">
                          {streamingStats.recentSales.map((sale) => (
                            <div
                              key={sale.licenseId}
                              className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-lg"
                            >
                              <div className="flex justify-between items-start">
                                <p className="font-medium text-white text-sm truncate flex-1">
                                  {sale.songName ||
                                    `Song #${sale.masterTokenId}`}
                                </p>
                                <span className="text-good text-sm font-bold ml-2">
                                  {sale.priceFormatted} WMON
                                </span>
                              </div>
                              <div className="flex justify-between items-center mt-1">
                                <span className="text-xs text-gray-400">
                                  Buyer: <WalletLink address={sale.buyer} />
                                </span>
                                <span className="text-xs text-gray-500">
                                  {formatTimeAgo(sale.createdAt)}
                                </span>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Top Songs & Artists */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {/* Top Songs */}
                    <div className="bg-ink-raised border border-rule rounded-sm p-4">
                      <h4 className="font-bold text-white mb-3 flex items-center gap-2">
                        <TrendingUp className="w-4 h-4 text-muted" />
                        Top Songs by Sales
                      </h4>
                      {streamingStats.topSongs.length === 0 ? (
                        <p className="text-gray-500 text-sm text-center py-4">
                          No sales data yet
                        </p>
                      ) : (
                        <div className="space-y-2">
                          {streamingStats.topSongs
                            .slice(0, 5)
                            .map((song, idx) => (
                              <div
                                key={song.tokenId}
                                className="flex items-center gap-3 p-2 bg-ink-raised rounded-lg"
                              >
                                <span className="text-lg font-bold text-muted">
                                  #{idx + 1}
                                </span>
                                <div className="flex-1 min-w-0">
                                  <p className="text-white text-sm font-medium truncate">
                                    {song.name}
                                  </p>
                                  <p className="text-xs text-gray-400">
                                    {song.salesCount} sales •{" "}
                                    {song.totalRevenue} WMON earned
                                  </p>
                                </div>
                              </div>
                            ))}
                        </div>
                      )}
                    </div>

                    {/* Top Artists */}
                    <div className="bg-ink-raised border border-rule rounded-sm p-4">
                      <h4 className="font-bold text-white mb-3 flex items-center gap-2">
                        <DollarSign className="w-4 h-4 text-amber-400" />
                        Top Earning Artists
                      </h4>
                      {streamingStats.topArtists.length === 0 ? (
                        <p className="text-gray-500 text-sm text-center py-4">
                          No artist data yet
                        </p>
                      ) : (
                        <div className="space-y-2">
                          {streamingStats.topArtists
                            .slice(0, 5)
                            .map((artist, idx) => (
                              <div
                                key={artist.address}
                                className="flex items-center gap-3 p-2 bg-amber-500/10 rounded-lg"
                              >
                                <span className="text-lg font-bold text-amber-400">
                                  #{idx + 1}
                                </span>
                                <div className="flex-1 min-w-0">
                                  <WalletLink address={artist.address} />
                                  <p className="text-xs text-gray-400">
                                    {artist.songCount} songs •{" "}
                                    {artist.licensesSold} sold •{" "}
                                    {artist.totalSales} WMON
                                  </p>
                                </div>
                              </div>
                            ))}
                        </div>
                      )}
                    </div>
                  </div>
                </>
              ) : (
                <div className="text-center py-12">
                  <p className="text-gray-400">No streaming data available</p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );

  return createPortal(modalContent, document.body);
};

// Stat Card Component
const StatCard = ({
  icon,
  label,
  value,
  color,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  color: string;
}) => {
  const colorClasses: Record<string, string> = {
    purple: "from-purple-500/20 to-purple-600/20 border-rule text-muted",
    cyan: "from-cyan-500/20 to-cyan-600/20 border-rule text-muted",
    pink: "from-pink-500/20 to-pink-600/20 border-rule text-muted",
    amber:
      "from-amber-500/20 to-amber-600/20 border-amber-500/30 text-amber-400",
    green: "from-green-500/20 to-green-600/20 border-rule text-good",
    indigo:
      "from-indigo-500/20 to-indigo-600/20 border-indigo-500/30 text-indigo-400",
  };

  return (
    <div
      className={`p-3 rounded-sm bg-gradient-to-br ${colorClasses[color]} border text-center`}
    >
      <div className={`mx-auto mb-1 ${colorClasses[color].split(" ").pop()}`}>
        {icon}
      </div>
      <p className="text-xl font-bold text-white">{value}</p>
      <p className="text-xs text-gray-400">{label}</p>
    </div>
  );
};

// Activity Section Component
const ActivitySection = ({
  title,
  items,
  loading,
  children,
}: {
  title: string;
  items: any[];
  loading: boolean;
  children: React.ReactNode;
}) => (
  <div className="doc-panel p-4">
    <h4 className="doc-label mb-3">
      {title}
      <span className="doc-mono text-faint text-[11px]">{items.length}</span>
    </h4>
    {loading && items.length === 0 ? (
      <div className="text-center py-4">
        <div className="animate-spin text-2xl">⏳</div>
      </div>
    ) : items.length === 0 ? (
      <p className="text-gray-500 text-sm text-center py-4">No data yet</p>
    ) : (
      <div className="space-y-2 max-h-48 overflow-y-auto">{children}</div>
    )}
  </div>
);

export default DashboardModal;
