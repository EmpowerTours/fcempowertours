'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams, useSearchParams } from 'next/navigation';

/**
 * Venue Embed Player — Minimal iframe-friendly player
 *
 * Sizes: small (300x80 — song bar), medium (400x300 — art + info), large (full player)
 * Auth via ?key=X&size=small|medium|large
 */

interface VenueSong {
  tokenId: string;
  name: string;
  artist: string;
  imageUrl: string;
  duration: number;
  startedAt: number;
}

interface PlaybackState {
  currentSong: VenueSong | null;
  isPlaying: boolean;
  songsPlayedToday: number;
  totalSongsPlayed: number;
}

type EmbedSize = 'small' | 'medium' | 'large';

export default function VenueEmbedPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const venueId = params.venueId as string;
  const apiKey = searchParams.get('key') || '';
  const size = (searchParams.get('size') || 'medium') as EmbedSize;

  const [state, setState] = useState<PlaybackState | null>(null);
  const [venueName, setVenueName] = useState('');
  const [progress, setProgress] = useState(0);

  const fetchState = useCallback(async () => {
    if (!apiKey) return;
    try {
      const res = await fetch(`/api/venue/${venueId}?key=${apiKey}`);
      const data = await res.json();
      if (data.success) {
        setState(data.state);
        setVenueName(data.venue?.name || '');
      }
    } catch {}
  }, [venueId, apiKey]);

  // SSE for real-time updates
  useEffect(() => {
    if (!apiKey) return;
    fetchState();

    const eventSource = new EventSource(`/api/venue/${venueId}/stream?key=${apiKey}`);
    eventSource.addEventListener('initial_state', (e) => {
      try {
        const data = JSON.parse(e.data);
        if (data.state) setState(data.state);
      } catch {}
    });
    eventSource.addEventListener('state_update', (e) => {
      try {
        const data = JSON.parse(e.data);
        if (data.state) setState(data.state);
      } catch {}
    });
    return () => eventSource.close();
  }, [venueId, apiKey, fetchState]);

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

  if (!apiKey) {
    return <div style={styles.error}>No API key provided</div>;
  }

  const song = state?.currentSong;

  if (size === 'small') return <SmallEmbed song={song} venueName={venueName} progress={progress} isPlaying={state?.isPlaying} />;
  if (size === 'large') return <LargeEmbed song={song} venueName={venueName} progress={progress} isPlaying={state?.isPlaying} totalPlayed={state?.totalSongsPlayed} />;
  return <MediumEmbed song={song} venueName={venueName} progress={progress} isPlaying={state?.isPlaying} />;
}

function SmallEmbed({ song, venueName, progress, isPlaying }: {
  song: VenueSong | null | undefined;
  venueName: string;
  progress: number;
  isPlaying?: boolean;
}) {
  return (
    <div style={{ ...styles.container, height: 80, flexDirection: 'row', gap: 12, padding: '8px 16px' }}>
      {song?.imageUrl && (
        <img src={song.imageUrl} alt="" style={{ width: 48, height: 48, borderRadius: 6, objectFit: 'cover' }} />
      )}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {song?.name || 'No song playing'}
        </div>
        <div style={{ fontSize: 11, opacity: 0.7, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {song?.artist || venueName}
        </div>
        <div style={styles.progressBar}>
          <div style={{ ...styles.progressFill, width: `${progress}%` }} />
        </div>
      </div>
      <div style={{ fontSize: 10, opacity: 0.5 }}>
        {isPlaying ? '▶' : '⏸'}
      </div>
    </div>
  );
}

function MediumEmbed({ song, venueName, progress, isPlaying }: {
  song: VenueSong | null | undefined;
  venueName: string;
  progress: number;
  isPlaying?: boolean;
}) {
  return (
    <div style={{ ...styles.container, height: 300, width: 400 }}>
      {song?.imageUrl && (
        <img
          src={song.imageUrl}
          alt=""
          style={{ width: '100%', height: 200, objectFit: 'cover', borderRadius: '8px 8px 0 0' }}
        />
      )}
      <div style={{ padding: '12px 16px', flex: 1 }}>
        <div style={{ fontSize: 15, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {song?.name || 'No song playing'}
        </div>
        <div style={{ fontSize: 12, opacity: 0.7, marginTop: 2 }}>
          {song?.artist || 'Waiting...'}
        </div>
        <div style={styles.progressBar}>
          <div style={{ ...styles.progressFill, width: `${progress}%` }} />
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, opacity: 0.5, marginTop: 4 }}>
          <span>{venueName}</span>
          <span>{isPlaying ? 'Now Playing' : 'Paused'}</span>
        </div>
      </div>
    </div>
  );
}

function LargeEmbed({ song, venueName, progress, isPlaying, totalPlayed }: {
  song: VenueSong | null | undefined;
  venueName: string;
  progress: number;
  isPlaying?: boolean;
  totalPlayed?: number;
}) {
  return (
    <div style={{ ...styles.container, minHeight: 480 }}>
      {song?.imageUrl && (
        <img
          src={song.imageUrl}
          alt=""
          style={{ width: '100%', height: 280, objectFit: 'cover', borderRadius: '8px 8px 0 0' }}
        />
      )}
      <div style={{ padding: '16px 20px', flex: 1 }}>
        <div style={{ fontSize: 18, fontWeight: 700 }}>
          {song?.name || 'No song playing'}
        </div>
        <div style={{ fontSize: 14, opacity: 0.7, marginTop: 4 }}>
          {song?.artist || 'Waiting for next track...'}
        </div>
        <div style={{ ...styles.progressBar, marginTop: 16 }}>
          <div style={{ ...styles.progressFill, width: `${progress}%` }} />
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, opacity: 0.5, marginTop: 8 }}>
          <span>{venueName}</span>
          <span>{isPlaying ? 'Now Playing' : 'Paused'}</span>
        </div>
        {typeof totalPlayed === 'number' && (
          <div style={{ fontSize: 11, opacity: 0.4, marginTop: 8 }}>
            {totalPlayed} songs played
          </div>
        )}
        <div style={{ fontSize: 10, opacity: 0.3, marginTop: 12 }}>
          Powered by EmpowerTours
        </div>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    background: '#0a0a0f',
    color: '#fff',
    fontFamily: 'system-ui, -apple-system, sans-serif',
    display: 'flex',
    flexDirection: 'column',
    borderRadius: 8,
    overflow: 'hidden',
    alignItems: 'stretch',
  },
  error: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    height: '100%',
    color: '#ff6b6b',
    fontFamily: 'system-ui',
    fontSize: 14,
  },
  progressBar: {
    height: 3,
    background: 'rgba(255,255,255,0.1)',
    borderRadius: 2,
    marginTop: 8,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    background: '#8b5cf6',
    borderRadius: 2,
    transition: 'width 0.5s linear',
  },
};
