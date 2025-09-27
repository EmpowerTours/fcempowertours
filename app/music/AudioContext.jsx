"use client";
import React, { createContext, useContext, useState, useRef, useEffect } from "react";
const AudioContext = createContext();
export function AudioProvider({ children }) {
  const [currentTrack, setCurrentTrack] = useState(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const audioRef = useRef(null);
  useEffect(() => {
    if (audioRef.current && currentTrack) {
      audioRef.current.src = currentTrack.url;
      if (isPlaying) {
        audioRef.current.play().catch(err => console.error("Audio play failed:", err));
      } else {
        audioRef.current.pause();
      }
    }
    const currentAudio = audioRef.current;  // Copy ref to local var for stable cleanup
    return () => {
      if (currentAudio) currentAudio.pause();
    };
  }, [currentTrack, isPlaying]);  // Removed audioRef from deps (it's stable now via local copy)
  return (
    <AudioContext.Provider value={{ currentTrack, setCurrentTrack, isPlaying, setIsPlaying, audioRef }}>
      {children}
    </AudioContext.Provider>
  );
}
export function useAudio() {
  return useContext(AudioContext);
}
