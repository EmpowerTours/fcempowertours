import React, { useState, useEffect, useRef } from 'react';
import { Play, Pause, SkipForward, SkipBack, Music2, GripVertical, ChevronUp } from 'lucide-react';

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
  clickedNFTs?: NFTObject[];
}

export const MusicPlaylist: React.FC<MusicPlaylistProps> = ({ userAddress, clickedNFTs = [] }) => {
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
        console.error('Failed to fetch songs:', error);
      }
    };

    fetchPurchasedSongs();
  }, [userAddress]);

  // Process clicked NFTs and merge with owned songs
  useEffect(() => {
    const processClickedNFTs = async () => {
      const clickedSongs: Song[] = [];

      for (const nft of clickedNFTs) {
        try {
          // Check if user owns this NFT
          const isOwned = ownedSongs.some(s => s.tokenId === nft.tokenId);

          if (!isOwned && nft.tokenURI) {
            // User doesn't own this - add as preview
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
                const audioUrl = resolveIPFS(metadata.animation_url || '');

                if (audioUrl) {
                  clickedSongs.push({
                    id: `preview-${nft.tokenId}`,
                    tokenId: nft.tokenId,
                    title: metadata.name || nft.name,
                    artist: metadata.artist || 'Unknown Artist',
                    audioUrl,
                    imageUrl: nft.imageUrl,
                    isPreview: true,
                    contractAddress: nft.contractAddress,
                  });
                }
              }
            } catch (err) {
              console.error(`Failed to fetch metadata for NFT ${nft.tokenId}:`, err);
            }
          } else if (isOwned) {
            // User owns this NFT - find it in the queue and jump to it
            const ownedIndex = ownedSongs.findIndex(s => s.tokenId === nft.tokenId);
            if (ownedIndex !== -1) {
              setCurrentSongIndex(ownedIndex);
              setIsPlaying(true);
            }
          }
        } catch (error) {
          console.error('Failed to process clicked NFT:', error);
        }
      }

      // Merge owned songs with clicked preview songs
      setSongs([...ownedSongs, ...clickedSongs]);
    };

    processClickedNFTs();
  }, [clickedNFTs, ownedSongs]);

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
        // Auto-skip to next song after preview ends
        if (currentSongIndex < songs.length - 1) {
          setTimeout(() => {
            setCurrentSongIndex(prev => prev + 1);
            setIsPlaying(true);
          }, 1000);
        }
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

    audio.addEventListener('timeupdate', handleTimeUpdate);
    audio.addEventListener('loadedmetadata', handleLoadedMetadata);
    audio.addEventListener('ended', handleEnded);

    return () => {
      audio.removeEventListener('timeupdate', handleTimeUpdate);
      audio.removeEventListener('loadedmetadata', handleLoadedMetadata);
      audio.removeEventListener('ended', handleEnded);
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
  };

  const formatTime = (seconds: number) => {
    if (isNaN(seconds)) return '0:00';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  if (!userAddress || songs.length === 0) {
    console.log('[MusicPlaylist] Not rendering:', { userAddress, songsLength: songs.length, ownedSongsLength: ownedSongs.length });
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
        autoPlay={isPlaying}
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

      {/* Player Bar */}
      <div className="fixed bottom-0 left-0 right-0 z-[100] bg-black/95 backdrop-blur-xl border-t border-cyan-500/20">
        <div className="max-w-7xl mx-auto px-4 py-3">
          <div className="flex items-center gap-4">
            {/* Current Song Info */}
            <div className="flex items-center gap-3 w-64 flex-shrink-0">
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
                className="px-4 py-2 text-sm text-gray-400 hover:text-white transition-colors"
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
