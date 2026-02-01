import React, { useState, useEffect, useRef, useCallback, useMemo, memo } from 'react';
import { createPortal } from 'react-dom';
import { Play, Pause, SkipForward, SkipBack, Music2, GripVertical, ChevronUp, X, GripHorizontal, Crown } from 'lucide-react';

interface Song {
  id: string;
  tokenId: string;
  title: string;
  artist: string;
  artistUsername?: string; // Farcaster username (e.g., @unify34)
  artistFid?: number; // Artist's Farcaster ID
  audioUrl: string;
  imageUrl: string;
  isPreview?: boolean; // True if user doesn't own this NFT
  contractAddress?: string;
}

interface NFTObject {
  id: string;
  type: 'ART' | 'MUSIC' | 'EXPERIENCE';
  tokenId: string;
  name: string;
  imageUrl: string;
  price: string;
  contractAddress: string;
  tokenURI?: string;
  artistUsername?: string;
  artistFid?: number;
}

interface MusicPlaylistProps {
  userAddress?: string;
  userFid?: number;
  clickedNFTs?: NFTObject[];
  onPlayingChange?: (nftId: string | null, isPlaying: boolean) => void;
  onClose?: () => void;
  isSubscriber?: boolean; // If true, user can listen to all songs (not just owned)
}

const MusicPlaylistComponent: React.FC<MusicPlaylistProps> = ({ userAddress, userFid, clickedNFTs = [], onPlayingChange, onClose, isSubscriber = false }) => {
  const [mounted, setMounted] = useState(false);
  const [ownedSongs, setOwnedSongs] = useState<Song[]>([]);
  const [songs, setSongs] = useState<Song[]>([]);
  const [currentSongIndex, setCurrentSongIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [showQueue, setShowQueue] = useState(false);
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const previewTimeLimitRef = useRef<number | null>(null);
  const lastAutoPlayedTokenIdRef = useRef<string | null>(null);
  const clickedNFTsRef = useRef<string>(''); // Track serialized clickedNFTs to detect actual changes
  const [savedPlaylistOrder, setSavedPlaylistOrder] = useState<string[] | null>(null);
  const [playlistLoaded, setPlaylistLoaded] = useState(false);
  const [collectorImages, setCollectorImages] = useState<Record<string, string>>({});

  // Drag state for modal position
  const [modalPosition, setModalPosition] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const dragStartRef = useRef({ x: 0, y: 0, posX: 0, posY: 0 });
  const modalRef = useRef<HTMLDivElement>(null);

  // Mount state for portal rendering
  useEffect(() => {
    setMounted(true);
  }, []);

  // Modal drag handlers
  const handleModalDragStart = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    // Don't start drag if clicking on interactive elements
    const target = e.target as HTMLElement;
    if (target.closest('button, input, [draggable="true"]')) return;

    setIsDragging(true);
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
    dragStartRef.current = {
      x: clientX,
      y: clientY,
      posX: modalPosition.x,
      posY: modalPosition.y,
    };
  }, [modalPosition]);

  const handleModalDrag = useCallback((e: MouseEvent | TouchEvent) => {
    if (!isDragging) return;
    e.preventDefault();

    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
    const deltaX = clientX - dragStartRef.current.x;
    const deltaY = clientY - dragStartRef.current.y;

    setModalPosition({
      x: dragStartRef.current.posX + deltaX,
      y: dragStartRef.current.posY + deltaY,
    });
  }, [isDragging]);

  const handleModalDragEnd = useCallback(() => {
    setIsDragging(false);
  }, []);

  // Attach global mouse/touch move/up listeners when dragging
  useEffect(() => {
    if (isDragging) {
      window.addEventListener('mousemove', handleModalDrag);
      window.addEventListener('mouseup', handleModalDragEnd);
      window.addEventListener('touchmove', handleModalDrag, { passive: false });
      window.addEventListener('touchend', handleModalDragEnd);
    }

    return () => {
      window.removeEventListener('mousemove', handleModalDrag);
      window.removeEventListener('mouseup', handleModalDragEnd);
      window.removeEventListener('touchmove', handleModalDrag);
      window.removeEventListener('touchend', handleModalDragEnd);
    };
  }, [isDragging, handleModalDrag, handleModalDragEnd]);

  // Play recording for artist royalties
  const playStartTimeRef = useRef<number | null>(null);
  const recordedPlaysRef = useRef<Set<string>>(new Set()); // Track which plays have been recorded this session
  const MIN_PLAY_DURATION_FOR_RECORD = 30; // Minimum 30 seconds to count as a play

  // Load saved playlist order from API on mount
  useEffect(() => {
    if (!userFid) {
      setPlaylistLoaded(true);
      return;
    }

    const loadPlaylist = async () => {
      try {
        // First try localStorage for faster load
        const localKey = `playlist_${userFid}`;
        const localData = localStorage.getItem(localKey);
        if (localData) {
          const parsed = JSON.parse(localData);
          setSavedPlaylistOrder(parsed.songOrder);
          console.log('[MusicPlaylist] Loaded playlist from localStorage:', parsed.songOrder?.length);
        }

        // Then sync with server
        const response = await fetch(`/api/music/playlist?fid=${userFid}`);
        const data = await response.json();
        if (data.success && data.playlist?.songOrder) {
          setSavedPlaylistOrder(data.playlist.songOrder);
          // Update localStorage with server data
          localStorage.setItem(localKey, JSON.stringify(data.playlist));
          console.log('[MusicPlaylist] Synced playlist from server:', data.playlist.songOrder.length);
        }
      } catch (error) {
        console.error('[MusicPlaylist] Failed to load playlist:', error);
      } finally {
        setPlaylistLoaded(true);
      }
    };

    loadPlaylist();
  }, [userFid]);

  // Save playlist order when songs are reordered (debounced)
  const savePlaylistOrder = useCallback(async (songOrder: string[]) => {
    if (!userFid) return;

    // Save to localStorage immediately
    const localKey = `playlist_${userFid}`;
    localStorage.setItem(localKey, JSON.stringify({
      songOrder,
      updatedAt: Date.now(),
    }));

    // Sync to server
    try {
      await fetch('/api/music/playlist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fid: userFid,
          name: 'My Playlist',
          songOrder,
        }),
      });
      console.log('[MusicPlaylist] Saved playlist order:', songOrder.length, 'songs');
    } catch (error) {
      console.error('[MusicPlaylist] Failed to save playlist:', error);
    }
  }, [userFid]);

  // Record play for artist royalties (only for non-preview plays >= 30 seconds)
  const recordPlay = useCallback(async (song: Song, playDuration: number) => {
    // Don't record preview plays
    if (song.isPreview) {
      console.log('[MusicPlaylist] Skipping record - preview mode');
      return;
    }

    // Don't record if duration is too short
    if (playDuration < MIN_PLAY_DURATION_FOR_RECORD) {
      console.log('[MusicPlaylist] Skipping record - duration too short:', playDuration);
      return;
    }

    // Don't record if no user address
    if (!userAddress) {
      console.log('[MusicPlaylist] Skipping record - no user address');
      return;
    }

    // Create unique key for this play session
    const playKey = `${song.tokenId}-${Date.now()}`;

    // Don't double-record the same song in the same session
    const sessionKey = `${song.tokenId}-${Math.floor(Date.now() / 60000)}`; // Per-minute key
    if (recordedPlaysRef.current.has(sessionKey)) {
      console.log('[MusicPlaylist] Skipping record - already recorded this minute');
      return;
    }

    try {
      console.log('[MusicPlaylist] Recording play:', song.title, 'duration:', Math.floor(playDuration), 'seconds');

      const response = await fetch('/api/record-play', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userAddress,
          masterTokenId: parseInt(song.tokenId),
          duration: Math.floor(playDuration),
          userFid: userFid, // For Farcaster bot casting
          songName: song.title,
          artistName: song.artistUsername || song.artist,
          artistFid: song.artistFid,
        }),
      });

      const data = await response.json();

      if (data.success) {
        recordedPlaysRef.current.add(sessionKey);
        console.log('[MusicPlaylist] Play recorded successfully:', data.txHash);
      } else {
        console.warn('[MusicPlaylist] Failed to record play:', data.error);
      }
    } catch (error) {
      console.error('[MusicPlaylist] Error recording play:', error);
    }
  }, [userAddress, userFid]);

  // Fetch user's purchased music NFTs
  useEffect(() => {
    if (!userAddress) return;

    const fetchPurchasedSongs = async () => {
      try {
        const response = await fetch(`/api/music/get-user-licenses?address=${userAddress}`);
        const data = await response.json();

        if (data.success) {
          setOwnedSongs(data.songs);
        }
      } catch (error) {
        console.error('[MusicPlaylist] Failed to fetch songs:', error);
      }
    };

    fetchPurchasedSongs();
  }, [userAddress]);

  // Process clicked NFTs - when user clicks an NFT, play ONLY that song
  useEffect(() => {
    const processClickedNFTs = async () => {
      // Check if clickedNFTs actually changed (not just ownedSongs update)
      const currentClickedIds = clickedNFTs.map(n => n.tokenId).join(',');
      const clickedNFTsChanged = currentClickedIds !== clickedNFTsRef.current;

      // If no clicked NFTs, don't show the player (user must click a music NFT to play)
      if (clickedNFTs.length === 0) {
        clickedNFTsRef.current = '';
        // Clear songs so player hides - only show when user actively clicks a music NFT
        if (songs.length > 0) {
          setSongs([]);
        }
        return;
      }

      const clickedSongs: Song[] = [];
      let lastClickedTokenId: string | null = null;

      for (const nft of clickedNFTs) {
        try {
          // Check if user owns this NFT
          const isOwned = ownedSongs.some(s => s.tokenId === nft.tokenId);
          // Also check if we already added this as a clicked song
          const alreadyClicked = clickedSongs.some(s => s.tokenId === nft.tokenId);

          if (isOwned) {
            // User owns this NFT - add it to clickedSongs from ownedSongs
            const ownedSong = ownedSongs.find(s => s.tokenId === nft.tokenId);
            if (ownedSong && !alreadyClicked) {
              clickedSongs.push(ownedSong);
              lastClickedTokenId = nft.tokenId;
            }
          } else if (!alreadyClicked) {
            // User doesn't own this NFT
            // If subscriber, they can still listen to full song
            // Otherwise, it's preview mode (3 seconds only)
            const shouldBePreview = !isSubscriber;

            const fallbackSong: Song = {
              id: `preview-${nft.tokenId}`,
              tokenId: nft.tokenId,
              title: nft.name || `Music NFT #${nft.tokenId}`,
              artist: 'Unknown Artist',
              artistUsername: nft.artistUsername, // Farcaster username from API
              artistFid: nft.artistFid, // Artist's Farcaster ID for bot casting
              audioUrl: '', // Will try to fetch from metadata
              imageUrl: nft.imageUrl,
              isPreview: shouldBePreview, // Only preview if not subscriber
              contractAddress: nft.contractAddress,
            };

            if (nft.tokenURI) {
              // Resolve IPFS URL
              const resolveIPFS = (url: string) => {
                if (!url) return '';
                if (url.startsWith('ipfs://')) {
                  return url.replace('ipfs://', 'https://harlequin-used-hare-224.mypinata.cloud/ipfs/');
                }
                return url;
              };

              try {
                const metadataUrl = resolveIPFS(nft.tokenURI);
                const metadataRes = await fetch(metadataUrl);

                if (metadataRes.ok) {
                  const metadata = await metadataRes.json();
                  const audioUrl = resolveIPFS(metadata.animation_url || metadata.audio_url || '');

                  if (audioUrl) {
                    fallbackSong.audioUrl = audioUrl;
                    fallbackSong.title = metadata.name || fallbackSong.title;
                    fallbackSong.artist = metadata.artist || metadata.properties?.artist || 'Unknown Artist';
                  }
                }
              } catch (err) {
                // Silently fail - song will show but won't play
              }
            }

            // Add song even if audio URL is empty (will show in queue but can't play)
            clickedSongs.push(fallbackSong);
            lastClickedTokenId = nft.tokenId;
          }
        } catch (error) {
          // Skip failed NFTs
        }
      }

      // clickedSongs already contains the correct songs (owned or preview)
      setSongs(clickedSongs);

      // Only auto-play if clickedNFTs actually changed AND we haven't already auto-played this token
      const shouldAutoPlay = clickedNFTsChanged &&
                             lastClickedTokenId &&
                             lastClickedTokenId !== lastAutoPlayedTokenIdRef.current;

      if (shouldAutoPlay && lastClickedTokenId && clickedSongs.length > 0) {
        const newSongIndex = clickedSongs.findIndex(s => s.tokenId === lastClickedTokenId);
        if (newSongIndex !== -1) {
          setCurrentSongIndex(newSongIndex);
          setIsPlaying(true);
          lastAutoPlayedTokenIdRef.current = lastClickedTokenId;
        }
      }

      // Update the ref to track current clicked NFTs
      clickedNFTsRef.current = currentClickedIds;
    };

    if ((clickedNFTs.length > 0 || ownedSongs.length > 0) && playlistLoaded) {
      processClickedNFTs();
    }
  }, [clickedNFTs, ownedSongs, playlistLoaded, savedPlaylistOrder]);

  // Fetch collector edition info for all songs
  useEffect(() => {
    if (songs.length === 0) return;
    const tokenIds = songs.map(s => s.tokenId).filter(Boolean);
    if (tokenIds.length === 0) return;

    const fetchCollectorInfo = async () => {
      try {
        const res = await fetch('/api/nft/collector-info', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ tokenIds }),
        });
        if (!res.ok) return;
        const data: Record<string, { isCollectorMaster: boolean; collectorImageUrl: string | null }> = await res.json();
        const imageMap: Record<string, string> = {};
        for (const [tid, info] of Object.entries(data)) {
          if (info.isCollectorMaster && info.collectorImageUrl) {
            imageMap[tid] = info.collectorImageUrl;
          }
        }
        if (Object.keys(imageMap).length > 0) {
          setCollectorImages(prev => ({ ...prev, ...imageMap }));
        }
      } catch {
        // Silently fail — standard images remain
      }
    };

    fetchCollectorInfo();
  }, [songs.map(s => s.tokenId).join(',')]);

  // Notify parent of playing state changes
  useEffect(() => {
    const currentSong = songs[currentSongIndex];
    if (onPlayingChange && currentSong) {
      const nftId = currentSong.id.startsWith('preview-')
        ? `music-${currentSong.tokenId}`
        : currentSong.id;
      onPlayingChange(nftId, isPlaying);
    } else if (onPlayingChange && !currentSong) {
      onPlayingChange(null, false);
    }
  }, [isPlaying, currentSongIndex, songs, onPlayingChange]);

  // Control audio playback based on isPlaying state
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || songs.length === 0) return;

    const currentSong = songs[currentSongIndex];
    if (!currentSong?.audioUrl) {
      setIsPlaying(false);
      return;
    }

    // Reset to beginning when song changes
    audio.currentTime = 0;
    setCurrentTime(0);

    if (isPlaying) {
      // Track play start time for recording
      playStartTimeRef.current = Date.now();
      audio.play().catch(() => {
        setIsPlaying(false);
      });
    } else {
      // When pausing, check if we should record the play
      if (playStartTimeRef.current) {
        const playDuration = (Date.now() - playStartTimeRef.current) / 1000;
        recordPlay(currentSong, playDuration);
        playStartTimeRef.current = null;
      }
      audio.pause();
    }
  }, [isPlaying, currentSongIndex, songs, recordPlay]);

  // Audio event handlers
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const handleTimeUpdate = () => {
      setCurrentTime(audio.currentTime);

      // Enforce 3-second preview limit for preview songs
      const currentSong = songs[currentSongIndex];
      if (currentSong?.isPreview && audio.currentTime >= 3) {
        audio.pause();
        setIsPlaying(false);
        // Don't auto-skip - let user control when to play next
      }
    };

    const handleLoadedMetadata = () => {
      setDuration(audio.duration);
      // For preview songs, show duration as 3 seconds max
      const currentSong = songs[currentSongIndex];
      if (currentSong?.isPreview) {
        setDuration(Math.min(3, audio.duration));
      }
    };

    const handleEnded = () => {
      // Record the play when song ends naturally
      const currentSong = songs[currentSongIndex];
      if (currentSong && playStartTimeRef.current) {
        const playDuration = (Date.now() - playStartTimeRef.current) / 1000;
        recordPlay(currentSong, playDuration);
        playStartTimeRef.current = null;
      }

      if (currentSongIndex < songs.length - 1) {
        setCurrentSongIndex(prev => prev + 1);
        setIsPlaying(true);
      } else {
        setIsPlaying(false);
      }
    };

    const handleError = () => {
      setIsPlaying(false);
    };

    audio.addEventListener('timeupdate', handleTimeUpdate);
    audio.addEventListener('loadedmetadata', handleLoadedMetadata);
    audio.addEventListener('ended', handleEnded);
    audio.addEventListener('error', handleError);

    return () => {
      audio.removeEventListener('timeupdate', handleTimeUpdate);
      audio.removeEventListener('loadedmetadata', handleLoadedMetadata);
      audio.removeEventListener('ended', handleEnded);
      audio.removeEventListener('error', handleError);
    };
  }, [currentSongIndex, songs, recordPlay]);

  const handlePlayPause = () => {
    const audio = audioRef.current;
    if (!audio || songs.length === 0) return;

    if (isPlaying) {
      audio.pause();
    } else {
      audio.play();
    }
    setIsPlaying(!isPlaying);
  };

  const handleNext = () => {
    if (currentSongIndex < songs.length - 1) {
      setCurrentSongIndex(prev => prev + 1);
      setIsPlaying(true);
    }
  };

  const handlePrevious = () => {
    if (currentSongIndex > 0) {
      setCurrentSongIndex(prev => prev - 1);
      setIsPlaying(true);
    }
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const audio = audioRef.current;
    if (!audio) return;

    const newTime = parseFloat(e.target.value);
    const currentSong = songs[currentSongIndex];

    // Prevent seeking beyond 3 seconds for preview songs
    if (currentSong?.isPreview && newTime > 3) {
      audio.currentTime = 3;
      setCurrentTime(3);
      audio.pause();
      setIsPlaying(false);
    } else {
      audio.currentTime = newTime;
      setCurrentTime(newTime);
    }
  };

  const handleSongClick = (index: number) => {
    setCurrentSongIndex(index);
    setIsPlaying(true);
  };

  // Drag and drop for reordering
  const handleDragStart = (e: React.DragEvent, index: number) => {
    setDraggedIndex(index);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    if (draggedIndex === null || draggedIndex === index) return;

    const newSongs = [...songs];
    const draggedSong = newSongs[draggedIndex];
    newSongs.splice(draggedIndex, 1);
    newSongs.splice(index, 0, draggedSong);

    // Adjust current song index if needed
    if (currentSongIndex === draggedIndex) {
      setCurrentSongIndex(index);
    } else if (draggedIndex < currentSongIndex && index >= currentSongIndex) {
      setCurrentSongIndex(currentSongIndex - 1);
    } else if (draggedIndex > currentSongIndex && index <= currentSongIndex) {
      setCurrentSongIndex(currentSongIndex + 1);
    }

    setSongs(newSongs);
    setDraggedIndex(index);
  };

  const handleDragEnd = () => {
    setDraggedIndex(null);
    // Save the new playlist order
    if (songs.length > 0) {
      const songOrder = songs.map(s => s.tokenId);
      savePlaylistOrder(songOrder);
    }
  };

  const formatTime = (seconds: number) => {
    if (isNaN(seconds)) return '0:00';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  // Render if we have songs (owned or clicked previews)
  if (songs.length === 0 || !mounted) {
    return null;
  }

  const currentSong = songs[currentSongIndex];

  // Render as portal at bottom center of screen (above input bar)
  const modalContent = (
    <div
      ref={modalRef}
      className="fixed left-0 right-0 flex justify-center px-4"
      style={{
        zIndex: 9998,
        bottom: '140px',
        transform: `translate(${modalPosition.x}px, ${modalPosition.y}px)`,
        transition: isDragging ? 'none' : 'transform 0.1s ease-out',
      }}
    >
      <div
        className={`w-full max-w-lg ${isDragging ? 'cursor-grabbing' : 'cursor-grab'}`}
        onMouseDown={handleModalDragStart}
        onTouchStart={handleModalDragStart}
      >
        {/* Audio element */}
        <audio
          ref={audioRef}
          src={currentSong?.audioUrl}
        />

        {/* Queue Panel */}
        {showQueue && (
          <div className="mb-4">
            <div className="bg-black/90 backdrop-blur-xl border border-cyan-500/20 rounded-2xl p-4 max-h-64 overflow-y-auto">
            <div className="flex justify-between items-center mb-3">
              <h3 className="text-white font-semibold">Queue ({songs.length})</h3>
              <button onClick={() => setShowQueue(false)} className="text-gray-400 hover:text-white">
                <ChevronUp className="w-5 h-5" />
              </button>
            </div>
            <div className="space-y-2">
              {songs.map((song, index) => (
                <div
                  key={song.id}
                  draggable
                  onDragStart={(e) => handleDragStart(e, index)}
                  onDragOver={(e) => handleDragOver(e, index)}
                  onDragEnd={handleDragEnd}
                  onClick={() => handleSongClick(index)}
                  className={`flex items-center gap-3 p-2 rounded-lg cursor-move hover:bg-gray-800/50 transition-all ${
                    index === currentSongIndex ? 'bg-cyan-500/20 border border-cyan-500/30' : ''
                  } ${draggedIndex === index ? 'opacity-50' : ''}`}
                >
                  <GripVertical className="w-4 h-4 text-gray-600 flex-shrink-0" />
                  <div className="w-10 h-10 bg-gradient-to-br from-cyan-500/20 to-purple-600/20 rounded flex items-center justify-center overflow-hidden flex-shrink-0 relative">
                    {(collectorImages[song.tokenId] || song.imageUrl) ? (
                      <img src={collectorImages[song.tokenId] || song.imageUrl} alt={song.title} className="w-full h-full object-cover" />
                    ) : (
                      <Music2 className="w-5 h-5 text-cyan-400" />
                    )}
                    {collectorImages[song.tokenId] && (
                      <div className="absolute -top-0.5 -right-0.5 w-3.5 h-3.5 bg-amber-500 rounded-full flex items-center justify-center">
                        <Crown className="w-2 h-2 text-white" />
                      </div>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <div className={`text-sm truncate ${index === currentSongIndex ? 'text-cyan-400 font-semibold' : 'text-white'}`}>
                        {song.title}
                      </div>
                      {song.isPreview && (
                        <span className="text-[10px] px-1.5 py-0.5 bg-purple-500/30 text-purple-300 rounded-full flex-shrink-0">
                          PREVIEW
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-gray-400 truncate">{song.artist}</div>
                  </div>
                  {index === currentSongIndex && isPlaying && (
                    <div className="flex gap-0.5 items-end h-4">
                      <div className="w-1 bg-cyan-500 rounded-full animate-[bounce_0.6s_ease-in-out_infinite]" style={{ height: '40%', animationDelay: '0s' }}></div>
                      <div className="w-1 bg-cyan-500 rounded-full animate-[bounce_0.6s_ease-in-out_infinite]" style={{ height: '80%', animationDelay: '0.2s' }}></div>
                      <div className="w-1 bg-cyan-500 rounded-full animate-[bounce_0.6s_ease-in-out_infinite]" style={{ height: '60%', animationDelay: '0.4s' }}></div>
                    </div>
                  )}
                </div>
              ))}
            </div>
            </div>
          </div>
        )}

        {/* Player Bar - Glass Panel Centered */}
      <div className="w-full bg-black/60 backdrop-blur-xl border-4 border-cyan-500 rounded-2xl shadow-2xl shadow-cyan-500/50">
        {/* Drag Handle + Close Button - Inside Player */}
        {onClose && (
          <div className="flex justify-between items-center px-4 pt-3 pb-2 border-b border-gray-800">
            <div className="flex items-center gap-2">
              {/* Drag handle indicator */}
              <GripHorizontal className="w-4 h-4 text-gray-500 cursor-grab" />
              <Music2 className="w-5 h-5 text-cyan-400" />
              <span className="text-sm font-mono text-cyan-400 tracking-widest">MUSIC PLAYER</span>
              <span className="text-[10px] text-gray-600 hidden sm:inline">(drag to move)</span>
            </div>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-white transition-colors flex items-center gap-1 group"
            >
              <span className="text-[10px] font-mono hidden group-hover:block text-cyan-400">BACK TO ORBIT</span>
              <X className="w-5 h-5" />
            </button>
          </div>
        )}
        <div className="max-w-7xl mx-auto px-2 sm:px-4 py-2 sm:py-3">
          {/* Mobile Layout - Stacked */}
          <div className="sm:hidden">
            {/* Row 1: Song info + Controls + Queue */}
            <div className="flex items-center gap-2">
              {/* Artist + Song title */}
              <div className="flex-1 min-w-0">
                {currentSong?.artistUsername && (
                  <div className="text-cyan-400 text-[10px] truncate">@{currentSong.artistUsername}</div>
                )}
                <div className="text-white text-xs font-semibold truncate">{currentSong?.title || 'No song'}</div>
                {currentSong?.isPreview && (
                  <span className="text-[9px] text-purple-300">PREVIEW</span>
                )}
              </div>

              {/* Controls */}
              <div className="flex items-center gap-1">
                <button onClick={handlePrevious} disabled={currentSongIndex === 0} className="text-gray-400 hover:text-white disabled:opacity-30 p-1">
                  <SkipBack className="w-4 h-4" />
                </button>
                <button onClick={handlePlayPause} className="w-8 h-8 bg-cyan-500 hover:bg-cyan-400 rounded-full flex items-center justify-center">
                  {isPlaying ? <Pause className="w-4 h-4 text-black" fill="currentColor" /> : <Play className="w-4 h-4 text-black ml-0.5" fill="currentColor" />}
                </button>
                <button onClick={handleNext} disabled={currentSongIndex === songs.length - 1} className="text-gray-400 hover:text-white disabled:opacity-30 p-1">
                  <SkipForward className="w-4 h-4" />
                </button>
              </div>

              {/* Queue */}
              <button onClick={() => setShowQueue(!showQueue)} className="text-gray-400 hover:text-white text-xs px-1">
                Q({songs.length})
              </button>
            </div>

            {/* Row 2: Progress bar with times */}
            <div className="flex items-center gap-2 mt-2">
              <span className="text-[10px] text-gray-400 w-8 text-right">{formatTime(currentTime)}</span>
              <input
                type="range"
                min="0"
                max={duration || 0}
                value={currentTime}
                onChange={handleSeek}
                className="flex-1 h-1 bg-gray-700 rounded-full appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:bg-cyan-500 [&::-webkit-slider-thumb]:rounded-full"
              />
              <span className="text-[10px] text-gray-400 w-8">{formatTime(duration)}</span>
            </div>
          </div>

          {/* Desktop Layout - Original horizontal */}
          <div className="hidden sm:flex items-center gap-4">
            {/* Current Song Info */}
            <div className="flex items-center gap-3 w-64 flex-shrink-0 min-w-0">
              {currentSong && (
                <>
                  <div className="w-12 h-12 bg-gradient-to-br from-cyan-500 to-purple-600 rounded-lg overflow-hidden flex items-center justify-center relative">
                    {(collectorImages[currentSong.tokenId] || currentSong.imageUrl) ? (
                      <img src={collectorImages[currentSong.tokenId] || currentSong.imageUrl} alt={currentSong.title} className="w-full h-full object-cover" />
                    ) : (
                      <Music2 className="w-6 h-6 text-white" />
                    )}
                    {collectorImages[currentSong.tokenId] && (
                      <div className="absolute -top-1 -right-1 w-4 h-4 bg-amber-500 rounded-full flex items-center justify-center shadow-sm">
                        <Crown className="w-2.5 h-2.5 text-white" />
                      </div>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    {currentSong.artistUsername && (
                      <div className="text-cyan-400 text-xs truncate">@{currentSong.artistUsername}</div>
                    )}
                    <div className="flex items-center gap-2">
                      <div className="text-white text-sm font-semibold truncate">{currentSong.title}</div>
                      {currentSong.isPreview && (
                        <span className="text-[10px] px-1.5 py-0.5 bg-purple-500/30 text-purple-300 rounded-full flex-shrink-0">
                          3s PREVIEW
                        </span>
                      )}
                    </div>
                  </div>
                </>
              )}
            </div>

            {/* Player Controls */}
            <div className="flex-1 flex flex-col items-center gap-2">
              <div className="flex items-center gap-4">
                <button
                  onClick={handlePrevious}
                  disabled={currentSongIndex === 0}
                  className="text-gray-400 hover:text-white disabled:opacity-30 transition-colors"
                >
                  <SkipBack className="w-5 h-5" />
                </button>

                <button
                  onClick={handlePlayPause}
                  className="w-10 h-10 bg-cyan-500 hover:bg-cyan-400 rounded-full flex items-center justify-center transition-all"
                >
                  {isPlaying ? (
                    <Pause className="w-5 h-5 text-black" fill="currentColor" />
                  ) : (
                    <Play className="w-5 h-5 text-black ml-0.5" fill="currentColor" />
                  )}
                </button>

                <button
                  onClick={handleNext}
                  disabled={currentSongIndex === songs.length - 1}
                  className="text-gray-400 hover:text-white disabled:opacity-30 transition-colors"
                >
                  <SkipForward className="w-5 h-5" />
                </button>
              </div>

              {/* Progress Bar */}
              <div className="w-full max-w-md flex items-center gap-2">
                <span className="text-xs text-gray-400 w-10 text-right">{formatTime(currentTime)}</span>
                <input
                  type="range"
                  min="0"
                  max={duration || 0}
                  value={currentTime}
                  onChange={handleSeek}
                  className="flex-1 h-1 bg-gray-700 rounded-full appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:bg-cyan-500 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:cursor-pointer"
                />
                <span className="text-xs text-gray-400 w-10">{formatTime(duration)}</span>
              </div>
            </div>

            {/* Queue Button */}
            <div className="flex-shrink-0">
              <button
                onClick={() => setShowQueue(!showQueue)}
                className="px-4 py-2 text-sm text-gray-400 hover:text-white transition-colors whitespace-nowrap"
              >
                Queue ({songs.length})
              </button>
            </div>
          </div>
        </div>
        </div>
      </div>
    </div>
  );

  return createPortal(modalContent, document.body);
};

// Memoize to prevent unnecessary re-renders from parent
export const MusicPlaylist = memo(MusicPlaylistComponent, (prevProps, nextProps) => {
  // Custom comparison - only re-render if these actually change
  return (
    prevProps.userAddress === nextProps.userAddress &&
    prevProps.userFid === nextProps.userFid &&
    prevProps.isSubscriber === nextProps.isSubscriber &&
    prevProps.onClose === nextProps.onClose &&
    // Compare clickedNFTs by tokenId to avoid new array reference issues
    prevProps.clickedNFTs?.map(n => n.tokenId).join(',') ===
    nextProps.clickedNFTs?.map(n => n.tokenId).join(',')
  );
});
