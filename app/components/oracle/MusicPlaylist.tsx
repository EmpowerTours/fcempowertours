import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Play, Pause, SkipForward, SkipBack, Music2, GripVertical, ChevronUp, X } from 'lucide-react';

interface Song {
  id: string;
  tokenId: string;
  title: string;
  artist: string;
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
}

interface MusicPlaylistProps {
  userAddress?: string;
  userFid?: number;
  clickedNFTs?: NFTObject[];
  onPlayingChange?: (nftId: string | null, isPlaying: boolean) => void;
  onClose?: () => void;
}

export const MusicPlaylist: React.FC<MusicPlaylistProps> = ({ userAddress, userFid, clickedNFTs = [], onPlayingChange, onClose }) => {
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

  // Fetch user's purchased music NFTs
  useEffect(() => {
    if (!userAddress) {
      console.log('[MusicPlaylist] No userAddress, skipping fetch');
      return;
    }

    console.log('[MusicPlaylist] Fetching songs for address:', userAddress);

    const fetchPurchasedSongs = async () => {
      try {
        const response = await fetch(`/api/music/get-user-licenses?address=${userAddress}`);
        const data = await response.json();

        console.log('[MusicPlaylist] API response:', data);

        if (data.success) {
          console.log('[MusicPlaylist] Loaded', data.songs.length, 'owned songs');
          setOwnedSongs(data.songs);
        } else {
          console.error('[MusicPlaylist] API returned success:false', data);
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
      console.log('[MusicPlaylist] Processing', clickedNFTs.length, 'clicked NFTs');

      // Check if clickedNFTs actually changed (not just ownedSongs update)
      const currentClickedIds = clickedNFTs.map(n => n.tokenId).join(',');
      const clickedNFTsChanged = currentClickedIds !== clickedNFTsRef.current;

      // If no clicked NFTs, show owned songs (with saved order if available)
      if (clickedNFTs.length === 0) {
        clickedNFTsRef.current = '';
        if (ownedSongs.length > 0 && songs.length === 0 && playlistLoaded) {
          console.log('[MusicPlaylist] No clicked NFTs, setting songs to owned songs');

          // Apply saved playlist order if available
          if (savedPlaylistOrder && savedPlaylistOrder.length > 0) {
            const orderedSongs = [...ownedSongs].sort((a, b) => {
              const indexA = savedPlaylistOrder.indexOf(a.tokenId);
              const indexB = savedPlaylistOrder.indexOf(b.tokenId);
              // Songs not in saved order go to end
              if (indexA === -1) return 1;
              if (indexB === -1) return -1;
              return indexA - indexB;
            });
            console.log('[MusicPlaylist] Applied saved playlist order');
            setSongs(orderedSongs);
          } else {
            setSongs(ownedSongs);
          }
        }
        return;
      }

      const clickedSongs: Song[] = [];
      let lastClickedTokenId: string | null = null;

      for (const nft of clickedNFTs) {
        try {
          console.log('[MusicPlaylist] Processing NFT:', nft.name, nft.tokenId);

          // Check if user owns this NFT
          const isOwned = ownedSongs.some(s => s.tokenId === nft.tokenId);
          // Also check if we already added this as a clicked song
          const alreadyClicked = clickedSongs.some(s => s.tokenId === nft.tokenId);

          if (isOwned) {
            // User owns this NFT - add it to clickedSongs from ownedSongs
            console.log('[MusicPlaylist] User owns this NFT');
            const ownedSong = ownedSongs.find(s => s.tokenId === nft.tokenId);
            if (ownedSong && !alreadyClicked) {
              console.log('[MusicPlaylist] Adding owned song to clickedSongs:', ownedSong.title);
              clickedSongs.push(ownedSong);
              lastClickedTokenId = nft.tokenId;
            }
          } else if (!alreadyClicked) {
            // User doesn't own this - add as preview
            // Create a fallback preview song even if metadata fetch fails
            const fallbackSong: Song = {
              id: `preview-${nft.tokenId}`,
              tokenId: nft.tokenId,
              title: nft.name || `Music NFT #${nft.tokenId}`,
              artist: 'Unknown Artist',
              audioUrl: '', // Will try to fetch from metadata
              imageUrl: nft.imageUrl,
              isPreview: true,
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
                console.log('[MusicPlaylist] Fetching metadata from:', metadataUrl);
                const metadataRes = await fetch(metadataUrl);

                if (metadataRes.ok) {
                  const metadata = await metadataRes.json();
                  console.log('[MusicPlaylist] Metadata:', metadata);
                  const audioUrl = resolveIPFS(metadata.animation_url || metadata.audio_url || '');

                  if (audioUrl) {
                    fallbackSong.audioUrl = audioUrl;
                    fallbackSong.title = metadata.name || fallbackSong.title;
                    fallbackSong.artist = metadata.artist || metadata.properties?.artist || 'Unknown Artist';
                  } else {
                    console.warn('[MusicPlaylist] No audio URL found in metadata');
                  }
                } else {
                  console.warn('[MusicPlaylist] Metadata fetch failed:', metadataRes.status);
                }
              } catch (err) {
                console.error(`[MusicPlaylist] Failed to fetch metadata for NFT ${nft.tokenId}:`, err);
              }
            }

            // Add song even if audio URL is empty (will show in queue but can't play)
            console.log('[MusicPlaylist] Adding preview song:', fallbackSong.title);
            clickedSongs.push(fallbackSong);
            lastClickedTokenId = nft.tokenId;
          }
        } catch (error) {
          console.error('[MusicPlaylist] Failed to process clicked NFT:', error);
        }
      }

      // clickedSongs already contains the correct songs (owned or preview)
      console.log('[MusicPlaylist] Setting songs to clicked NFTs:', clickedSongs.length, 'songs');
      setSongs(clickedSongs);

      // Only auto-play if clickedNFTs actually changed AND we haven't already auto-played this token
      const shouldAutoPlay = clickedNFTsChanged &&
                             lastClickedTokenId &&
                             lastClickedTokenId !== lastAutoPlayedTokenIdRef.current;

      if (shouldAutoPlay && lastClickedTokenId && clickedSongs.length > 0) {
        const newSongIndex = clickedSongs.findIndex(s => s.tokenId === lastClickedTokenId);
        if (newSongIndex !== -1) {
          console.log('[MusicPlaylist] Auto-playing clicked song at index:', newSongIndex);
          setCurrentSongIndex(newSongIndex);
          setIsPlaying(true);
          lastAutoPlayedTokenIdRef.current = lastClickedTokenId;
        } else {
          console.warn('[MusicPlaylist] Could not find lastClickedTokenId in songs');
        }
      } else if (!shouldAutoPlay && lastClickedTokenId) {
        console.log('[MusicPlaylist] Skipping auto-play (already played or no change)');
      }

      // Update the ref to track current clicked NFTs
      clickedNFTsRef.current = currentClickedIds;
    };

    if ((clickedNFTs.length > 0 || ownedSongs.length > 0) && playlistLoaded) {
      processClickedNFTs();
    }
  }, [clickedNFTs, ownedSongs, playlistLoaded, savedPlaylistOrder]);

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
      console.warn('[MusicPlaylist] No audio URL for current song');
      setIsPlaying(false);
      return;
    }

    // Reset to beginning when song changes
    audio.currentTime = 0;
    setCurrentTime(0);

    if (isPlaying) {
      console.log('[MusicPlaylist] Playing:', currentSong.title);
      audio.play().catch(err => {
        console.error('[MusicPlaylist] Play failed:', err);
        setIsPlaying(false);
      });
    } else {
      audio.pause();
    }
  }, [isPlaying, currentSongIndex, songs]);

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
      if (currentSongIndex < songs.length - 1) {
        setCurrentSongIndex(prev => prev + 1);
        setIsPlaying(true);
      } else {
        setIsPlaying(false);
      }
    };

    const handleError = (e: Event) => {
      console.error('[MusicPlaylist] Audio error:', e);
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
  }, [currentSongIndex, songs]);

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
  if (songs.length === 0) {
    console.log('[MusicPlaylist] Not rendering:', {
      userAddress,
      songsLength: songs.length,
      ownedSongsLength: ownedSongs.length,
      clickedNFTsLength: clickedNFTs.length
    });
    return null;
  }

  console.log('[MusicPlaylist] Rendering player with', songs.length, 'songs');

  const currentSong = songs[currentSongIndex];

  return (
    <>
      {/* Audio element */}
      <audio
        ref={audioRef}
        src={currentSong?.audioUrl}
      />

      {/* Queue Panel */}
      {showQueue && (
        <div className="fixed bottom-24 left-0 right-0 max-w-2xl mx-auto px-4 z-[110]">
          <div className="bg-black/95 backdrop-blur-xl border border-cyan-500/20 rounded-2xl p-4 max-h-96 overflow-y-auto">
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
                  <div className="w-10 h-10 bg-gradient-to-br from-cyan-500/20 to-purple-600/20 rounded flex items-center justify-center overflow-hidden flex-shrink-0">
                    {song.imageUrl ? (
                      <img src={song.imageUrl} alt={song.title} className="w-full h-full object-cover" />
                    ) : (
                      <Music2 className="w-5 h-5 text-cyan-400" />
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
      <div className="w-full bg-black/95 backdrop-blur-xl border-4 border-cyan-500 rounded-2xl shadow-2xl shadow-cyan-500/50">
        {/* Close Button - Inside Player */}
        {onClose && (
          <div className="flex justify-between items-center px-4 pt-3 pb-2 border-b border-gray-800">
            <div className="flex items-center gap-2">
              <Music2 className="w-5 h-5 text-cyan-400" />
              <span className="text-sm font-mono text-cyan-400 tracking-widest">MUSIC PLAYER</span>
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
              {/* Song title */}
              <div className="flex-1 min-w-0">
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
                  <div className="w-12 h-12 bg-gradient-to-br from-cyan-500 to-purple-600 rounded-lg overflow-hidden flex items-center justify-center">
                    {currentSong.imageUrl ? (
                      <img src={currentSong.imageUrl} alt={currentSong.title} className="w-full h-full object-cover" />
                    ) : (
                      <Music2 className="w-6 h-6 text-white" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <div className="text-white text-sm font-semibold truncate">{currentSong.title}</div>
                      {currentSong.isPreview && (
                        <span className="text-[10px] px-1.5 py-0.5 bg-purple-500/30 text-purple-300 rounded-full flex-shrink-0">
                          3s PREVIEW
                        </span>
                      )}
                    </div>
                    <div className="text-gray-400 text-xs truncate">{currentSong.artist}</div>
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
    </>
  );
};
