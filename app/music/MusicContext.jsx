"use client";
import React, { createContext, useContext, useState } from "react";
const MusicContext = createContext();
export function MusicProvider({ children }) {
  const [shortSong, setShortSong] = useState('');
  const [fullSongIPFS, setFullSongIPFS] = useState('');
  const [coverArtIPFS, setCoverArtIPFS] = useState('');
  const [tokenId, setTokenId] = useState(null);
  const [playlist, setPlaylist] = useState([]);
  const [status, setStatus] = useState('');
  const value = {
    shortSong, setShortSong,
    fullSongIPFS, setFullSongIPFS,
    coverArtIPFS, setCoverArtIPFS,
    tokenId, setTokenId,
    playlist, setPlaylist,
    status, setStatus
  };
  return <MusicContext.Provider value={value}>{children}</MusicContext.Provider>;
}
export function useMusic() {
  return useContext(MusicContext);
}
