'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams } from 'next/navigation';
import { useAccount, useSignMessage } from 'wagmi';

/**
 * Venue Owner Dashboard
 *
 * Requires wallet connection (venue owner only).
 * Registration, settings, analytics, catalog browser, API key management.
 */

interface Venue {
  venueId: string;
  name: string;
  isActive: boolean;
  settings: {
    autoplay: boolean;
    shuffle: boolean;
    genreFilter?: string[];
  };
  createdAt: string;
}

interface VenuePlaybackState {
  currentSong: any | null;
  isPlaying: boolean;
  songsPlayedToday: number;
  totalSongsPlayed: number;
  lastUpdated: number;
}

interface CatalogSong {
  tokenId: string;
  name: string;
  artist: string;
  audioUrl: string;
  imageUrl: string;
}

interface HistoryEntry {
  tokenId: string;
  name: string;
  artist: string;
  imageUrl: string;
  playedAt: number;
  duration: number;
}

export default function VenueDashboardPage() {
  const params = useParams();
  const venueId = params.venueId as string;
  const { address, isConnected } = useAccount();

  const [venue, setVenue] = useState<Venue | null>(null);
  const [state, setState] = useState<VenuePlaybackState | null>(null);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [catalog, setCatalog] = useState<CatalogSong[]>([]);
  const [apiKey, setApiKey] = useState<string | null>(null);
  const [newApiKey, setNewApiKey] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<'overview' | 'catalog' | 'settings'>('overview');

  // Registration form state
  const [regName, setRegName] = useState('');
  const [registering, setRegistering] = useState(false);

  // Check venue registration
  const checkRegistration = useCallback(async () => {
    if (!address) return;
    setLoading(true);

    try {
      const res = await fetch(`/api/venue/register?address=${address}`);
      const data = await res.json();

      if (data.hasVenue) {
        setVenue(data.venue);
        // Load the stored API key from localStorage
        const storedKey = localStorage.getItem(`venue-key:${data.venue.venueId}`);
        if (storedKey) setApiKey(storedKey);
      }
    } catch (err: any) {
      setError('Failed to check venue registration');
    } finally {
      setLoading(false);
    }
  }, [address]);

  useEffect(() => {
    checkRegistration();
  }, [checkRegistration]);

  // Load venue data
  useEffect(() => {
    if (!venue || !apiKey) return;

    const fetchData = async () => {
      try {
        const res = await fetch(`/api/venue/${venue.venueId}`, {
          headers: { 'X-Venue-Key': apiKey },
        });
        const data = await res.json();
        if (data.success) {
          setState(data.state);
          setHistory(data.history || []);
        }
      } catch {}
    };

    fetchData();
    const interval = setInterval(fetchData, 15000);
    return () => clearInterval(interval);
  }, [venue, apiKey]);

  // Load catalog
  useEffect(() => {
    if (!venue || !apiKey || tab !== 'catalog') return;

    const fetchCatalog = async () => {
      try {
        const res = await fetch(`/api/venue/${venue.venueId}/catalog?key=${apiKey}`);
        const data = await res.json();
        if (data.success) setCatalog(data.songs);
      } catch {}
    };

    fetchCatalog();
  }, [venue, apiKey, tab]);

  // Register venue
  const { signMessageAsync } = useSignMessage();

  const handleRegister = async () => {
    if (!address || !regName.trim()) return;
    setRegistering(true);
    setError(null);

    try {
      // Get nonce
      const nonceRes = await fetch(`/api/venue/register?action=nonce&address=${address}`);
      const nonceData = await nonceRes.json();
      if (!nonceData.success) throw new Error(nonceData.error);

      const timestamp = Date.now();
      const nonce = nonceData.nonce;
      const message = `EmpowerTours Action Request\n\nAddress: ${address.toLowerCase()}\nAction: Register Venue\nDetails: Venue: ${regName.trim()}\nTimestamp: ${timestamp}\nNonce: ${nonce}\n\nSign this message to authorize this action.`;

      const signature = await signMessageAsync({ message });

      const res = await fetch('/api/venue/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          address,
          signature,
          timestamp,
          nonce,
          name: regName.trim(),
        }),
      });

      const data = await res.json();
      if (!data.success) throw new Error(data.error);

      // Store API key
      setNewApiKey(data.apiKey);
      setApiKey(data.apiKey);
      localStorage.setItem(`venue-key:${data.venueId}`, data.apiKey);

      // Refresh
      await checkRegistration();
    } catch (err: any) {
      setError(err.message || 'Registration failed');
    } finally {
      setRegistering(false);
    }
  };

  // Queue a song
  const handleQueueSong = async (song: CatalogSong) => {
    if (!venue || !apiKey) return;

    try {
      const res = await fetch(`/api/venue/${venue.venueId}`, {
        method: 'POST',
        headers: { 'X-Venue-Key': apiKey, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'queue_song',
          tokenId: song.tokenId,
          name: song.name,
          artist: song.artist,
          audioUrl: song.audioUrl,
          imageUrl: song.imageUrl,
        }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error);
      alert(`Added "${song.name}" to queue`);
    } catch (err: any) {
      alert(`Failed to queue: ${err.message}`);
    }
  };

  // Styles
  const card: React.CSSProperties = {
    background: 'rgba(255,255,255,0.05)',
    borderRadius: 12,
    padding: 24,
    border: '1px solid rgba(255,255,255,0.08)',
  };

  const btn: React.CSSProperties = {
    padding: '10px 20px',
    borderRadius: 8,
    border: 'none',
    background: '#8b5cf6',
    color: '#fff',
    fontSize: 14,
    fontWeight: 600,
    cursor: 'pointer',
  };

  const btnOutline: React.CSSProperties = {
    ...btn,
    background: 'transparent',
    border: '1px solid rgba(255,255,255,0.2)',
  };

  // Not connected
  if (!isConnected) {
    return (
      <div style={{
        minHeight: '100vh',
        background: '#0a0a0f',
        color: '#fff',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontFamily: 'system-ui, sans-serif',
      }}>
        <div style={{ textAlign: 'center', ...card }}>
          <h1 style={{ fontSize: 24, marginBottom: 12 }}>Venue Dashboard</h1>
          <p style={{ color: 'rgba(255,255,255,0.5)' }}>Connect your wallet to manage your venue</p>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div style={{
        minHeight: '100vh',
        background: '#0a0a0f',
        color: '#fff',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontFamily: 'system-ui, sans-serif',
      }}>
        <p>Loading...</p>
      </div>
    );
  }

  // Registration view
  if (!venue) {
    return (
      <div style={{
        minHeight: '100vh',
        background: '#0a0a0f',
        color: '#fff',
        fontFamily: 'system-ui, sans-serif',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
      }}>
        <div style={{ ...card, maxWidth: 500, width: '100%' }}>
          <h1 style={{ fontSize: 24, marginBottom: 8 }}>Register Your Venue</h1>
          <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: 14, marginBottom: 24 }}>
            Stream PRO-free music for a flat WMON subscription.
            100% of revenue flows to artists.
          </p>

          {error && (
            <div style={{
              background: 'rgba(239,68,68,0.1)',
              border: '1px solid rgba(239,68,68,0.3)',
              borderRadius: 8,
              padding: 12,
              marginBottom: 16,
              color: '#ef4444',
              fontSize: 14,
            }}>
              {error}
            </div>
          )}

          {newApiKey && (
            <div style={{
              background: 'rgba(34,197,94,0.1)',
              border: '1px solid rgba(34,197,94,0.3)',
              borderRadius: 8,
              padding: 16,
              marginBottom: 16,
            }}>
              <p style={{ fontWeight: 600, marginBottom: 8, color: '#22c55e' }}>
                Venue registered! Save your API key:
              </p>
              <code style={{
                display: 'block',
                background: 'rgba(0,0,0,0.3)',
                padding: 12,
                borderRadius: 6,
                wordBreak: 'break-all',
                fontSize: 12,
              }}>
                {newApiKey}
              </code>
              <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)', marginTop: 8 }}>
                This key will not be shown again.
              </p>
            </div>
          )}

          <div style={{ marginBottom: 16 }}>
            <label style={{ display: 'block', fontSize: 14, marginBottom: 6, color: 'rgba(255,255,255,0.7)' }}>
              Venue Name
            </label>
            <input
              type="text"
              value={regName}
              onChange={(e) => setRegName(e.target.value)}
              placeholder="e.g. The Blue Note Bar"
              style={{
                width: '100%',
                padding: '10px 12px',
                borderRadius: 8,
                border: '1px solid rgba(255,255,255,0.15)',
                background: 'rgba(255,255,255,0.05)',
                color: '#fff',
                fontSize: 14,
                outline: 'none',
                boxSizing: 'border-box',
              }}
            />
          </div>

          <button
            onClick={handleRegister}
            disabled={registering || !regName.trim()}
            style={{
              ...btn,
              width: '100%',
              opacity: registering || !regName.trim() ? 0.5 : 1,
            }}
          >
            {registering ? 'Registering...' : 'Register Venue'}
          </button>

          <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.3)', marginTop: 16, textAlign: 'center' }}>
            Requires active music subscription
          </p>
        </div>
      </div>
    );
  }

  // Dashboard view
  return (
    <div style={{
      minHeight: '100vh',
      background: '#0a0a0f',
      color: '#fff',
      fontFamily: 'system-ui, sans-serif',
    }}>
      {/* Header */}
      <header style={{
        padding: '16px 24px',
        borderBottom: '1px solid rgba(255,255,255,0.08)',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
      }}>
        <div>
          <h1 style={{ fontSize: 20, margin: 0 }}>{venue.name}</h1>
          <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)', margin: 0 }}>
            Venue Dashboard
          </p>
        </div>
        <a
          href={`/venue/${venue.venueId}?key=${apiKey}`}
          target="_blank"
          rel="noopener"
          style={{ ...btnOutline, fontSize: 12, textDecoration: 'none' }}
        >
          Open Player
        </a>
      </header>

      {/* API Key prompt */}
      {!apiKey && (
        <div style={{ padding: 24 }}>
          <div style={{ ...card, maxWidth: 500 }}>
            <h3 style={{ marginBottom: 12 }}>Enter API Key</h3>
            <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.5)', marginBottom: 16 }}>
              Enter the API key you received during registration.
            </p>
            <input
              type="text"
              placeholder="vk_..."
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  const val = (e.target as HTMLInputElement).value;
                  setApiKey(val);
                  localStorage.setItem(`venue-key:${venue.venueId}`, val);
                }
              }}
              style={{
                width: '100%',
                padding: '10px 12px',
                borderRadius: 8,
                border: '1px solid rgba(255,255,255,0.15)',
                background: 'rgba(255,255,255,0.05)',
                color: '#fff',
                fontSize: 14,
                outline: 'none',
                boxSizing: 'border-box',
              }}
            />
          </div>
        </div>
      )}

      {apiKey && (
        <>
          {/* Tabs */}
          <nav style={{
            display: 'flex',
            gap: 0,
            borderBottom: '1px solid rgba(255,255,255,0.08)',
            padding: '0 24px',
          }}>
            {(['overview', 'catalog', 'settings'] as const).map(t => (
              <button
                key={t}
                onClick={() => setTab(t)}
                style={{
                  padding: '12px 20px',
                  background: 'none',
                  border: 'none',
                  color: tab === t ? '#8b5cf6' : 'rgba(255,255,255,0.5)',
                  borderBottom: tab === t ? '2px solid #8b5cf6' : '2px solid transparent',
                  cursor: 'pointer',
                  fontSize: 14,
                  fontWeight: tab === t ? 600 : 400,
                  textTransform: 'capitalize',
                }}
              >
                {t}
              </button>
            ))}
          </nav>

          <div style={{ padding: 24, maxWidth: 900, margin: '0 auto' }}>
            {/* Overview Tab */}
            {tab === 'overview' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
                {/* Stats grid */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 16 }}>
                  <div style={card}>
                    <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)', marginBottom: 4 }}>Now Playing</div>
                    <div style={{ fontSize: 16, fontWeight: 600 }}>
                      {state?.currentSong?.name || 'Nothing'}
                    </div>
                    {state?.currentSong && (
                      <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.5)' }}>
                        {state.currentSong.artist}
                      </div>
                    )}
                  </div>
                  <div style={card}>
                    <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)', marginBottom: 4 }}>Today</div>
                    <div style={{ fontSize: 28, fontWeight: 700 }}>{state?.songsPlayedToday || 0}</div>
                    <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)' }}>songs played</div>
                  </div>
                  <div style={card}>
                    <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)', marginBottom: 4 }}>All Time</div>
                    <div style={{ fontSize: 28, fontWeight: 700 }}>{state?.totalSongsPlayed || 0}</div>
                    <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)' }}>total plays</div>
                  </div>
                  <div style={card}>
                    <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)', marginBottom: 4 }}>Status</div>
                    <div style={{
                      fontSize: 16,
                      fontWeight: 600,
                      color: state?.isPlaying ? '#22c55e' : 'rgba(255,255,255,0.5)',
                    }}>
                      {state?.isPlaying ? 'Playing' : 'Paused'}
                    </div>
                  </div>
                </div>

                {/* Recent history */}
                <div style={card}>
                  <h3 style={{ fontSize: 16, marginBottom: 16 }}>Recent Plays</h3>
                  {history.length === 0 ? (
                    <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: 14 }}>No plays yet</p>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      {history.map((entry, i) => (
                        <div key={`${entry.tokenId}-${i}`} style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 12,
                          padding: '6px 0',
                          borderBottom: i < history.length - 1 ? '1px solid rgba(255,255,255,0.05)' : 'none',
                        }}>
                          <div style={{
                            width: 36,
                            height: 36,
                            borderRadius: 6,
                            overflow: 'hidden',
                            background: '#1a1a2e',
                            flexShrink: 0,
                          }}>
                            {entry.imageUrl && (
                              <img src={entry.imageUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                            )}
                          </div>
                          <div style={{ flex: 1 }}>
                            <div style={{ fontSize: 14 }}>{entry.name}</div>
                            <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)' }}>{entry.artist}</div>
                          </div>
                          <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.3)' }}>
                            {Math.floor(entry.duration / 60)}m {entry.duration % 60}s
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Catalog Tab */}
            {tab === 'catalog' && (
              <div style={card}>
                <h3 style={{ fontSize: 16, marginBottom: 4 }}>Rights-Cleared Catalog</h3>
                <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.4)', marginBottom: 20 }}>
                  {catalog.length} songs available — all PRO-free with on-chain rights declarations
                </p>

                {catalog.length === 0 ? (
                  <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: 14 }}>
                    No cleared songs available yet. Artists must submit rights declarations.
                  </p>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    {catalog.map((song, i) => (
                      <div key={song.tokenId} style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 12,
                        padding: '10px 0',
                        borderBottom: '1px solid rgba(255,255,255,0.05)',
                      }}>
                        <div style={{
                          width: 44,
                          height: 44,
                          borderRadius: 6,
                          overflow: 'hidden',
                          background: '#1a1a2e',
                          flexShrink: 0,
                        }}>
                          {song.imageUrl && (
                            <img src={song.imageUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                          )}
                        </div>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: 14, fontWeight: 500 }}>{song.name}</div>
                          <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)' }}>{song.artist}</div>
                        </div>
                        <button
                          onClick={() => handleQueueSong(song)}
                          style={{
                            ...btnOutline,
                            fontSize: 12,
                            padding: '6px 14px',
                          }}
                        >
                          + Queue
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Settings Tab */}
            {tab === 'settings' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
                <div style={card}>
                  <h3 style={{ fontSize: 16, marginBottom: 16 }}>Player URL</h3>
                  <code style={{
                    display: 'block',
                    background: 'rgba(0,0,0,0.3)',
                    padding: 12,
                    borderRadius: 6,
                    wordBreak: 'break-all',
                    fontSize: 12,
                  }}>
                    {typeof window !== 'undefined' ? `${window.location.origin}/venue/${venue.venueId}?key=${apiKey}` : ''}
                  </code>
                  <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)', marginTop: 8 }}>
                    Open this URL on your venue display (tablet, TV, etc.)
                  </p>
                </div>

                <div style={card}>
                  <h3 style={{ fontSize: 16, marginBottom: 16 }}>Venue Settings</h3>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                      <input
                        type="checkbox"
                        checked={venue.settings.autoplay}
                        readOnly
                        style={{ accentColor: '#8b5cf6' }}
                      />
                      <span style={{ fontSize: 14 }}>Autoplay — automatically advance to next song</span>
                    </label>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                      <input
                        type="checkbox"
                        checked={venue.settings.shuffle}
                        readOnly
                        style={{ accentColor: '#8b5cf6' }}
                      />
                      <span style={{ fontSize: 14 }}>Shuffle — randomize song selection</span>
                    </label>
                  </div>
                </div>

                <div style={card}>
                  <h3 style={{ fontSize: 16, marginBottom: 16 }}>Venue ID</h3>
                  <code style={{
                    display: 'block',
                    background: 'rgba(0,0,0,0.3)',
                    padding: 12,
                    borderRadius: 6,
                    wordBreak: 'break-all',
                    fontSize: 12,
                  }}>
                    {venue.venueId}
                  </code>
                </div>
              </div>
            )}
          </div>
        </>
      )}

      {/* Footer */}
      <footer style={{
        padding: '16px 24px',
        textAlign: 'center',
        borderTop: '1px solid rgba(255,255,255,0.08)',
        fontSize: 12,
        color: 'rgba(255,255,255,0.3)',
      }}>
        Powered by EmpowerTours — PRO-Free Music for Businesses
      </footer>
    </div>
  );
}
