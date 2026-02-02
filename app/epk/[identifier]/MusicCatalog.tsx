'use client';

import { useState, useRef } from 'react';
import { Play, Pause, Music } from 'lucide-react';
import type { SongStats } from '@/lib/epk/types';

interface MusicCatalogProps {
  songs: SongStats[];
}

export default function MusicCatalog({ songs }: MusicCatalogProps) {
  const [playingId, setPlayingId] = useState<number | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const handlePlay = (song: SongStats) => {
    if (playingId === song.tokenId) {
      // Pause current
      audioRef.current?.pause();
      setPlayingId(null);
      return;
    }

    // Stop previous
    if (audioRef.current) {
      audioRef.current.pause();
    }

    if (!song.audioUrl) return;

    // Resolve IPFS URLs
    let audioSrc = song.audioUrl;
    if (audioSrc.startsWith('ipfs://')) {
      const gateway = process.env.NEXT_PUBLIC_PINATA_GATEWAY || 'harlequin-used-hare-224.mypinata.cloud';
      audioSrc = `https://${gateway}/ipfs/${audioSrc.replace('ipfs://', '')}`;
    }

    const audio = new Audio(audioSrc);
    audio.onended = () => setPlayingId(null);
    audio.play().catch(() => setPlayingId(null));
    audioRef.current = audio;
    setPlayingId(song.tokenId);
  };

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {songs.map((song) => {
        const isPlaying = playingId === song.tokenId;

        // Resolve cover image
        let coverSrc = song.coverImage || '';
        if (coverSrc.startsWith('ipfs://')) {
          const gateway = process.env.NEXT_PUBLIC_PINATA_GATEWAY || 'harlequin-used-hare-224.mypinata.cloud';
          coverSrc = `https://${gateway}/ipfs/${coverSrc.replace('ipfs://', '')}`;
        }

        return (
          <div
            key={song.tokenId}
            className="bg-[#1e293b] rounded-xl border border-white/5 overflow-hidden group"
          >
            {/* Cover */}
            <div className="relative aspect-square bg-[#0f172a]">
              {coverSrc ? (
                <img
                  src={coverSrc}
                  alt={song.title}
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center">
                  <Music className="w-12 h-12 text-slate-600" />
                </div>
              )}

              {/* Play overlay */}
              {song.audioUrl && (
                <button
                  onClick={() => handlePlay(song)}
                  className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  <div className="w-14 h-14 bg-purple-600 rounded-full flex items-center justify-center">
                    {isPlaying ? (
                      <Pause className="w-6 h-6 text-white" />
                    ) : (
                      <Play className="w-6 h-6 text-white ml-1" />
                    )}
                  </div>
                </button>
              )}

              {isPlaying && (
                <div className="absolute bottom-2 left-2 flex items-center gap-1 bg-purple-600 rounded-full px-2 py-1">
                  <div className="flex gap-0.5 items-end h-3">
                    <div className="w-0.5 bg-white rounded-full animate-pulse" style={{ height: '8px', animationDelay: '0ms' }} />
                    <div className="w-0.5 bg-white rounded-full animate-pulse" style={{ height: '12px', animationDelay: '150ms' }} />
                    <div className="w-0.5 bg-white rounded-full animate-pulse" style={{ height: '6px', animationDelay: '300ms' }} />
                  </div>
                  <span className="text-xs text-white ml-1">Playing</span>
                </div>
              )}
            </div>

            {/* Info */}
            <div className="p-4">
              <h3 className="text-white font-medium truncate">{song.title}</h3>
              <div className="flex items-center justify-between mt-2 text-xs text-slate-400">
                <span>{song.plays.toLocaleString()} plays</span>
                <span>{song.sales} sales</span>
                <span className="text-purple-400">#{song.tokenId}</span>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
