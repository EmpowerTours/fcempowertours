'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { useParams, useSearchParams } from 'next/navigation';

/**
 * Venue Player — PRO-Free Music for Businesses
 *
 * Standalone page optimized for tablets, TVs, and computers.
 * Authenticated via URL token (?key=X), no wallet required for playback.
 * Dark theme with ambient color extraction from album art.
 */

interface VenueSong {
  tokenId: string;
  name: string;
  artist: string;
  artistAddress: string;
  audioUrl: string;
  imageUrl: string;
  duration: number;
  startedAt: number;
}

interface VenuePlaybackState {
  currentSong: VenueSong | null;
  isPlaying: boolean;
  songsPlayedToday: number;
  totalSongsPlayed: number;
  lastUpdated: number;
}

interface VenueInfo {
  venueId: string;
  name: string;
  isActive: boolean;
  settings: {
    autoplay: boolean;
    shuffle: boolean;
    genreFilter?: string[];
  };
}

export default function VenuePlayerPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const venueId = params.venueId as string;
  const apiKey = searchParams.get('key') || '';

  const audioRef = useRef<HTMLAudioElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const [venue, setVenue] = useState<VenueInfo | null>(null);
  const [state, setState] = useState<VenuePlaybackState | null>(null);
  const [queue, setQueue] = useState<VenueSong[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const [dominantColor, setDominantColor] = useState('rgb(30, 30, 50)');
  const [isConnected, setIsConnected] = useState(false);
  const [installPrompt, setInstallPrompt] = useState<any>(null);
  const [isStandalone, setIsStandalone] = useState(false);

  // PWA: Register service worker and install prompt
  useEffect(() => {
    // Check if running as installed PWA
    if (window.matchMedia('(display-mode: standalone)').matches) {
      setIsStandalone(true);
    }

    // Register service worker
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(() => {});
    }

    // Capture install prompt
    const handler = (e: Event) => {
      e.preventDefault();
      setInstallPrompt(e);
    };
    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  const headers = { 'X-Venue-Key': apiKey, 'Content-Type': 'application/json' };

  // Fetch initial state
  const fetchState = useCallback(async () => {
    if (!apiKey) {
      setError('No API key provided. Add ?key=YOUR_KEY to the URL.');
      return;
    }

    try {
      const res = await fetch(`/api/venue/${venueId}?key=${apiKey}`);
      const data = await res.json();
      if (!data.success) {
        setError(data.error || 'Failed to load venue');
        return;
      }
      setVenue(data.venue);
      setState(data.state);
      setQueue(data.queue || []);
      setError(null);
    } catch (err: any) {
      setError('Failed to connect to venue');
    }
  }, [venueId, apiKey]);

  // SSE connection
  useEffect(() => {
    if (!apiKey) return;

    const eventSource = new EventSource(`/api/venue/${venueId}/stream?key=${apiKey}`);

    eventSource.addEventListener('initial_state', (e) => {
      try {
        const data = JSON.parse(e.data);
        if (data.state) setState(data.state);
        if (data.queue) setQueue(data.queue);
        setIsConnected(true);
      } catch {}
    });

    eventSource.addEventListener('state_update', (e) => {
      try {
        const data = JSON.parse(e.data);
        if (data.state) setState(data.state);
      } catch {}
    });

    eventSource.addEventListener('queue_update', (e) => {
      try {
        const data = JSON.parse(e.data);
        if (data.queue) setQueue(data.queue);
      } catch {}
    });

    eventSource.onerror = () => {
      setIsConnected(false);
    };

    return () => eventSource.close();
  }, [venueId, apiKey]);

  // Initial fetch
  useEffect(() => {
    fetchState();
  }, [fetchState]);

  // Audio playback sync
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !state?.currentSong) return;

    const currentSrc = state.currentSong.audioUrl;
    if (audio.src !== currentSrc) {
      audio.src = currentSrc;
      audio.load();
    }

    if (state.isPlaying) {
      // Seek to the correct position based on startedAt
      const elapsed = (Date.now() - state.currentSong.startedAt) / 1000;
      if (Math.abs(audio.currentTime - elapsed) > 3) {
        audio.currentTime = Math.min(elapsed, audio.duration || Infinity);
      }
      audio.play().catch(() => {});
    } else {
      audio.pause();
    }
  }, [state?.currentSong?.tokenId, state?.isPlaying]);

  // Progress bar
  useEffect(() => {
    if (!state?.currentSong || !state.isPlaying) return;

    const interval = setInterval(() => {
      const elapsed = (Date.now() - state.currentSong!.startedAt) / 1000;
      const duration = state.currentSong!.duration || 300;
      setProgress(Math.min(100, (elapsed / duration) * 100));
    }, 500);

    return () => clearInterval(interval);
  }, [state?.currentSong?.startedAt, state?.isPlaying]);

  // Audio ended handler
  const handleAudioEnded = async () => {
    if (!state?.currentSong) return;

    try {
      await fetch(`/api/venue/${venueId}`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          action: 'song_ended',
          tokenId: state.currentSong.tokenId,
        }),
      });
    } catch (err) {
      console.error('[VenuePlayer] song_ended report failed:', err);
    }
  };

  // Controls
  const handlePlay = async () => {
    try {
      const res = await fetch(`/api/venue/${venueId}`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ action: 'play' }),
      });
      const data = await res.json();
      if (data.state) setState(data.state);
    } catch {}
  };

  const handlePause = async () => {
    try {
      const res = await fetch(`/api/venue/${venueId}`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ action: 'pause' }),
      });
      const data = await res.json();
      if (data.state) setState(data.state);
    } catch {}
  };

  const handleSkip = async () => {
    try {
      const res = await fetch(`/api/venue/${venueId}`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ action: 'skip' }),
      });
      const data = await res.json();
      if (data.state) setState(data.state);
    } catch {}
  };

  // Ambient color extraction from album art
  useEffect(() => {
    if (!state?.currentSong?.imageUrl) {
      setDominantColor('rgb(30, 30, 50)');
      return;
    }

    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = 1;
        canvas.height = 1;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        ctx.drawImage(img, 0, 0, 1, 1);
        const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data;
        // Darken the color for background use
        setDominantColor(`rgb(${Math.floor(r * 0.3)}, ${Math.floor(g * 0.3)}, ${Math.floor(b * 0.3)})`);
      } catch {
        setDominantColor('rgb(30, 30, 50)');
      }
    };
    img.src = state.currentSong.imageUrl;
  }, [state?.currentSong?.imageUrl]);

  // Format time
  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  const elapsed = state?.currentSong
    ? Math.floor((Date.now() - state.currentSong.startedAt) / 1000)
    : 0;
  const duration = state?.currentSong?.duration || 0;

  if (error) {
    return (
      <div style={{
        minHeight: '100vh',
        background: '#0a0a0f',
        color: '#fff',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontFamily: 'system-ui, -apple-system, sans-serif',
      }}>
        <div style={{ textAlign: 'center', maxWidth: 400 }}>
          <h1 style={{ fontSize: 24, marginBottom: 16 }}>Venue Player</h1>
          <p style={{ color: '#ef4444' }}>{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div style={{
      minHeight: '100vh',
      background: `linear-gradient(135deg, ${dominantColor}, #0a0a0f 60%)`,
      color: '#fff',
      fontFamily: 'system-ui, -apple-system, sans-serif',
      display: 'flex',
      flexDirection: 'column',
      transition: 'background 2s ease',
    }}>
      <audio
        ref={audioRef}
        onEnded={handleAudioEnded}
        preload="auto"
      />

      {/* PWA Install Banner */}
      {installPrompt && !isStandalone && (
        <div style={{
          padding: '10px 24px',
          background: 'rgba(139, 92, 246, 0.15)',
          borderBottom: '1px solid rgba(139, 92, 246, 0.3)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          fontSize: 14,
        }}>
          <span>Install Venue Player for the best experience</span>
          <button
            onClick={async () => {
              installPrompt.prompt();
              const result = await installPrompt.userChoice;
              if (result.outcome === 'accepted') {
                setInstallPrompt(null);
                setIsStandalone(true);
              }
            }}
            style={{
              background: '#8b5cf6',
              color: '#fff',
              border: 'none',
              padding: '6px 16px',
              borderRadius: 6,
              cursor: 'pointer',
              fontWeight: 600,
              fontSize: 13,
            }}
          >
            Install
          </button>
        </div>
      )}

      {/* Header */}
      <header style={{
        padding: '16px 24px',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        borderBottom: '1px solid rgba(255,255,255,0.08)',
      }}>
        <div>
          <h1 style={{ fontSize: 18, fontWeight: 600, margin: 0 }}>
            {venue?.name || 'Venue Player'}
          </h1>
        </div>
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          fontSize: 13,
          color: 'rgba(255,255,255,0.5)',
        }}>
          <span>{state?.songsPlayedToday || 0} songs today</span>
          <span style={{
            width: 8,
            height: 8,
            borderRadius: '50%',
            background: isConnected ? '#22c55e' : '#ef4444',
          }} />
        </div>
      </header>

      {/* Main content */}
      <main style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '40px 24px',
        gap: 32,
      }}>
        {/* Album art */}
        <div style={{
          width: 'min(400px, 80vw)',
          height: 'min(400px, 80vw)',
          borderRadius: 16,
          overflow: 'hidden',
          boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
          background: '#1a1a2e',
        }}>
          {state?.currentSong?.imageUrl ? (
            <img
              src={state.currentSong.imageUrl}
              alt={state.currentSong.name}
              style={{ width: '100%', height: '100%', objectFit: 'cover' }}
            />
          ) : (
            <div style={{
              width: '100%',
              height: '100%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 48,
              color: 'rgba(255,255,255,0.2)',
            }}>
              &#9835;
            </div>
          )}
        </div>

        {/* Song info */}
        <div style={{ textAlign: 'center', maxWidth: 500 }}>
          <h2 style={{
            fontSize: 28,
            fontWeight: 700,
            margin: '0 0 8px',
            lineHeight: 1.2,
          }}>
            {state?.currentSong?.name || 'No Song Playing'}
          </h2>
          <p style={{
            fontSize: 18,
            color: 'rgba(255,255,255,0.6)',
            margin: 0,
          }}>
            {state?.currentSong?.artist || 'Start playback to begin'}
          </p>
        </div>

        {/* Progress bar */}
        <div style={{ width: 'min(500px, 90vw)' }}>
          <div style={{
            width: '100%',
            height: 4,
            background: 'rgba(255,255,255,0.1)',
            borderRadius: 2,
            overflow: 'hidden',
          }}>
            <div style={{
              width: `${progress}%`,
              height: '100%',
              background: 'linear-gradient(90deg, #8b5cf6, #a78bfa)',
              borderRadius: 2,
              transition: 'width 0.5s linear',
            }} />
          </div>
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            fontSize: 12,
            color: 'rgba(255,255,255,0.4)',
            marginTop: 6,
          }}>
            <span>{formatTime(Math.min(elapsed, duration))}</span>
            <span>{formatTime(duration)}</span>
          </div>
        </div>

        {/* Controls */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: 24,
        }}>
          <button
            onClick={state?.isPlaying ? handlePause : handlePlay}
            style={{
              width: 64,
              height: 64,
              borderRadius: '50%',
              border: 'none',
              background: '#8b5cf6',
              color: '#fff',
              fontSize: 24,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              transition: 'transform 0.1s',
            }}
            onMouseDown={(e) => (e.currentTarget.style.transform = 'scale(0.95)')}
            onMouseUp={(e) => (e.currentTarget.style.transform = 'scale(1)')}
          >
            {state?.isPlaying ? '⏸' : '▶'}
          </button>

          <button
            onClick={handleSkip}
            style={{
              width: 48,
              height: 48,
              borderRadius: '50%',
              border: '2px solid rgba(255,255,255,0.2)',
              background: 'transparent',
              color: '#fff',
              fontSize: 18,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            ⏭
          </button>
        </div>

        {/* Up Next */}
        {queue.length > 0 && (
          <div style={{
            width: 'min(500px, 90vw)',
            marginTop: 16,
          }}>
            <h3 style={{
              fontSize: 14,
              fontWeight: 600,
              color: 'rgba(255,255,255,0.5)',
              textTransform: 'uppercase',
              letterSpacing: 1,
              marginBottom: 12,
            }}>
              Up Next
            </h3>
            {queue.slice(0, 5).map((song, i) => (
              <div key={`${song.tokenId}-${i}`} style={{
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                padding: '8px 0',
                borderBottom: '1px solid rgba(255,255,255,0.05)',
              }}>
                <div style={{
                  width: 40,
                  height: 40,
                  borderRadius: 6,
                  overflow: 'hidden',
                  background: '#1a1a2e',
                  flexShrink: 0,
                }}>
                  {song.imageUrl && (
                    <img src={song.imageUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  )}
                </div>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 500 }}>{song.name}</div>
                  <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)' }}>{song.artist}</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>

      {/* Footer */}
      <footer style={{
        padding: '16px 24px',
        textAlign: 'center',
        borderTop: '1px solid rgba(255,255,255,0.08)',
        fontSize: 12,
        color: 'rgba(255,255,255,0.3)',
      }}>
        Powered by EmpowerTours — PRO-Free Music
        &nbsp;&middot;&nbsp;
        {state?.totalSongsPlayed || 0} total plays
      </footer>
    </div>
  );
}
