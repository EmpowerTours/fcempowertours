'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useRadioStream } from '@/app/hooks/useRadioStream';

/**
 * RadioControlPanel - Telegram Mini App visual control panel for Live Radio
 *
 * This component is DISPLAY ONLY - no audio element.
 * Telegram Mini Apps can't play audio in background, so this serves as
 * the visual interface while the Telegram bot delivers audio natively.
 *
 * Features:
 * - Current song info with cover art and progress bar
 * - Queue display
 * - Listener count and leaderboard
 * - "Listen in Chat" button to subscribe to bot audio delivery
 * - Voice note submission button (opens mini app section)
 * - Stats display
 *
 * Respects Telegram theme params for native look.
 */

// ── Types ────────────────────────────────────────────────────────────────

interface TelegramThemeParams {
  bg_color?: string;
  text_color?: string;
  hint_color?: string;
  link_color?: string;
  button_color?: string;
  button_text_color?: string;
  secondary_bg_color?: string;
  header_bg_color?: string;
  accent_text_color?: string;
  section_bg_color?: string;
  section_header_text_color?: string;
  subtitle_text_color?: string;
  destructive_text_color?: string;
}

interface TelegramWebApp {
  initData: string;
  initDataUnsafe: {
    user?: {
      id: number;
      first_name: string;
      last_name?: string;
      username?: string;
    };
    start_param?: string;
  };
  themeParams: TelegramThemeParams;
  colorScheme: 'light' | 'dark';
  expand: () => void;
  close: () => void;
  ready: () => void;
  MainButton: {
    text: string;
    color: string;
    textColor: string;
    isVisible: boolean;
    isActive: boolean;
    show: () => void;
    hide: () => void;
    onClick: (callback: () => void) => void;
    offClick: (callback: () => void) => void;
    setText: (text: string) => void;
    enable: () => void;
    disable: () => void;
  };
  HapticFeedback: {
    impactOccurred: (style: 'light' | 'medium' | 'heavy' | 'rigid' | 'soft') => void;
    notificationOccurred: (type: 'error' | 'success' | 'warning') => void;
    selectionChanged: () => void;
  };
  openTelegramLink: (url: string) => void;
}

declare global {
  interface Window {
    Telegram?: {
      WebApp: TelegramWebApp;
    };
  }
}

interface LeaderboardEntry {
  address: string;
  totalSongsListened: number;
  totalRewardsEarned: number;
  currentStreak: number;
}

type TabView = 'now_playing' | 'queue' | 'stats' | 'leaderboard';

// ── Helpers ──────────────────────────────────────────────────────────────

function formatDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

function truncateAddress(address: string): string {
  if (address.length <= 12) return address;
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

// ── Component ────────────────────────────────────────────────────────────

export default function RadioControlPanel() {
  const { radioState, queue, voiceNotes, connectionStatus } = useRadioStream();

  const [activeTab, setActiveTab] = useState<TabView>('now_playing');
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [subscribing, setSubscribing] = useState(false);
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [loadingLeaderboard, setLoadingLeaderboard] = useState(false);
  const [progressPercent, setProgressPercent] = useState(0);
  const [elapsed, setElapsed] = useState(0);

  // Telegram WebApp reference
  const tgWebApp = useMemo(() => {
    if (typeof window !== 'undefined' && window.Telegram?.WebApp) {
      return window.Telegram.WebApp;
    }
    return null;
  }, []);

  // Theme colors from Telegram
  const theme = useMemo(() => {
    const params = tgWebApp?.themeParams;
    const isDark = tgWebApp?.colorScheme === 'dark';

    return {
      bg: params?.bg_color || (isDark ? '#1a1a2e' : '#ffffff'),
      secondaryBg: params?.secondary_bg_color || (isDark ? '#16213e' : '#f5f5f5'),
      sectionBg: params?.section_bg_color || (isDark ? '#1a1a2e' : '#ffffff'),
      text: params?.text_color || (isDark ? '#e0e0e0' : '#1a1a1a'),
      hint: params?.hint_color || (isDark ? '#8a8a8a' : '#999999'),
      link: params?.link_color || (isDark ? '#64b5f6' : '#2196f3'),
      button: params?.button_color || '#8b5cf6',
      buttonText: params?.button_text_color || '#ffffff',
      accent: params?.accent_text_color || '#8b5cf6',
      sectionHeader: params?.section_header_text_color || (isDark ? '#8b5cf6' : '#6d28d9'),
      subtitle: params?.subtitle_text_color || (isDark ? '#aaaaaa' : '#666666'),
      destructive: params?.destructive_text_color || '#ef4444',
    };
  }, [tgWebApp]);

  // Initialize Telegram WebApp
  useEffect(() => {
    if (tgWebApp) {
      tgWebApp.ready();
      tgWebApp.expand();

      // Handle deep link start param
      const startParam = tgWebApp.initDataUnsafe.start_param;
      if (startParam === 'queue') setActiveTab('queue');
      else if (startParam === 'stats') setActiveTab('stats');
      else if (startParam === 'leaderboard') setActiveTab('leaderboard');
    }
  }, [tgWebApp]);

  // Check subscription status on mount
  useEffect(() => {
    const checkSubscription = async () => {
      const userId = tgWebApp?.initDataUnsafe.user?.id;
      if (!userId) return;

      try {
        const res = await fetch(`/api/telegram-radio?action=status&telegramUserId=${userId}`);
        const data = await res.json();
        if (data.success) {
          setIsSubscribed(data.subscribed);
        }
      } catch (err) {
        console.error('[RadioControlPanel] Failed to check subscription:', err);
      }
    };

    checkSubscription();
  }, [tgWebApp]);

  // Update progress bar
  useEffect(() => {
    if (!radioState?.currentSong) {
      setProgressPercent(0);
      setElapsed(0);
      return;
    }

    const interval = setInterval(() => {
      const now = Date.now();
      const startedAt = radioState.currentSong!.startedAt;
      const duration = radioState.currentSong!.duration * 1000; // Convert to ms
      const elapsedMs = now - startedAt;
      const percent = Math.min(100, (elapsedMs / duration) * 100);

      setProgressPercent(percent);
      setElapsed(Math.floor(elapsedMs / 1000));
    }, 500);

    return () => clearInterval(interval);
  }, [radioState?.currentSong]);

  // Fetch leaderboard when tab is active
  useEffect(() => {
    if (activeTab !== 'leaderboard') return;

    const fetchLeaderboard = async () => {
      setLoadingLeaderboard(true);
      try {
        const res = await fetch('/api/live-radio?action=leaderboard');
        const data = await res.json();
        if (data.success) {
          setLeaderboard(data.leaderboard || []);
        }
      } catch (err) {
        console.error('[RadioControlPanel] Failed to fetch leaderboard:', err);
      } finally {
        setLoadingLeaderboard(false);
      }
    };

    fetchLeaderboard();
  }, [activeTab]);

  // Subscribe/Unsubscribe to bot audio delivery
  const handleSubscriptionToggle = useCallback(async () => {
    const userId = tgWebApp?.initDataUnsafe.user?.id;
    if (!userId) {
      // Not in Telegram context - open bot directly
      window.open('https://t.me/AI_RobotExpert_bot?start=radio', '_blank');
      return;
    }

    setSubscribing(true);
    try {
      const action = isSubscribed ? 'unsubscribe' : 'subscribe';
      const res = await fetch('/api/telegram-radio', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action,
          telegramUserId: userId,
          // Chat ID will be resolved by the bot - we send user ID from mini app
          telegramChatId: userId,
        }),
      });

      const data = await res.json();
      if (data.success) {
        setIsSubscribed(!isSubscribed);
        tgWebApp?.HapticFeedback.notificationOccurred('success');
      } else {
        tgWebApp?.HapticFeedback.notificationOccurred('error');
      }
    } catch (err) {
      console.error('[RadioControlPanel] Subscription toggle failed:', err);
      tgWebApp?.HapticFeedback.notificationOccurred('error');
    } finally {
      setSubscribing(false);
    }
  }, [isSubscribed, tgWebApp]);

  // Open mini app sections via deep links
  const openSection = useCallback((section: string) => {
    tgWebApp?.HapticFeedback.selectionChanged();
    if (section === 'queue') setActiveTab('queue');
    else if (section === 'stats') setActiveTab('stats');
    else if (section === 'leaderboard') setActiveTab('leaderboard');
    else setActiveTab('now_playing');
  }, [tgWebApp]);

  // ── Render Sections ────────────────────────────────────────────────────

  const renderNowPlaying = () => {
    const song = radioState?.currentSong;
    const voiceNote = radioState?.currentVoiceNote;

    if (!radioState?.isLive) {
      return (
        <div className="flex flex-col items-center justify-center py-16 px-4">
          <div className="text-5xl mb-4">📻</div>
          <p className="text-lg font-semibold" style={{ color: theme.text }}>
            Radio is Offline
          </p>
          <p className="text-sm mt-2 text-center" style={{ color: theme.hint }}>
            The live radio is currently not broadcasting. Check back soon!
          </p>
        </div>
      );
    }

    if (voiceNote) {
      return (
        <div className="flex flex-col items-center py-8 px-4">
          <div className="w-24 h-24 rounded-full flex items-center justify-center mb-4"
            style={{ backgroundColor: theme.accent + '20' }}>
            <span className="text-4xl">{voiceNote.isAd ? '📢' : '🎙️'}</span>
          </div>
          <p className="text-lg font-semibold" style={{ color: theme.text }}>
            {voiceNote.isAd ? 'Ad Break' : 'Voice Shoutout'}
          </p>
          <p className="text-sm mt-1" style={{ color: theme.hint }}>
            {voiceNote.username || 'Anonymous'}
          </p>
          <div className="w-full mt-4 px-4">
            <div className="w-full h-1 rounded-full overflow-hidden" style={{ backgroundColor: theme.secondaryBg }}>
              <div
                className="h-full rounded-full transition-all duration-500"
                style={{
                  backgroundColor: theme.accent,
                  width: `${Math.min(100, ((Date.now() - voiceNote.startedAt) / (voiceNote.duration * 1000)) * 100)}%`,
                }}
              />
            </div>
          </div>
        </div>
      );
    }

    if (!song) {
      return (
        <div className="flex flex-col items-center justify-center py-16 px-4">
          <div className="w-16 h-16 rounded-full flex items-center justify-center animate-pulse mb-4"
            style={{ backgroundColor: theme.accent + '20' }}>
            <span className="text-3xl">🎵</span>
          </div>
          <p className="text-lg font-semibold" style={{ color: theme.text }}>
            Waiting for next song...
          </p>
          <p className="text-sm mt-2" style={{ color: theme.hint }}>
            The DJ is picking something good
          </p>
        </div>
      );
    }

    return (
      <div className="flex flex-col items-center py-6 px-4">
        {/* Cover Art */}
        <div className="relative w-48 h-48 rounded-2xl overflow-hidden shadow-lg mb-6">
          {song.imageUrl ? (
            <img
              src={song.imageUrl}
              alt={song.name}
              className="w-full h-full object-cover"
              onError={(e) => {
                (e.target as HTMLImageElement).style.display = 'none';
              }}
            />
          ) : (
            <div
              className="w-full h-full flex items-center justify-center"
              style={{ backgroundColor: theme.accent + '30' }}
            >
              <span className="text-6xl">🎵</span>
            </div>
          )}
          {/* Playing indicator */}
          <div className="absolute bottom-2 right-2 flex items-center gap-1 px-2 py-1 rounded-full"
            style={{ backgroundColor: 'rgba(0,0,0,0.6)' }}>
            <div className="flex items-end gap-0.5 h-3">
              <div className="w-0.5 bg-green-400 animate-pulse" style={{ height: '40%', animationDelay: '0ms' }} />
              <div className="w-0.5 bg-green-400 animate-pulse" style={{ height: '70%', animationDelay: '150ms' }} />
              <div className="w-0.5 bg-green-400 animate-pulse" style={{ height: '50%', animationDelay: '300ms' }} />
              <div className="w-0.5 bg-green-400 animate-pulse" style={{ height: '90%', animationDelay: '100ms' }} />
            </div>
            <span className="text-xs text-green-400 ml-1 font-medium">LIVE</span>
          </div>
        </div>

        {/* Song Info */}
        <h2 className="text-xl font-bold text-center leading-tight" style={{ color: theme.text }}>
          {song.name}
        </h2>
        <p className="text-sm mt-1" style={{ color: theme.subtitle }}>
          {song.artist || 'Unknown Artist'}
        </p>

        {/* Progress Bar */}
        <div className="w-full mt-6 px-2">
          <div className="w-full h-1.5 rounded-full overflow-hidden" style={{ backgroundColor: theme.secondaryBg }}>
            <div
              className="h-full rounded-full transition-all duration-500 ease-linear"
              style={{
                backgroundColor: theme.accent,
                width: `${progressPercent}%`,
              }}
            />
          </div>
          <div className="flex justify-between mt-1">
            <span className="text-xs" style={{ color: theme.hint }}>
              {formatDuration(elapsed)}
            </span>
            <span className="text-xs" style={{ color: theme.hint }}>
              {formatDuration(song.duration)}
            </span>
          </div>
        </div>

        {/* Listener Count */}
        <div className="flex items-center gap-2 mt-4">
          <span className="text-sm">👥</span>
          <span className="text-sm font-medium" style={{ color: theme.text }}>
            {radioState.listenerCount} {radioState.listenerCount === 1 ? 'listener' : 'listeners'}
          </span>
        </div>

        {/* Queue Info */}
        {song.queuedBy && song.queuedBy !== 'radio' && (
          <p className="text-xs mt-2" style={{ color: theme.hint }}>
            Queued by {truncateAddress(song.queuedBy)}
          </p>
        )}
      </div>
    );
  };

  const renderQueue = () => (
    <div className="py-4 px-4">
      <h3 className="text-sm font-semibold uppercase tracking-wider mb-3"
        style={{ color: theme.sectionHeader }}>
        Up Next ({queue.length})
      </h3>

      {queue.length === 0 ? (
        <div className="text-center py-8">
          <span className="text-3xl mb-2 block">📋</span>
          <p className="text-sm" style={{ color: theme.hint }}>
            Queue is empty. Songs are auto-selected from Music NFTs.
          </p>
          <p className="text-xs mt-2" style={{ color: theme.hint }}>
            Pay 1 WMON to queue your favorite song!
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {queue.map((song, index) => (
            <div
              key={song.id}
              className="flex items-center gap-3 p-3 rounded-xl"
              style={{ backgroundColor: theme.secondaryBg }}
            >
              <span className="text-sm font-bold w-6 text-center" style={{ color: theme.hint }}>
                {index + 1}
              </span>
              <div className="w-10 h-10 rounded-lg overflow-hidden flex-shrink-0">
                {song.imageUrl ? (
                  <img src={song.imageUrl} alt={song.name} className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center"
                    style={{ backgroundColor: theme.accent + '20' }}>
                    <span className="text-lg">🎵</span>
                  </div>
                )}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate" style={{ color: theme.text }}>
                  {song.name}
                </p>
                <p className="text-xs truncate" style={{ color: theme.hint }}>
                  {song.artist} &middot; {truncateAddress(song.queuedBy)}
                </p>
              </div>
              <span className="text-xs px-2 py-0.5 rounded-full"
                style={{ backgroundColor: theme.accent + '20', color: theme.accent }}>
                {song.paidAmount} WMON
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Pending Voice Notes */}
      {voiceNotes.length > 0 && (
        <>
          <h3 className="text-sm font-semibold uppercase tracking-wider mb-3 mt-6"
            style={{ color: theme.sectionHeader }}>
            Pending Voice Notes ({voiceNotes.length})
          </h3>
          <div className="space-y-2">
            {voiceNotes.map((note) => (
              <div
                key={note.id}
                className="flex items-center gap-3 p-3 rounded-xl"
                style={{ backgroundColor: theme.secondaryBg }}
              >
                <span className="text-xl">{note.isAd ? '📢' : '🎙️'}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate" style={{ color: theme.text }}>
                    {note.username || truncateAddress(note.userAddress)}
                  </p>
                  <p className="text-xs" style={{ color: theme.hint }}>
                    {note.duration}s {note.isAd ? 'ad' : 'shoutout'}
                    {note.message && ` - "${note.message}"`}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );

  const renderStats = () => {
    const totalPlayed = radioState?.totalSongsPlayed || 0;
    const totalVoiceNotes = radioState?.totalVoiceNotesPlayed || 0;
    const listeners = radioState?.listenerCount || 0;

    return (
      <div className="py-4 px-4">
        <h3 className="text-sm font-semibold uppercase tracking-wider mb-4"
          style={{ color: theme.sectionHeader }}>
          Radio Stats
        </h3>

        <div className="grid grid-cols-2 gap-3">
          <StatCard
            icon="🎵"
            label="Songs Played"
            value={totalPlayed.toString()}
            theme={theme}
          />
          <StatCard
            icon="🎙️"
            label="Voice Notes"
            value={totalVoiceNotes.toString()}
            theme={theme}
          />
          <StatCard
            icon="👥"
            label="Listeners Now"
            value={listeners.toString()}
            theme={theme}
          />
          <StatCard
            icon="📋"
            label="In Queue"
            value={queue.length.toString()}
            theme={theme}
          />
        </div>

        {/* Pricing Info */}
        <div className="mt-6 p-4 rounded-xl" style={{ backgroundColor: theme.secondaryBg }}>
          <h4 className="text-sm font-semibold mb-3" style={{ color: theme.text }}>
            Pricing
          </h4>
          <div className="space-y-2">
            <PriceRow label="Queue a Song" price="1 WMON" theme={theme} />
            <PriceRow label="Voice Shoutout (5s)" price="0.5 WMON" theme={theme} />
            <PriceRow label="Voice Ad (30s)" price="2 WMON" theme={theme} />
          </div>
        </div>

        {/* Rewards Info */}
        <div className="mt-4 p-4 rounded-xl" style={{ backgroundColor: theme.secondaryBg }}>
          <h4 className="text-sm font-semibold mb-3" style={{ color: theme.text }}>
            Listener Rewards
          </h4>
          <div className="space-y-2">
            <PriceRow label="Per Song Listened" price="0.1 TOURS" theme={theme} />
            <PriceRow label="First Listener of Day" price="5 TOURS" theme={theme} />
            <PriceRow label="7-Day Streak Bonus" price="10 TOURS" theme={theme} />
          </div>
        </div>
      </div>
    );
  };

  const renderLeaderboard = () => (
    <div className="py-4 px-4">
      <h3 className="text-sm font-semibold uppercase tracking-wider mb-4"
        style={{ color: theme.sectionHeader }}>
        Top Listeners
      </h3>

      {loadingLeaderboard ? (
        <div className="flex items-center justify-center py-12">
          <div className="w-6 h-6 border-2 border-t-transparent rounded-full animate-spin"
            style={{ borderColor: theme.accent, borderTopColor: 'transparent' }} />
        </div>
      ) : leaderboard.length === 0 ? (
        <div className="text-center py-8">
          <span className="text-3xl mb-2 block">🏆</span>
          <p className="text-sm" style={{ color: theme.hint }}>
            No listeners yet. Be the first!
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {leaderboard.map((entry, index) => (
            <div
              key={entry.address}
              className="flex items-center gap-3 p-3 rounded-xl"
              style={{ backgroundColor: theme.secondaryBg }}
            >
              <span className="text-lg w-8 text-center">
                {index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : `#${index + 1}`}
              </span>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate" style={{ color: theme.text }}>
                  {truncateAddress(entry.address)}
                </p>
                <p className="text-xs" style={{ color: theme.hint }}>
                  {entry.totalSongsListened} songs &middot; {entry.currentStreak} day streak
                </p>
              </div>
              <div className="text-right">
                <p className="text-sm font-bold" style={{ color: theme.accent }}>
                  {entry.totalRewardsEarned.toFixed(1)}
                </p>
                <p className="text-xs" style={{ color: theme.hint }}>TOURS</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );

  // ── Main Render ────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen flex flex-col" style={{ backgroundColor: theme.bg, color: theme.text }}>
      {/* Header */}
      <div className="px-4 pt-3 pb-2 flex items-center justify-between"
        style={{ backgroundColor: theme.sectionBg }}>
        <div className="flex items-center gap-2">
          <span className="text-lg">📻</span>
          <h1 className="text-base font-bold" style={{ color: theme.text }}>
            EmpowerTours Radio
          </h1>
        </div>
        <div className="flex items-center gap-2">
          {/* Connection indicator */}
          <div className="flex items-center gap-1">
            <div
              className="w-2 h-2 rounded-full"
              style={{
                backgroundColor:
                  connectionStatus === 'connected' ? '#22c55e'
                    : connectionStatus === 'fallback' ? '#eab308'
                    : connectionStatus === 'connecting' ? '#3b82f6'
                    : '#ef4444',
              }}
            />
            <span className="text-xs" style={{ color: theme.hint }}>
              {connectionStatus === 'connected' ? 'Live'
                : connectionStatus === 'fallback' ? 'Polling'
                : connectionStatus === 'connecting' ? '...'
                : 'Offline'}
            </span>
          </div>
        </div>
      </div>

      {/* Tab Navigation */}
      <div className="flex border-b" style={{ borderColor: theme.secondaryBg }}>
        {[
          { id: 'now_playing' as TabView, label: 'Now Playing', icon: '🎵' },
          { id: 'queue' as TabView, label: 'Queue', icon: '📋' },
          { id: 'stats' as TabView, label: 'Stats', icon: '📊' },
          { id: 'leaderboard' as TabView, label: 'Top', icon: '🏆' },
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => {
              openSection(tab.id);
            }}
            className="flex-1 py-2.5 text-center text-xs font-medium transition-colors relative"
            style={{
              color: activeTab === tab.id ? theme.accent : theme.hint,
            }}
          >
            <span className="block text-base mb-0.5">{tab.icon}</span>
            {tab.label}
            {activeTab === tab.id && (
              <div
                className="absolute bottom-0 left-1/4 right-1/4 h-0.5 rounded-full"
                style={{ backgroundColor: theme.accent }}
              />
            )}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      <div className="flex-1 overflow-y-auto">
        {activeTab === 'now_playing' && renderNowPlaying()}
        {activeTab === 'queue' && renderQueue()}
        {activeTab === 'stats' && renderStats()}
        {activeTab === 'leaderboard' && renderLeaderboard()}
      </div>

      {/* Bottom Action Bar */}
      <div className="px-4 py-3 border-t" style={{ borderColor: theme.secondaryBg, backgroundColor: theme.sectionBg }}>
        <button
          onClick={handleSubscriptionToggle}
          disabled={subscribing}
          className="w-full py-3 rounded-xl text-sm font-semibold transition-all active:scale-[0.98] disabled:opacity-50"
          style={{
            backgroundColor: isSubscribed ? theme.destructive : theme.button,
            color: theme.buttonText,
          }}
        >
          {subscribing
            ? 'Processing...'
            : isSubscribed
              ? '🔇 Stop Listening in Chat'
              : '🎧 Listen in Chat'
          }
        </button>
        <p className="text-xs text-center mt-2" style={{ color: theme.hint }}>
          {isSubscribed
            ? 'Songs are being sent to your Telegram chat'
            : 'Receive audio directly in your Telegram chat'
          }
        </p>
      </div>
    </div>
  );
}

// ── Sub-Components ──────────────────────────────────────────────────────

function StatCard({
  icon,
  label,
  value,
  theme,
}: {
  icon: string;
  label: string;
  value: string;
  theme: Record<string, string>;
}) {
  return (
    <div className="p-4 rounded-xl text-center" style={{ backgroundColor: theme.secondaryBg }}>
      <span className="text-2xl block mb-1">{icon}</span>
      <p className="text-xl font-bold" style={{ color: theme.text }}>{value}</p>
      <p className="text-xs mt-0.5" style={{ color: theme.hint }}>{label}</p>
    </div>
  );
}

function PriceRow({
  label,
  price,
  theme,
}: {
  label: string;
  price: string;
  theme: Record<string, string>;
}) {
  return (
    <div className="flex justify-between items-center">
      <span className="text-sm" style={{ color: theme.subtitle }}>{label}</span>
      <span className="text-sm font-medium" style={{ color: theme.accent }}>{price}</span>
    </div>
  );
}
