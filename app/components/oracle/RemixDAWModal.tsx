'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import {
  X, Music2, Play, Pause, Square, Download, Loader2, Wand2,
  Volume2, VolumeX, Sliders, Mic, Drum, Guitar, Piano,
  Zap, RefreshCw, ExternalLink, ChevronDown, Check,
  SkipBack, SkipForward, Shuffle
} from 'lucide-react';
import { useWalletContext } from '@/app/hooks/useWalletContext';


// ── Types ──────────────────────────────────────────────────────────────────

interface NFTObject {
  id: string;
  type: 'ART' | 'MUSIC' | 'EXPERIENCE';
  tokenId: string;
  name: string;
  imageUrl: string;
  price: string;
  contractAddress: string;
  tokenURI?: string;
  audioUrl?: string;
}

interface StemTrack {
  name: string;
  label: string;
  icon: React.ReactNode;
  color: string;
  url: string;
  buffer: AudioBuffer | null;
  gain: number;         // 0.0 – 2.0
  muted: boolean;
  soloed: boolean;
  sourceNode: AudioBufferSourceNode | null;
}

interface RemixDAWModalProps {
  onClose: () => void;
  isDarkMode?: boolean;
  walletAddress?: string;
  userFid?: number | null;
}

const GENRES = [
  { key: 'country',     label: 'Country',     emoji: '🤠', color: '#c2853e' },
  { key: 'edm',        label: 'EDM',         emoji: '🎛️', color: '#00d4ff' },
  { key: 'death_metal', label: 'Death Metal', emoji: '🤘', color: '#8b0000' },
  { key: 'jazz',        label: 'Jazz',        emoji: '🎷', color: '#c9a843' },
  { key: 'hip_hop',     label: 'Hip-Hop',     emoji: '🎤', color: '#7c3aed' },
  { key: 'pop',         label: 'Pop',         emoji: '🌟', color: '#ec4899' },
  { key: 'reggae',      label: 'Reggae',      emoji: '🌿', color: '#22c55e' },
  { key: 'classical',   label: 'Classical',   emoji: '🎻', color: '#a78bfa' },
] as const;

type GenreKey = typeof GENRES[number]['key'];

type DawMode = 'remix' | 'genre' | 'vocal' | 'freestyle';

const WMON_ADDRESS = (process.env.NEXT_PUBLIC_WMON || '0x760AfE86e5de5fa0Ee542fc7B7B713e1c5425701') as `0x${string}`;
const REMIX_DAW_ADDRESS = (process.env.NEXT_PUBLIC_REMIX_DAW || '0x6E0B20564f0114fF72268d443538b185430414EA') as `0x${string}`;
const STUDIO_PAYMENTS_ADDRESS = (process.env.NEXT_PUBLIC_STUDIO_PAYMENTS || '0x770A44Cc793c4bDC06D68D3E608742A794D85E1C') as `0x${string}`;

// Action enum matches EmpowerStudioPayments.sol
const STUDIO_ACTION = { StemSeparation: 0, GenreTransform: 1, VocalSynth: 2, Freestyle: 3 } as const;
const STUDIO_PRICES: Record<number, { wmon: string; label: string }> = {
  0: { wmon: '0.15', label: '0.15 WMON' },
  1: { wmon: '0.25', label: '0.25 WMON' },
  2: { wmon: '0.20', label: '0.20 WMON' },
  3: { wmon: '0.30', label: '0.30 WMON' },
};


// ── Component ─────────────────────────────────────────────────────────────

export const RemixDAWModal: React.FC<RemixDAWModalProps> = ({
  onClose,
  isDarkMode = true,
}) => {
  const { walletAddress } = useWalletContext();
  const [mounted, setMounted] = useState(false);

  // Mode: 'remix' = manual DAW, 'genre' = AI genre transform
  const [mode, setMode] = useState<DawMode>('remix');

  // NFT Selection
  const [ownedNFTs, setOwnedNFTs] = useState<NFTObject[]>([]);
  const [loadingNFTs, setLoadingNFTs] = useState(true);
  const [selectedNFT, setSelectedNFT] = useState<NFTObject | null>(null);

  // Stem separation state
  const [separating, setSeparating] = useState(false);
  const [jobId, setJobId] = useState<string | null>(null);
  const [stems, setStems] = useState<StemTrack[]>([]);
  const [separateError, setSeparateError] = useState<string | null>(null);

  // Playback
  const audioCtxRef = useRef<AudioContext | null>(null);
  const masterGainRef = useRef<GainNode | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [masterVolume, setMasterVolume] = useState(0.8);
  const playbackStartRef = useRef<number>(0);
  const playbackOffsetRef = useRef<number>(0);
  const rafRef = useRef<number>(0);
  const [playheadSec, setPlayheadSec] = useState(0);
  const [durationSec, setDurationSec] = useState(0);

  // Waveform canvases
  const canvasRefs = useRef<(HTMLCanvasElement | null)[]>([]);

  // Effects per stem (distortion %, reverb %)
  const [stemEffects, setStemEffects] = useState<Record<string, { distortion: number; reverb: number }>>({});

  // Export / mint
  const [exporting, setExporting] = useState(false);
  const [exportedUrl, setExportedUrl] = useState<string | null>(null);
  const [mintPrice, setMintPrice] = useState('1');
  const [minting, setMinting] = useState(false);
  const [mintTxHash, setMintTxHash] = useState<string | null>(null);
  const [mintError, setMintError] = useState<string | null>(null);

  // Genre transform state
  const [selectedGenre, setSelectedGenre] = useState<GenreKey>('edm');
  const [vocalGain, setVocalGain] = useState(1.0);
  const [instrumentalGain, setInstrumentalGain] = useState(1.0);
  const [genreTransforming, setGenreTransforming] = useState(false);
  const [genreResult, setGenreResult] = useState<{ ipfsUrl: string; gatewayUrl: string; genre: string } | null>(null);
  const [genreError, setGenreError] = useState<string | null>(null);

  // Vocal Writer state
  const [lyrics, setLyrics] = useState('');
  const [beatsPerLine, setBeatsPerLine] = useState(4);
  const [introBeats, setIntroBeats] = useState(4);
  const [cloneVoice, setCloneVoice] = useState(true);
  const [vocalSynthGain, setVocalSynthGain] = useState(1.0);
  const [mixWithInstrumental, setMixWithInstrumental] = useState(true);
  const [instrumentalGainVS, setInstrumentalGainVS] = useState(0.85);
  const [vocalSynthing, setVocalSynthing] = useState(false);
  const [vocalSynthResult, setVocalSynthResult] = useState<{
    ipfsUrl: string; gatewayUrl: string; detectedBpm: number; lineCount: number; durationSeconds: number;
  } | null>(null);
  const [vocalSynthError, setVocalSynthError] = useState<string | null>(null);
  // Preview audio element for vocal synth result
  const vocalPreviewRef = useRef<HTMLAudioElement | null>(null);
  const [vocalPreviewPlaying, setVocalPreviewPlaying] = useState(false);

  // Freestyle Mode state
  const [freestyleTheme, setFreestyleTheme] = useState('');
  const [freestyleGenreHint, setFreestyleGenreHint] = useState('hip_hop');
  const [freestyleMaxBars, setFreestyleMaxBars] = useState(16);
  const [freestyleBeatsPerBar, setFreestyleBeatsPerBar] = useState(4);
  const [freestyleIntroBeats, setFreestyleIntroBeats] = useState(4);
  const [freestyleCloneVoice, setFreestyleCloneVoice] = useState(true);
  const [freestyling, setFreestyling] = useState(false);
  const [freestyleBars, setFreestyleBars] = useState<{ bar: number; line: string; timeOffset: number }[]>([]);
  const [freestyleBpm, setFreestyleBpm] = useState<number | null>(null);
  const [freestyleBarDuration, setFreestyleBarDuration] = useState<number | null>(null);
  const [freestyleDone, setFreestyleDone] = useState(false);
  const [freestyleError, setFreestyleError] = useState<string | null>(null);
  // AudioContext for scheduling freestyle bars precisely on the beat
  const freestyleCtxRef = useRef<AudioContext | null>(null);
  const freestyleStartTimeRef = useRef<number>(0); // ctx.currentTime when first bar should play
  const freestyleAbortRef = useRef<AbortController | null>(null);

  // Payment state
  const [paymentProcessing, setPaymentProcessing] = useState(false);
  const [paymentError, setPaymentError] = useState<string | null>(null);

  // Shared payment callback — routes through UserSafe via execute-delegated API
  const payForAction = useCallback(async (actionType: number): Promise<boolean> => {
    if (!walletAddress) {
      setPaymentError('Connect your wallet to use AI features.');
      return false;
    }
    const priceInfo = STUDIO_PRICES[actionType];
    if (!priceInfo) return false;

    setPaymentProcessing(true);
    setPaymentError(null);

    try {
      const res = await fetch('/api/execute-delegated', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userAddress: walletAddress,
          action: 'studio_pay',
          params: { actionType },
        }),
      });

      const data = await res.json();
      if (!data.success) {
        throw new Error(data.error || 'Payment failed');
      }

      console.log(`[RemixDAW] Payment confirmed: ${data.message} (TX: ${data.txHash})`);
      return true;
    } catch (err: any) {
      if (err?.message?.includes('Insufficient balance')) {
        setPaymentError(err.message);
      } else {
        setPaymentError(err?.message || 'Payment failed. Please try again.');
      }
      return false;
    } finally {
      setPaymentProcessing(false);
    }
  }, [walletAddress]);

  useEffect(() => {
    setMounted(true);
    return () => {
      stopPlayback();
      audioCtxRef.current?.close();
    };
  }, []);

  // ── Fetch user's owned Music NFTs ──────────────────────────────────────
  useEffect(() => {
    const fetchNFTs = async () => {
      try {
        const res = await fetch('/api/envio/get-nfts');
        const data = await res.json();
        if (data.success) {
          const musicNFTs = data.nfts.filter((n: NFTObject) => n.type === 'MUSIC');
          setOwnedNFTs(musicNFTs);
        }
      } catch (e) {
        console.error('[RemixDAW] Failed to fetch NFTs:', e);
      } finally {
        setLoadingNFTs(false);
      }
    };
    fetchNFTs();
  }, []);

  // ── Audio Context init ────────────────────────────────────────────────
  const getAudioCtx = useCallback(() => {
    if (!audioCtxRef.current) {
      audioCtxRef.current = new AudioContext();
      masterGainRef.current = audioCtxRef.current.createGain();
      masterGainRef.current.gain.value = masterVolume;
      masterGainRef.current.connect(audioCtxRef.current.destination);
    }
    return audioCtxRef.current;
  }, [masterVolume]);

  // ── Fetch and decode audio buffer ────────────────────────────────────
  const fetchBuffer = useCallback(async (url: string): Promise<AudioBuffer> => {
    const ctx = getAudioCtx();
    const res = await fetch(url);
    const ab = await res.arrayBuffer();
    return ctx.decodeAudioData(ab);
  }, [getAudioCtx]);

  // ── Draw waveform on canvas ───────────────────────────────────────────
  const drawWaveform = useCallback((canvas: HTMLCanvasElement, buffer: AudioBuffer, color: string) => {
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const { width, height } = canvas;
    ctx.clearRect(0, 0, width, height);

    const data = buffer.getChannelData(0);
    const step = Math.floor(data.length / width);
    const mid = height / 2;

    ctx.strokeStyle = color;
    ctx.lineWidth = 1;
    ctx.beginPath();

    for (let x = 0; x < width; x++) {
      let min = 1, max = -1;
      for (let i = 0; i < step; i++) {
        const v = data[x * step + i] || 0;
        if (v < min) min = v;
        if (v > max) max = v;
      }
      ctx.moveTo(x, mid + min * mid * 0.9);
      ctx.lineTo(x, mid + max * mid * 0.9);
    }
    ctx.stroke();
  }, []);

  // ── Stem Separation ───────────────────────────────────────────────────
  const handleSeparate = useCallback(async () => {
    if (!selectedNFT) return;

    // Payment gate
    const paid = await payForAction(STUDIO_ACTION.StemSeparation);
    if (!paid) return;

    // Resolve audio URL from tokenURI metadata
    let audioUrl = selectedNFT.audioUrl;
    if (!audioUrl && selectedNFT.tokenURI) {
      try {
        const metaUrl = selectedNFT.tokenURI.startsWith('ipfs://')
          ? selectedNFT.tokenURI.replace('ipfs://', 'https://gateway.pinata.cloud/ipfs/')
          : selectedNFT.tokenURI;
        const meta = await fetch(metaUrl).then(r => r.json());
        audioUrl = meta.animation_url || meta.audio_url || meta.audio;
        if (audioUrl?.startsWith('ipfs://')) {
          audioUrl = audioUrl.replace('ipfs://', 'https://gateway.pinata.cloud/ipfs/');
        }
      } catch (e) {
        console.error('[RemixDAW] metadata fetch failed:', e);
      }
    }

    if (!audioUrl) {
      setSeparateError('Could not resolve audio URL from this NFT');
      return;
    }

    setSeparating(true);
    setSeparateError(null);
    setStems([]);
    setExportedUrl(null);
    setMintTxHash(null);

    try {
      const res = await fetch('/api/remix-daw/separate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ audioUrl, tokenId: selectedNFT.tokenId }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Separation failed');
      }

      const data = await res.json();
      setJobId(data.jobId);
      setDurationSec(data.durationSeconds || 0);

      const STEM_META: Record<string, { label: string; icon: React.ReactNode; color: string }> = {
        drums:  { label: 'Drums',   icon: <Drum className="w-3.5 h-3.5" />,   color: '#f87171' },
        bass:   { label: 'Bass',    icon: <Music2 className="w-3.5 h-3.5" />, color: '#fb923c' },
        vocals: { label: 'Vocals',  icon: <Mic className="w-3.5 h-3.5" />,   color: '#34d399' },
        guitar: { label: 'Guitar',  icon: <Guitar className="w-3.5 h-3.5" />, color: '#60a5fa' },
        piano:  { label: 'Piano',   icon: <Piano className="w-3.5 h-3.5" />,  color: '#c084fc' },
        other:  { label: 'Other',   icon: <Sliders className="w-3.5 h-3.5" />, color: '#f472b6' },
      };

      const newStems: StemTrack[] = Object.entries(data.stems).map(([name, url]) => ({
        name,
        label: STEM_META[name]?.label || name,
        icon: STEM_META[name]?.icon || <Music2 className="w-3.5 h-3.5" />,
        color: STEM_META[name]?.color || '#9ca3af',
        url: url as string,
        buffer: null,
        gain: 1.0,
        muted: false,
        soloed: false,
        sourceNode: null,
      }));

      setStems(newStems);

      // Default effects
      const effects: Record<string, { distortion: number; reverb: number }> = {};
      newStems.forEach(s => { effects[s.name] = { distortion: 0, reverb: 0 }; });
      setStemEffects(effects);

      // Load and decode all buffers
      const ctx = getAudioCtx();
      const loaded = await Promise.all(
        newStems.map(async (stem, i) => {
          const buffer = await fetchBuffer(stem.url);
          // Draw waveform
          setTimeout(() => {
            const canvas = canvasRefs.current[i];
            if (canvas) drawWaveform(canvas, buffer, stem.color);
          }, 100);
          return { ...stem, buffer };
        })
      );
      setStems(loaded);

      // Calculate actual duration from loaded buffers (more accurate than backend estimate)
      const maxBufDuration = Math.max(...loaded.map(s => s.buffer ? s.buffer.duration : 0));
      if (maxBufDuration > 0) setDurationSec(maxBufDuration);
    } catch (err: any) {
      setSeparateError(err.message || 'Stem separation failed');
    } finally {
      setSeparating(false);
    }
  }, [selectedNFT, getAudioCtx, fetchBuffer, drawWaveform, payForAction]);

  // ── Playback ─────────────────────────────────────────────────────────
  const stopPlayback = useCallback(() => {
    setStems(prev => prev.map(s => {
      s.sourceNode?.stop();
      return { ...s, sourceNode: null };
    }));
    cancelAnimationFrame(rafRef.current);
    setIsPlaying(false);
  }, []);

  const startPlayback = useCallback(() => {
    const ctx = getAudioCtx();
    if (ctx.state === 'suspended') ctx.resume();

    const offset = playbackOffsetRef.current;
    playbackStartRef.current = ctx.currentTime - offset;

    const anySoloed = stems.some(s => s.soloed);

    const updatedStems = stems.map(stem => {
      if (!stem.buffer) return stem;
      if (stem.muted || (anySoloed && !stem.soloed)) return stem;

      const source = ctx.createBufferSource();
      source.buffer = stem.buffer;

      const gainNode = ctx.createGain();
      gainNode.gain.value = stem.gain;

      source.connect(gainNode);
      gainNode.connect(masterGainRef.current!);
      source.start(0, offset);

      return { ...stem, sourceNode: source };
    });

    setStems(updatedStems);
    setIsPlaying(true);

    const tick = () => {
      const elapsed = ctx.currentTime - playbackStartRef.current;
      setPlayheadSec(elapsed);
      if (elapsed < durationSec) {
        rafRef.current = requestAnimationFrame(tick);
      } else {
        playbackOffsetRef.current = 0;
        setIsPlaying(false);
        setPlayheadSec(0);
      }
    };
    rafRef.current = requestAnimationFrame(tick);
  }, [stems, durationSec, getAudioCtx]);

  const togglePlay = useCallback(() => {
    if (isPlaying) {
      playbackOffsetRef.current = audioCtxRef.current
        ? audioCtxRef.current.currentTime - playbackStartRef.current
        : 0;
      stopPlayback();
    } else {
      startPlayback();
    }
  }, [isPlaying, stopPlayback, startPlayback]);

  const handleStop = useCallback(() => {
    stopPlayback();
    playbackOffsetRef.current = 0;
    setPlayheadSec(0);
  }, [stopPlayback]);

  // ── Stem controls ─────────────────────────────────────────────────────
  const updateStemGain = useCallback((name: string, gain: number) => {
    setStems(prev => prev.map(s => {
      if (s.name !== name) return s;
      s.sourceNode?.context && (s.sourceNode as any).gainNode?.gain.setTargetAtTime(gain, s.sourceNode.context.currentTime, 0.01);
      return { ...s, gain };
    }));
  }, []);

  const toggleMute = useCallback((name: string) => {
    setStems(prev => prev.map(s => s.name === name ? { ...s, muted: !s.muted } : s));
  }, []);

  const toggleSolo = useCallback((name: string) => {
    setStems(prev => prev.map(s => s.name === name ? { ...s, soloed: !s.soloed } : s));
  }, []);

  // ── Export ───────────────────────────────────────────────────────────
  const handleExport = useCallback(async () => {
    if (!jobId) return;
    setExporting(true);
    setExportedUrl(null);

    const volumes: Record<string, number> = {};
    stems.forEach(s => { volumes[s.name] = s.muted ? 0 : s.gain; });

    try {
      const res = await fetch('/api/remix-daw/export', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jobId, volumes }),
      });
      if (!res.ok) throw new Error((await res.json()).error || 'Export failed');
      const data = await res.json();
      setExportedUrl(data.gatewayUrl);
    } catch (err: any) {
      setMintError(err.message || 'Export failed');
    } finally {
      setExporting(false);
    }
  }, [jobId, stems]);

  // ── Mint Remix NFT ────────────────────────────────────────────────────
  const handleMint = useCallback(async () => {
    if (!exportedUrl || !selectedNFT || !walletAddress) return;
    if (!REMIX_DAW_ADDRESS) {
      setMintError('EmpowerStudio contract not deployed yet — add address to complete minting.');
      return;
    }
    setMinting(true);
    setMintError(null);
    setMintTxHash(null);

    try {
      // Build metadata JSON and pin to IPFS
      const metadata = {
        name: `Remix of ${selectedNFT.name}`,
        description: `AI remix created in EmpowerStudio`,
        image: selectedNFT.imageUrl,
        animation_url: exportedUrl,
        attributes: [
          { trait_type: 'Original NFT', value: `#${selectedNFT.tokenId}` },
          { trait_type: 'Remixer', value: walletAddress },
        ],
      };
      const metaBlob = new Blob([JSON.stringify(metadata)], { type: 'application/json' });
      const formData = new FormData();
      formData.append('file', metaBlob, 'remix-metadata.json');

      const pinRes = await fetch('https://api.pinata.cloud/pinning/pinFileToIPFS', {
        method: 'POST',
        headers: { Authorization: `Bearer ${process.env.NEXT_PUBLIC_PINATA_JWT || ''}` },
        body: formData,
      });
      const pinData = await pinRes.json();
      const tokenURI = `ipfs://${pinData.IpfsHash}`;

      // Mint via UserSafe (approve + startSession + mintRemix batched)
      const res = await fetch('/api/execute-delegated', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userAddress: walletAddress,
          action: 'studio_mint_remix',
          params: {
            originalTokenId: selectedNFT.tokenId,
            tokenURI,
            priceMon: mintPrice,
          },
        }),
      });

      const data = await res.json();
      if (!data.success) {
        throw new Error(data.error || 'Mint failed');
      }

      console.log(`[RemixDAW] Mint confirmed: ${data.message} (TX: ${data.txHash})`);
      setMintTxHash(data.txHash || 'confirmed');
    } catch (err: any) {
      setMintError(err.message || 'Mint failed');
    } finally {
      setMinting(false);
    }
  }, [exportedUrl, selectedNFT, walletAddress, mintPrice]);

  // ── Genre Transform ───────────────────────────────────────────────────
  const handleGenreTransform = useCallback(async () => {
    if (!selectedNFT) return;

    // Payment gate
    const paid = await payForAction(STUDIO_ACTION.GenreTransform);
    if (!paid) return;

    let audioUrl = selectedNFT.audioUrl;
    if (!audioUrl && selectedNFT.tokenURI) {
      try {
        const metaUrl = selectedNFT.tokenURI.startsWith('ipfs://')
          ? selectedNFT.tokenURI.replace('ipfs://', 'https://gateway.pinata.cloud/ipfs/')
          : selectedNFT.tokenURI;
        const meta = await fetch(metaUrl).then(r => r.json());
        audioUrl = meta.animation_url || meta.audio_url || meta.audio;
        if (audioUrl?.startsWith('ipfs://')) {
          audioUrl = audioUrl.replace('ipfs://', 'https://gateway.pinata.cloud/ipfs/');
        }
      } catch (e) {
        console.error('[RemixDAW] metadata fetch failed:', e);
      }
    }

    if (!audioUrl) {
      setGenreError('Could not resolve audio URL from this NFT');
      return;
    }

    setGenreTransforming(true);
    setGenreError(null);
    setGenreResult(null);
    setMintTxHash(null);
    setMintError(null);
    setExportedUrl(null);

    try {
      const res = await fetch('/api/remix-daw/genre-transform', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          audioUrl,
          genre: selectedGenre,
          tokenId: selectedNFT.tokenId,
          vocalGain,
          instrumentalGain,
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Genre transform failed');
      }

      const data = await res.json();
      setGenreResult({ ipfsUrl: data.ipfsUrl, gatewayUrl: data.gatewayUrl, genre: data.genre });
      setExportedUrl(data.gatewayUrl);
    } catch (err: any) {
      setGenreError(err.message || 'Genre transform failed');
    } finally {
      setGenreTransforming(false);
    }
  }, [selectedNFT, selectedGenre, vocalGain, instrumentalGain, payForAction]);

  // ── Vocal Synth ───────────────────────────────────────────────────────
  const handleVocalSynth = useCallback(async () => {
    if (!jobId) return;
    if (!lyrics.trim()) { setVocalSynthError('Enter some lyrics first.'); return; }

    // Payment gate
    const paid = await payForAction(STUDIO_ACTION.VocalSynth);
    if (!paid) return;

    setVocalSynthing(true);
    setVocalSynthError(null);
    setVocalSynthResult(null);
    setExportedUrl(null);
    setMintTxHash(null);

    try {
      const res = await fetch('/api/remix-daw/vocal-synth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jobId,
          lyrics,
          beatsPerLine,
          introBeats,
          cloneVoice,
          vocalGain: vocalSynthGain,
          mixWithInstrumental,
          instrumentalGain: instrumentalGainVS,
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Vocal synthesis failed');
      }

      const data = await res.json();
      setVocalSynthResult(data);
      setExportedUrl(data.gatewayUrl);
    } catch (err: any) {
      setVocalSynthError(err.message || 'Vocal synthesis failed');
    } finally {
      setVocalSynthing(false);
    }
  }, [jobId, lyrics, beatsPerLine, introBeats, cloneVoice, vocalSynthGain, mixWithInstrumental, instrumentalGainVS, payForAction]);

  const toggleVocalPreview = useCallback(() => {
    if (!vocalSynthResult?.gatewayUrl) return;
    if (!vocalPreviewRef.current) {
      vocalPreviewRef.current = new Audio(vocalSynthResult.gatewayUrl);
      vocalPreviewRef.current.onended = () => setVocalPreviewPlaying(false);
    }
    if (vocalPreviewPlaying) {
      vocalPreviewRef.current.pause();
      setVocalPreviewPlaying(false);
    } else {
      vocalPreviewRef.current.play();
      setVocalPreviewPlaying(true);
    }
  }, [vocalSynthResult, vocalPreviewPlaying]);

  // ── Freestyle Mode ────────────────────────────────────────────────────
  const handleFreestyle = useCallback(async () => {
    if (!jobId) return;

    // Payment gate
    const paid = await payForAction(STUDIO_ACTION.Freestyle);
    if (!paid) return;

    // Reset state
    setFreestyling(true);
    setFreestyleBars([]);
    setFreestyleBpm(null);
    setFreestyleBarDuration(null);
    setFreestyleDone(false);
    setFreestyleError(null);

    // Create a fresh AudioContext for this session
    if (freestyleCtxRef.current) freestyleCtxRef.current.close();
    freestyleCtxRef.current = new AudioContext();

    const abort = new AbortController();
    freestyleAbortRef.current = abort;

    try {
      const res = await fetch('/api/remix-daw/freestyle', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jobId,
          theme: freestyleTheme || 'life',
          genre: freestyleGenreHint,
          maxBars: freestyleMaxBars,
          beatsPerBar: freestyleBeatsPerBar,
          introBeats: freestyleIntroBeats,
          cloneVoice: freestyleCloneVoice,
        }),
        signal: abort.signal,
      });

      if (!res.ok || !res.body) {
        const err = await res.json().catch(() => ({ error: 'Stream failed' }));
        throw new Error(err.error || 'Freestyle stream failed');
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let barDur = 2.0;   // default until meta arrives
      let bpm = 120;
      let introDur = 0;
      let firstBarScheduled = false;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const raw of lines) {
          const line = raw.trim();
          if (!line || line.startsWith(':')) continue;

          if (line.startsWith('event: meta')) continue;
          if (line.startsWith('event: done')) {
            setFreestyleDone(true);
            setFreestyling(false);
            continue;
          }
          if (line.startsWith('event: error')) continue;

          if (line.startsWith('data: ')) {
            try {
              const payload = JSON.parse(line.slice(6));

              // Meta event
              if ('bpm' in payload && 'barDuration' in payload) {
                bpm = payload.bpm;
                barDur = payload.barDuration;
                introDur = (payload.introBeats * 60) / bpm;
                setFreestyleBpm(bpm);
                setFreestyleBarDuration(barDur);
                // Schedule playback start: now + small buffer
                if (!firstBarScheduled) {
                  freestyleStartTimeRef.current = freestyleCtxRef.current!.currentTime + 0.5 + introDur;
                  firstBarScheduled = true;
                }
                continue;
              }

              // Bar event
              if ('bar' in payload && 'audio' in payload) {
                const { bar, line: lyric, timeOffset, audio } = payload;

                // Decode base64 WAV
                const wavBytes = Uint8Array.from(atob(audio), c => c.charCodeAt(0));
                const audioBuffer = await freestyleCtxRef.current!.decodeAudioData(wavBytes.buffer.slice(0));

                // Schedule this bar to play at the correct beat offset
                const source = freestyleCtxRef.current!.createBufferSource();
                source.buffer = audioBuffer;
                source.connect(freestyleCtxRef.current!.destination);
                const playAt = freestyleStartTimeRef.current + timeOffset - introDur;
                source.start(Math.max(playAt, freestyleCtxRef.current!.currentTime));

                setFreestyleBars(prev => [...prev, { bar, line: lyric, timeOffset }]);
              }
            } catch (parseErr) {
              // Malformed JSON — skip
            }
          }
        }
      }
    } catch (err: any) {
      if (err.name !== 'AbortError') {
        setFreestyleError(err.message || 'Freestyle failed');
        setFreestyling(false);
      }
    }
  }, [jobId, freestyleTheme, freestyleGenreHint, freestyleMaxBars, freestyleBeatsPerBar, freestyleIntroBeats, freestyleCloneVoice, payForAction]);

  const stopFreestyle = useCallback(() => {
    freestyleAbortRef.current?.abort();
    freestyleCtxRef.current?.close();
    freestyleCtxRef.current = null;
    setFreestyling(false);
  }, []);

  // ── Formatters ────────────────────────────────────────────────────────
  const fmtTime = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${m}:${sec.toString().padStart(2, '0')}`;
  };

  if (!mounted) return null;

  const genreInfo = GENRES.find(g => g.key === selectedGenre);

  // ── Render ────────────────────────────────────────────────────────────
  return createPortal(
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center p-3 sm:p-4"
      style={{ backgroundColor: 'rgba(0,0,0,0.92)' }}
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-4xl max-h-[96vh] overflow-y-auto rounded-2xl flex flex-col"
        style={{
          background: isDarkMode
            ? 'linear-gradient(135deg, #0f0f1a 0%, #1a0a2e 50%, #0a1a2e 100%)'
            : 'white',
          border: '1px solid rgba(0,212,255,0.3)',
          boxShadow: '0 0 80px rgba(0,212,255,0.1)',
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 sm:p-5 border-b border-white/10">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center"
              style={{ background: 'linear-gradient(135deg, #00d4ff, #7c3aed)' }}>
              <Music2 className="w-5 h-5 text-white" />
            </div>
            <div>
              <h2 className={`text-lg font-bold ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>
                EmpowerStudio
              </h2>
              <p className={`text-xs ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                Remix Music NFTs · AI Genre Transform · Mint on Monad
              </p>
            </div>
          </div>
          <button onClick={onClose}
            className={`p-2 rounded-lg transition-colors ${isDarkMode ? 'text-gray-400 hover:text-white hover:bg-white/10' : 'text-gray-500 hover:text-gray-900 hover:bg-gray-100'}`}>
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Mode Toggle */}
        <div className="flex flex-wrap gap-2 px-4 sm:px-5 pt-4">
          {([
            { key: 'remix',     label: 'Stem Mixer',         icon: <Sliders className="w-3.5 h-3.5" /> },
            { key: 'genre',     label: 'AI Genre Transform', icon: <Wand2 className="w-3.5 h-3.5" /> },
            { key: 'vocal',     label: 'Vocal Writer',       icon: <Mic className="w-3.5 h-3.5" /> },
            { key: 'freestyle', label: 'Freestyle',          icon: <Zap className="w-3.5 h-3.5" /> },
          ] as { key: DawMode; label: string; icon: React.ReactNode }[]).map(({ key, label, icon }) => (
            <button key={key} onClick={() => setMode(key)}
              className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                mode === key
                  ? 'bg-gradient-to-r from-cyan-500 to-purple-600 text-white shadow-lg shadow-cyan-500/20'
                  : isDarkMode
                    ? 'bg-white/5 text-gray-400 hover:text-white hover:bg-white/10'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}>
              {icon}{label}
            </button>
          ))}
        </div>

        {/* Payment Error Banner */}
        {paymentError && (
          <div className="mx-4 sm:mx-5 mt-3 flex items-center gap-2 p-3 rounded-xl bg-red-500/10 border border-red-500/30">
            <span className="text-sm text-red-400 flex-1">{paymentError}</span>
            <button onClick={() => setPaymentError(null)}
              className="text-red-400 hover:text-red-300 p-0.5">
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        <div className="p-4 sm:p-5 flex flex-col gap-5">

          {/* ── NFT Selector ────────────────────────────────────────────── */}
          <section>
            <h3 className={`text-sm font-semibold mb-3 flex items-center gap-2 ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>
              <Music2 className="w-4 h-4 text-cyan-400" />
              Select Music NFT to Remix
            </h3>

            {loadingNFTs ? (
              <div className="flex items-center gap-2 text-sm text-gray-400">
                <Loader2 className="w-4 h-4 animate-spin" /> Loading your NFTs...
              </div>
            ) : ownedNFTs.length === 0 ? (
              <p className={`text-sm ${isDarkMode ? 'text-gray-500' : 'text-gray-400'}`}>
                No Music NFTs found. Mint one in the Oracle first!
              </p>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                {ownedNFTs.map(nft => (
                  <button key={nft.id}
                    onClick={() => { setSelectedNFT(nft); setSeparateError(null); setGenreError(null); }}
                    className={`relative rounded-xl overflow-hidden text-left transition-all border-2 ${
                      selectedNFT?.id === nft.id
                        ? 'border-cyan-400 shadow-lg shadow-cyan-400/30'
                        : isDarkMode ? 'border-white/10 hover:border-white/30' : 'border-gray-200 hover:border-gray-400'
                    }`}>
                    <div className="aspect-square bg-gradient-to-br from-cyan-500/20 to-purple-600/20">
                      {nft.imageUrl
                        ? <img src={nft.imageUrl} alt={nft.name} className="w-full h-full object-cover" />
                        : <div className="w-full h-full flex items-center justify-center text-3xl">🎵</div>
                      }
                    </div>
                    {selectedNFT?.id === nft.id && (
                      <div className="absolute top-1.5 right-1.5 w-5 h-5 rounded-full bg-cyan-400 flex items-center justify-center">
                        <Check className="w-3 h-3 text-black" />
                      </div>
                    )}
                    <div className={`p-1.5 ${isDarkMode ? 'bg-black/60' : 'bg-white/90'}`}>
                      <p className={`text-[10px] font-semibold truncate ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>
                        {nft.name}
                      </p>
                      <p className="text-[9px] text-cyan-400">#{nft.tokenId}</p>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </section>

          {/* ════════════════════════════════════════════════════════════
              MODE: Stem Mixer
          ════════════════════════════════════════════════════════════ */}
          {mode === 'remix' && (
            <>
              {/* Separate Button */}
              {selectedNFT && stems.length === 0 && (
                <button
                  onClick={handleSeparate}
                  disabled={separating || paymentProcessing || !walletAddress}
                  className="flex items-center justify-center gap-2 py-3 px-6 rounded-xl font-semibold text-sm transition-all disabled:opacity-60"
                  style={{ background: 'linear-gradient(135deg, #00d4ff, #7c3aed)', color: 'white' }}
                >
                  {paymentProcessing
                    ? <><Loader2 className="w-4 h-4 animate-spin" /> Confirming payment...</>
                    : separating
                    ? <><Loader2 className="w-4 h-4 animate-spin" /> Separating stems (may take 2–3 min)...</>
                    : <><Zap className="w-4 h-4" /> Separate Stems ({STUDIO_PRICES[0].label})</>
                  }
                </button>
              )}

              {separateError && (
                <p className="text-sm text-red-400 bg-red-500/10 rounded-lg p-3">{separateError}</p>
              )}

              {/* Stem Tracks */}
              {stems.length > 0 && (
                <>
                  {/* Transport */}
                  <div className={`rounded-xl p-3 flex items-center gap-3 ${isDarkMode ? 'bg-white/5' : 'bg-gray-100'}`}>
                    <button onClick={handleStop}
                      className={`p-2 rounded-lg transition-colors ${isDarkMode ? 'text-gray-400 hover:text-white hover:bg-white/10' : 'text-gray-600 hover:bg-gray-200'}`}>
                      <Square className="w-4 h-4" />
                    </button>
                    <button onClick={togglePlay}
                      className="w-10 h-10 rounded-xl flex items-center justify-center shadow-lg transition-transform hover:scale-105"
                      style={{ background: 'linear-gradient(135deg, #00d4ff, #7c3aed)' }}>
                      {isPlaying ? <Pause className="w-4 h-4 text-white" /> : <Play className="w-4 h-4 text-white" />}
                    </button>

                    {/* Timeline */}
                    <div className="flex-1 flex items-center gap-2">
                      <span className="text-xs text-gray-400 w-10 text-right">{fmtTime(playheadSec)}</span>
                      <div className={`flex-1 h-1.5 rounded-full relative overflow-hidden cursor-pointer ${isDarkMode ? 'bg-white/10' : 'bg-gray-300'}`}
                        onClick={e => {
                          const rect = e.currentTarget.getBoundingClientRect();
                          const ratio = (e.clientX - rect.left) / rect.width;
                          playbackOffsetRef.current = ratio * durationSec;
                          setPlayheadSec(playbackOffsetRef.current);
                          if (isPlaying) { stopPlayback(); setTimeout(startPlayback, 50); }
                        }}>
                        <div className="h-full rounded-full transition-all"
                          style={{
                            width: durationSec > 0 ? `${(playheadSec / durationSec) * 100}%` : '0%',
                            background: 'linear-gradient(90deg, #00d4ff, #7c3aed)',
                          }} />
                      </div>
                      <span className="text-xs text-gray-400 w-10">{fmtTime(durationSec)}</span>
                    </div>

                    {/* Master volume */}
                    <div className="flex items-center gap-1.5">
                      <Volume2 className="w-3.5 h-3.5 text-gray-400" />
                      <input type="range" min="0" max="1" step="0.01" value={masterVolume}
                        onChange={e => {
                          const v = parseFloat(e.target.value);
                          setMasterVolume(v);
                          if (masterGainRef.current) masterGainRef.current.gain.value = v;
                        }}
                        className="w-20 accent-cyan-400 cursor-pointer" />
                    </div>
                  </div>

                  {/* Stem Tracks */}
                  <div className="space-y-2">
                    {stems.map((stem, i) => (
                      <div key={stem.name}
                        className={`rounded-xl p-3 flex flex-col gap-2 ${isDarkMode ? 'bg-white/5 hover:bg-white/8' : 'bg-gray-50 hover:bg-gray-100'} transition-colors`}>
                        <div className="flex items-center gap-3">
                          {/* Stem label */}
                          <div className="flex items-center gap-1.5 w-20">
                            <div className="w-5 h-5 rounded flex items-center justify-center" style={{ backgroundColor: stem.color + '33', color: stem.color }}>
                              {stem.icon}
                            </div>
                            <span className={`text-xs font-medium ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>{stem.label}</span>
                          </div>

                          {/* Waveform */}
                          <div className="flex-1 h-12 rounded overflow-hidden" style={{ backgroundColor: stem.color + '11' }}>
                            <canvas
                              ref={el => { canvasRefs.current[i] = el; }}
                              width={300} height={48}
                              className="w-full h-full"
                            />
                          </div>

                          {/* Gain slider */}
                          <div className="flex items-center gap-1.5 w-24">
                            <input type="range" min="0" max="2" step="0.01" value={stem.gain}
                              onChange={e => updateStemGain(stem.name, parseFloat(e.target.value))}
                              className="w-16 cursor-pointer"
                              style={{ accentColor: stem.color }} />
                            <span className={`text-[10px] w-7 text-right ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                              {Math.round(stem.gain * 100)}%
                            </span>
                          </div>

                          {/* Mute / Solo */}
                          <div className="flex gap-1">
                            <button onClick={() => toggleMute(stem.name)}
                              className={`px-1.5 py-0.5 rounded text-[10px] font-bold transition-colors ${
                                stem.muted ? 'bg-red-500 text-white' : isDarkMode ? 'bg-white/10 text-gray-400 hover:bg-white/20' : 'bg-gray-200 text-gray-600 hover:bg-gray-300'
                              }`}>M</button>
                            <button onClick={() => toggleSolo(stem.name)}
                              className={`px-1.5 py-0.5 rounded text-[10px] font-bold transition-colors ${
                                stem.soloed ? 'bg-yellow-400 text-black' : isDarkMode ? 'bg-white/10 text-gray-400 hover:bg-white/20' : 'bg-gray-200 text-gray-600 hover:bg-gray-300'
                              }`}>S</button>
                          </div>
                        </div>

                        {/* Effects row */}
                        {stemEffects[stem.name] && (
                          <div className="flex items-center gap-4 pl-8">
                            <div className="flex items-center gap-1.5">
                              <span className={`text-[10px] ${isDarkMode ? 'text-gray-500' : 'text-gray-400'}`}>Dist</span>
                              <input type="range" min="0" max="100" step="1"
                                value={stemEffects[stem.name].distortion}
                                onChange={e => setStemEffects(prev => ({
                                  ...prev,
                                  [stem.name]: { ...prev[stem.name], distortion: parseInt(e.target.value) }
                                }))}
                                className="w-16 cursor-pointer" style={{ accentColor: '#f87171' }} />
                              <span className={`text-[10px] w-6 ${isDarkMode ? 'text-gray-500' : 'text-gray-400'}`}>
                                {stemEffects[stem.name].distortion}%
                              </span>
                            </div>
                            <div className="flex items-center gap-1.5">
                              <span className={`text-[10px] ${isDarkMode ? 'text-gray-500' : 'text-gray-400'}`}>Reverb</span>
                              <input type="range" min="0" max="100" step="1"
                                value={stemEffects[stem.name].reverb}
                                onChange={e => setStemEffects(prev => ({
                                  ...prev,
                                  [stem.name]: { ...prev[stem.name], reverb: parseInt(e.target.value) }
                                }))}
                                className="w-16 cursor-pointer" style={{ accentColor: '#60a5fa' }} />
                              <span className={`text-[10px] w-6 ${isDarkMode ? 'text-gray-500' : 'text-gray-400'}`}>
                                {stemEffects[stem.name].reverb}%
                              </span>
                            </div>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>

                  {/* Re-separate button */}
                  <button onClick={() => { setStems([]); setJobId(null); setExportedUrl(null); }}
                    className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg transition-colors self-start ${isDarkMode ? 'text-gray-400 hover:text-white hover:bg-white/10' : 'text-gray-500 hover:bg-gray-100'}`}>
                    <RefreshCw className="w-3.5 h-3.5" /> Change NFT / Re-separate
                  </button>
                </>
              )}

              {/* Export + Mint Panel */}
              {stems.length > 0 && (
                <div className={`rounded-xl p-4 border ${isDarkMode ? 'bg-white/5 border-white/10' : 'bg-gray-50 border-gray-200'}`}>
                  <h4 className={`text-sm font-semibold mb-3 ${isDarkMode ? 'text-gray-200' : 'text-gray-700'}`}>
                    Bounce & Mint as New NFT
                  </h4>

                  {!exportedUrl ? (
                    <button onClick={handleExport} disabled={exporting}
                      className="flex items-center gap-2 py-2.5 px-5 rounded-xl font-semibold text-sm transition-all disabled:opacity-60"
                      style={{ background: 'linear-gradient(135deg, #00d4ff, #7c3aed)', color: 'white' }}>
                      {exporting ? <><Loader2 className="w-4 h-4 animate-spin" /> Bouncing to IPFS...</> : <><Download className="w-4 h-4" /> Export Remix</>}
                    </button>
                  ) : (
                    <div className="space-y-3">
                      <div className={`flex items-center gap-2 p-2.5 rounded-lg ${isDarkMode ? 'bg-emerald-500/10 border border-emerald-500/30' : 'bg-emerald-50 border border-emerald-200'}`}>
                        <Check className="w-4 h-4 text-emerald-400 flex-shrink-0" />
                        <a href={exportedUrl} target="_blank" rel="noopener noreferrer"
                          className="text-xs text-emerald-400 hover:underline truncate flex-1">
                          {exportedUrl}
                        </a>
                        <ExternalLink className="w-3.5 h-3.5 text-emerald-400 flex-shrink-0" />
                      </div>

                      <div className="flex items-center gap-3">
                        <label className={`text-xs ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>Mint Price (WMON)</label>
                        <input type="number" min="0.001" step="0.001" value={mintPrice}
                          onChange={e => setMintPrice(e.target.value)}
                          className={`w-28 px-3 py-1.5 rounded-lg text-sm border outline-none ${isDarkMode ? 'bg-black/50 border-white/10 text-white' : 'bg-white border-gray-300 text-gray-900'}`} />
                      </div>

                      {mintTxHash ? (
                        <div className={`flex items-center gap-2 p-2.5 rounded-lg ${isDarkMode ? 'bg-cyan-500/10 border border-cyan-500/30' : 'bg-cyan-50 border border-cyan-200'}`}>
                          <Check className="w-4 h-4 text-cyan-400" />
                          <span className="text-xs text-cyan-400">Remix minted on Monad! TX: {mintTxHash.slice(0, 12)}...</span>
                        </div>
                      ) : (
                        <button onClick={handleMint} disabled={minting || !walletAddress}
                          className="flex items-center gap-2 py-2.5 px-5 rounded-xl font-semibold text-sm transition-all disabled:opacity-60"
                          style={{ background: 'linear-gradient(135deg, #f59e0b, #ec4899)', color: 'white' }}>
                          {minting
                            ? <><Loader2 className="w-4 h-4 animate-spin" /> Minting...</>
                            : <><Music2 className="w-4 h-4" /> Mint Remix NFT ({mintPrice} WMON)</>
                          }
                        </button>
                      )}

                      {mintError && <p className="text-xs text-red-400 bg-red-500/10 rounded-lg p-2">{mintError}</p>}
                    </div>
                  )}
                </div>
              )}
            </>
          )}

          {/* ════════════════════════════════════════════════════════════
              MODE: AI Genre Transform
          ════════════════════════════════════════════════════════════ */}
          {mode === 'genre' && (
            <>
              {/* Info Banner */}
              <div className={`rounded-xl p-3 ${isDarkMode ? 'bg-purple-500/10 border border-purple-500/20' : 'bg-purple-50 border border-purple-200'}`}>
                <div className="flex items-start gap-2">
                  <Mic className="w-4 h-4 text-purple-400 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className={`text-xs font-semibold ${isDarkMode ? 'text-purple-300' : 'text-purple-700'}`}>
                      Vocal-Preserving AI Genre Transform
                    </p>
                    <p className={`text-xs mt-0.5 ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                      Demucs isolates the original vocal stem — your voice is always kept. MusicGen then creates
                      fresh instrumentals in the target genre and mixes them back with your vocals.
                    </p>
                  </div>
                </div>
              </div>

              {/* Genre Grid */}
              <div>
                <h3 className={`text-sm font-semibold mb-3 ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                  Choose Target Genre
                </h3>
                <div className="grid grid-cols-4 gap-2">
                  {GENRES.map(g => (
                    <button key={g.key} onClick={() => setSelectedGenre(g.key as GenreKey)}
                      className={`flex flex-col items-center gap-1 p-2.5 rounded-xl text-xs font-medium transition-all border-2 ${
                        selectedGenre === g.key
                          ? 'shadow-lg scale-105'
                          : isDarkMode ? 'border-white/10 hover:border-white/30' : 'border-gray-200 hover:border-gray-400'
                      }`}
                      style={selectedGenre === g.key ? {
                        borderColor: g.color,
                        backgroundColor: g.color + '22',
                        color: g.color,
                        boxShadow: `0 0 20px ${g.color}33`,
                      } : {}}>
                      <span className="text-2xl">{g.emoji}</span>
                      <span className={selectedGenre === g.key ? '' : isDarkMode ? 'text-gray-400' : 'text-gray-600'}>
                        {g.label}
                      </span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Gain Controls */}
              <div className="grid grid-cols-2 gap-4">
                <div className={`rounded-xl p-3 ${isDarkMode ? 'bg-white/5' : 'bg-gray-50'}`}>
                  <div className="flex items-center gap-1.5 mb-2">
                    <Mic className="w-3.5 h-3.5 text-emerald-400" />
                    <span className={`text-xs font-medium ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>Vocal Volume</span>
                  </div>
                  <input type="range" min="0" max="2" step="0.05" value={vocalGain}
                    onChange={e => setVocalGain(parseFloat(e.target.value))}
                    className="w-full cursor-pointer" style={{ accentColor: '#34d399' }} />
                  <div className="flex justify-between text-[10px] text-gray-500 mt-1">
                    <span>Quiet</span>
                    <span className="text-emerald-400 font-bold">{Math.round(vocalGain * 100)}%</span>
                    <span>Loud</span>
                  </div>
                </div>
                <div className={`rounded-xl p-3 ${isDarkMode ? 'bg-white/5' : 'bg-gray-50'}`}>
                  <div className="flex items-center gap-1.5 mb-2">
                    <Drum className="w-3.5 h-3.5 text-cyan-400" />
                    <span className={`text-xs font-medium ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>Instrumental Volume</span>
                  </div>
                  <input type="range" min="0" max="2" step="0.05" value={instrumentalGain}
                    onChange={e => setInstrumentalGain(parseFloat(e.target.value))}
                    className="w-full cursor-pointer" style={{ accentColor: '#00d4ff' }} />
                  <div className="flex justify-between text-[10px] text-gray-500 mt-1">
                    <span>Quiet</span>
                    <span className="text-cyan-400 font-bold">{Math.round(instrumentalGain * 100)}%</span>
                    <span>Loud</span>
                  </div>
                </div>
              </div>

              {/* Transform Button */}
              {selectedNFT && (
                <button onClick={handleGenreTransform} disabled={genreTransforming || paymentProcessing || !walletAddress}
                  className="flex items-center justify-center gap-2 py-3.5 px-6 rounded-xl font-bold text-sm transition-all disabled:opacity-60"
                  style={{
                    background: genreInfo
                      ? `linear-gradient(135deg, ${genreInfo.color}, #7c3aed)`
                      : 'linear-gradient(135deg, #00d4ff, #7c3aed)',
                    color: 'white',
                    boxShadow: genreInfo ? `0 0 30px ${genreInfo.color}44` : undefined,
                  }}>
                  {paymentProcessing ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Confirming payment...
                    </>
                  ) : genreTransforming ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Isolating vocals + generating {genreInfo?.label} instrumentals... (3–5 min)
                    </>
                  ) : (
                    <>
                      <Wand2 className="w-4 h-4" />
                      Transform to {genreInfo?.emoji} {genreInfo?.label} ({STUDIO_PRICES[1].label})
                    </>
                  )}
                </button>
              )}

              {!selectedNFT && (
                <p className={`text-sm text-center ${isDarkMode ? 'text-gray-500' : 'text-gray-400'}`}>
                  Select a Music NFT above to begin genre transformation.
                </p>
              )}

              {genreError && (
                <p className="text-sm text-red-400 bg-red-500/10 rounded-lg p-3">{genreError}</p>
              )}

              {/* Genre Transform Result */}
              {genreResult && (
                <div className={`rounded-xl p-4 border ${isDarkMode ? 'bg-emerald-500/10 border-emerald-500/30' : 'bg-emerald-50 border-emerald-200'}`}>
                  <div className="flex items-center gap-2 mb-3">
                    <Check className="w-5 h-5 text-emerald-400" />
                    <span className={`font-semibold text-sm ${isDarkMode ? 'text-emerald-300' : 'text-emerald-700'}`}>
                      Genre Transform Complete! ({GENRES.find(g => g.key === genreResult.genre)?.emoji} {genreResult.genre})
                    </span>
                  </div>

                  {/* Audio preview player */}
                  <audio controls className="w-full mb-3 h-10" src={genreResult.gatewayUrl} />

                  <a href={genreResult.gatewayUrl} target="_blank" rel="noopener noreferrer"
                    className="flex items-center gap-2 text-xs text-cyan-400 hover:underline mb-4 break-all">
                    <ExternalLink className="w-3.5 h-3.5 flex-shrink-0" />
                    {genreResult.gatewayUrl}
                  </a>

                  {/* Mint the genre-transformed track */}
                  <div className="space-y-3">
                    <div className="flex items-center gap-3">
                      <label className={`text-xs ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>Mint Price (WMON)</label>
                      <input type="number" min="0.001" step="0.001" value={mintPrice}
                        onChange={e => setMintPrice(e.target.value)}
                        className={`w-28 px-3 py-1.5 rounded-lg text-sm border outline-none ${isDarkMode ? 'bg-black/50 border-white/10 text-white' : 'bg-white border-gray-300 text-gray-900'}`} />
                    </div>

                    {mintTxHash ? (
                      <div className={`flex items-center gap-2 p-2.5 rounded-lg ${isDarkMode ? 'bg-cyan-500/10 border border-cyan-500/30' : 'bg-cyan-50 border border-cyan-200'}`}>
                        <Check className="w-4 h-4 text-cyan-400" />
                        <span className="text-xs text-cyan-400">
                          Genre remix minted on Monad! TX: {mintTxHash.slice(0, 12)}...
                        </span>
                      </div>
                    ) : (
                      <button onClick={handleMint} disabled={minting || !walletAddress}
                        className="flex items-center gap-2 py-2.5 px-5 rounded-xl font-semibold text-sm transition-all disabled:opacity-60"
                        style={{ background: 'linear-gradient(135deg, #f59e0b, #ec4899)', color: 'white' }}>
                        {minting
                          ? <><Loader2 className="w-4 h-4 animate-spin" /> Minting...</>
                          : <><Music2 className="w-4 h-4" /> Mint {genreInfo?.label} Remix ({mintPrice} WMON)</>
                        }
                      </button>
                    )}
                  </div>

                  {mintError && <p className="text-xs text-red-400 bg-red-500/10 rounded-lg p-2 mt-2">{mintError}</p>}
                </div>
              )}
            </>
          )}

          {/* ════════════════════════════════════════════════════════════
              MODE: Vocal Writer
          ════════════════════════════════════════════════════════════ */}
          {mode === 'vocal' && (
            <>
              {/* Requires a prior stem separation job */}
              {!jobId ? (
                <div className={`rounded-xl p-4 border ${isDarkMode ? 'bg-amber-500/10 border-amber-500/30' : 'bg-amber-50 border-amber-200'}`}>
                  <div className="flex items-start gap-2">
                    <Mic className="w-4 h-4 text-amber-400 flex-shrink-0 mt-0.5" />
                    <div>
                      <p className={`text-xs font-semibold ${isDarkMode ? 'text-amber-300' : 'text-amber-700'}`}>
                        Stem separation required first
                      </p>
                      <p className={`text-xs mt-0.5 ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                        Switch to <strong>Stem Mixer</strong>, select a Music NFT, and click
                        "Separate Stems" — then come back here to write vocals.
                      </p>
                    </div>
                  </div>
                </div>
              ) : (
                <>
                  {/* Info banner */}
                  <div className={`rounded-xl p-3 ${isDarkMode ? 'bg-emerald-500/10 border border-emerald-500/20' : 'bg-emerald-50 border border-emerald-200'}`}>
                    <div className="flex items-start gap-2">
                      <Mic className="w-4 h-4 text-emerald-400 flex-shrink-0 mt-0.5" />
                      <div>
                        <p className={`text-xs font-semibold ${isDarkMode ? 'text-emerald-300' : 'text-emerald-700'}`}>
                          AI Vocal Writer — beat-synchronised lyric synthesis
                        </p>
                        <p className={`text-xs mt-0.5 ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                          Type your lyrics below (one line per bar). XTTS v2 clones the original
                          singer's voice and places each line on the beat grid of your instrumental.
                          Every syllable lands in rhythm — no manual timing needed.
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Lyrics textarea */}
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <label className={`text-sm font-semibold ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                        Lyrics <span className={`text-xs font-normal ${isDarkMode ? 'text-gray-500' : 'text-gray-400'}`}>(one line = one bar)</span>
                      </label>
                      <span className={`text-xs ${isDarkMode ? 'text-gray-500' : 'text-gray-400'}`}>
                        {lyrics.split('\n').filter(l => l.trim()).length} lines
                      </span>
                    </div>
                    <textarea
                      value={lyrics}
                      onChange={e => setLyrics(e.target.value)}
                      placeholder={`Riding through the city at night\nNeon lights reflecting in my eyes\nEvery step I take is worth the fight\nChasing down the future, reaching high`}
                      rows={7}
                      className={`w-full px-3 py-2.5 rounded-xl text-sm font-mono resize-none outline-none border transition-colors ${
                        isDarkMode
                          ? 'bg-black/50 border-white/10 text-white placeholder-gray-600 focus:border-cyan-500/50'
                          : 'bg-white border-gray-300 text-gray-900 placeholder-gray-400 focus:border-cyan-400'
                      }`}
                    />
                  </div>

                  {/* Beat settings */}
                  <div className="grid grid-cols-2 gap-3">
                    <div className={`rounded-xl p-3 ${isDarkMode ? 'bg-white/5' : 'bg-gray-50'}`}>
                      <p className={`text-xs font-medium mb-2 ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                        Beats per line
                      </p>
                      <div className="flex gap-1.5">
                        {[2, 4, 8].map(b => (
                          <button key={b} onClick={() => setBeatsPerLine(b)}
                            className={`flex-1 py-1.5 rounded-lg text-xs font-bold transition-all ${
                              beatsPerLine === b
                                ? 'bg-gradient-to-r from-cyan-500 to-purple-600 text-white'
                                : isDarkMode ? 'bg-white/10 text-gray-400 hover:bg-white/20' : 'bg-gray-200 text-gray-600 hover:bg-gray-300'
                            }`}>{b}</button>
                        ))}
                      </div>
                      <p className={`text-[10px] mt-1.5 ${isDarkMode ? 'text-gray-600' : 'text-gray-400'}`}>
                        4 = standard bar · 8 = slow/long · 2 = rapid-fire
                      </p>
                    </div>

                    <div className={`rounded-xl p-3 ${isDarkMode ? 'bg-white/5' : 'bg-gray-50'}`}>
                      <p className={`text-xs font-medium mb-2 ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                        Intro (silent beats)
                      </p>
                      <div className="flex gap-1.5">
                        {[0, 4, 8].map(b => (
                          <button key={b} onClick={() => setIntroBeats(b)}
                            className={`flex-1 py-1.5 rounded-lg text-xs font-bold transition-all ${
                              introBeats === b
                                ? 'bg-gradient-to-r from-cyan-500 to-purple-600 text-white'
                                : isDarkMode ? 'bg-white/10 text-gray-400 hover:bg-white/20' : 'bg-gray-200 text-gray-600 hover:bg-gray-300'
                            }`}>{b === 0 ? 'None' : b}</button>
                        ))}
                      </div>
                      <p className={`text-[10px] mt-1.5 ${isDarkMode ? 'text-gray-600' : 'text-gray-400'}`}>
                        Beats of instrumental before vocals enter
                      </p>
                    </div>
                  </div>

                  {/* Voice + mix settings */}
                  <div className="grid grid-cols-2 gap-3">
                    {/* Voice clone toggle */}
                    <div className={`rounded-xl p-3 ${isDarkMode ? 'bg-white/5' : 'bg-gray-50'}`}>
                      <p className={`text-xs font-medium mb-2 ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>Voice style</p>
                      <div className="flex gap-1.5">
                        <button onClick={() => setCloneVoice(true)}
                          className={`flex-1 py-1.5 rounded-lg text-xs font-medium transition-all ${
                            cloneVoice
                              ? 'bg-gradient-to-r from-emerald-500 to-cyan-500 text-white'
                              : isDarkMode ? 'bg-white/10 text-gray-400 hover:bg-white/20' : 'bg-gray-200 text-gray-600'
                          }`}>Clone singer</button>
                        <button onClick={() => setCloneVoice(false)}
                          className={`flex-1 py-1.5 rounded-lg text-xs font-medium transition-all ${
                            !cloneVoice
                              ? 'bg-gradient-to-r from-purple-500 to-pink-500 text-white'
                              : isDarkMode ? 'bg-white/10 text-gray-400 hover:bg-white/20' : 'bg-gray-200 text-gray-600'
                          }`}>Natural AI</button>
                      </div>
                      <p className={`text-[10px] mt-1.5 ${isDarkMode ? 'text-gray-600' : 'text-gray-400'}`}>
                        {cloneVoice ? 'Sounds like the original singer' : 'Default XTTS v2 voice'}
                      </p>
                    </div>

                    {/* Vocal volume */}
                    <div className={`rounded-xl p-3 ${isDarkMode ? 'bg-white/5' : 'bg-gray-50'}`}>
                      <p className={`text-xs font-medium mb-2 ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>Vocal volume</p>
                      <input type="range" min="0.2" max="2" step="0.05" value={vocalSynthGain}
                        onChange={e => setVocalSynthGain(parseFloat(e.target.value))}
                        className="w-full cursor-pointer" style={{ accentColor: '#34d399' }} />
                      <div className="flex justify-between text-[10px] text-gray-500 mt-1">
                        <span>Soft</span>
                        <span className="text-emerald-400 font-bold">{Math.round(vocalSynthGain * 100)}%</span>
                        <span>Loud</span>
                      </div>
                    </div>
                  </div>

                  {/* Mix with instrumental toggle */}
                  <div className={`rounded-xl p-3 flex items-center justify-between ${isDarkMode ? 'bg-white/5' : 'bg-gray-50'}`}>
                    <div>
                      <p className={`text-xs font-medium ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>Mix with instrumental</p>
                      <p className={`text-[10px] mt-0.5 ${isDarkMode ? 'text-gray-500' : 'text-gray-400'}`}>
                        Blend synthesised vocals with the separated instrument stems
                      </p>
                    </div>
                    <div className="flex items-center gap-3">
                      {mixWithInstrumental && (
                        <div className="flex items-center gap-1.5">
                          <span className={`text-[10px] ${isDarkMode ? 'text-gray-500' : 'text-gray-400'}`}>Instr.</span>
                          <input type="range" min="0.2" max="1.5" step="0.05" value={instrumentalGainVS}
                            onChange={e => setInstrumentalGainVS(parseFloat(e.target.value))}
                            className="w-20 cursor-pointer" style={{ accentColor: '#60a5fa' }} />
                          <span className={`text-[10px] w-7 ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                            {Math.round(instrumentalGainVS * 100)}%
                          </span>
                        </div>
                      )}
                      <button onClick={() => setMixWithInstrumental(v => !v)}
                        className={`w-10 h-6 rounded-full transition-all relative ${mixWithInstrumental ? 'bg-cyan-500' : isDarkMode ? 'bg-white/10' : 'bg-gray-300'}`}>
                        <span className={`absolute top-1 w-4 h-4 rounded-full bg-white shadow transition-all ${mixWithInstrumental ? 'left-5' : 'left-1'}`} />
                      </button>
                    </div>
                  </div>

                  {/* Synthesise button */}
                  <button onClick={handleVocalSynth} disabled={vocalSynthing || !lyrics.trim() || paymentProcessing || !walletAddress}
                    className="flex items-center justify-center gap-2 py-3.5 px-6 rounded-xl font-bold text-sm transition-all disabled:opacity-60"
                    style={{ background: 'linear-gradient(135deg, #34d399, #7c3aed)', color: 'white',
                      boxShadow: vocalSynthing ? 'none' : '0 0 30px rgba(52,211,153,0.3)' }}>
                    {paymentProcessing ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Confirming payment...
                      </>
                    ) : vocalSynthing ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Cloning voice + syncing to beat... (3–5 min)
                      </>
                    ) : (
                      <>
                        <Mic className="w-4 h-4" />
                        Synthesize Vocals ({STUDIO_PRICES[2].label})
                      </>
                    )}
                  </button>

                  {vocalSynthError && (
                    <p className="text-sm text-red-400 bg-red-500/10 rounded-lg p-3">{vocalSynthError}</p>
                  )}

                  {/* Result */}
                  {vocalSynthResult && (
                    <div className={`rounded-xl p-4 border ${isDarkMode ? 'bg-emerald-500/10 border-emerald-500/30' : 'bg-emerald-50 border-emerald-200'}`}>
                      {/* Stats row */}
                      <div className="flex items-center gap-4 mb-3">
                        <div className="flex items-center gap-1.5">
                          <Check className="w-4 h-4 text-emerald-400" />
                          <span className={`text-xs font-semibold ${isDarkMode ? 'text-emerald-300' : 'text-emerald-700'}`}>
                            Vocals synthesised
                          </span>
                        </div>
                        <span className={`text-xs px-2 py-0.5 rounded-full ${isDarkMode ? 'bg-white/10 text-gray-300' : 'bg-gray-200 text-gray-600'}`}>
                          {vocalSynthResult.detectedBpm} BPM
                        </span>
                        <span className={`text-xs px-2 py-0.5 rounded-full ${isDarkMode ? 'bg-white/10 text-gray-300' : 'bg-gray-200 text-gray-600'}`}>
                          {vocalSynthResult.lineCount} lines
                        </span>
                        <span className={`text-xs px-2 py-0.5 rounded-full ${isDarkMode ? 'bg-white/10 text-gray-300' : 'bg-gray-200 text-gray-600'}`}>
                          {fmtTime(vocalSynthResult.durationSeconds)}
                        </span>
                      </div>

                      {/* Preview player */}
                      <div className={`flex items-center gap-3 rounded-lg p-2.5 mb-3 ${isDarkMode ? 'bg-black/40' : 'bg-white'}`}>
                        <button onClick={toggleVocalPreview}
                          className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0"
                          style={{ background: 'linear-gradient(135deg, #34d399, #7c3aed)' }}>
                          {vocalPreviewPlaying
                            ? <Pause className="w-3.5 h-3.5 text-white" />
                            : <Play className="w-3.5 h-3.5 text-white" />}
                        </button>
                        <div className="flex-1">
                          <p className={`text-xs font-medium ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                            {cloneVoice ? 'Cloned voice · ' : 'AI voice · '}
                            {beatsPerLine} beats/line · {vocalSynthResult.detectedBpm} BPM
                          </p>
                          <p className={`text-[10px] ${isDarkMode ? 'text-gray-500' : 'text-gray-400'}`}>
                            {vocalSynthResult.lineCount} lyric lines · {fmtTime(vocalSynthResult.durationSeconds)}
                          </p>
                        </div>
                        <a href={vocalSynthResult.gatewayUrl} target="_blank" rel="noopener noreferrer"
                          className="text-cyan-400 hover:text-cyan-300">
                          <ExternalLink className="w-3.5 h-3.5" />
                        </a>
                      </div>

                      {/* Mint */}
                      <div className="space-y-3">
                        <div className="flex items-center gap-3">
                          <label className={`text-xs ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>Mint Price (WMON)</label>
                          <input type="number" min="0.001" step="0.001" value={mintPrice}
                            onChange={e => setMintPrice(e.target.value)}
                            className={`w-28 px-3 py-1.5 rounded-lg text-sm border outline-none ${isDarkMode ? 'bg-black/50 border-white/10 text-white' : 'bg-white border-gray-300 text-gray-900'}`} />
                        </div>
                        {mintTxHash ? (
                          <div className={`flex items-center gap-2 p-2.5 rounded-lg ${isDarkMode ? 'bg-cyan-500/10 border border-cyan-500/30' : 'bg-cyan-50 border border-cyan-200'}`}>
                            <Check className="w-4 h-4 text-cyan-400" />
                            <span className="text-xs text-cyan-400">Vocal track minted on Monad! TX: {mintTxHash.slice(0, 12)}...</span>
                          </div>
                        ) : (
                          <button onClick={handleMint} disabled={minting || !walletAddress}
                            className="flex items-center gap-2 py-2.5 px-5 rounded-xl font-semibold text-sm transition-all disabled:opacity-60"
                            style={{ background: 'linear-gradient(135deg, #f59e0b, #ec4899)', color: 'white' }}>
                            {minting
                              ? <><Loader2 className="w-4 h-4 animate-spin" /> Minting...</>
                              : <><Music2 className="w-4 h-4" /> Mint Vocal Track ({mintPrice} WMON)</>
                            }
                          </button>
                        )}
                        {mintError && <p className="text-xs text-red-400 bg-red-500/10 rounded-lg p-2">{mintError}</p>}
                      </div>
                    </div>
                  )}
                </>
              )}
            </>
          )}

          {/* ════════════════════════════════════════════════════════════
              MODE: Freestyle
          ════════════════════════════════════════════════════════════ */}
          {mode === 'freestyle' && (
            <>
              {!jobId ? (
                <div className={`rounded-xl p-4 border ${isDarkMode ? 'bg-amber-500/10 border-amber-500/30' : 'bg-amber-50 border-amber-200'}`}>
                  <div className="flex items-start gap-2">
                    <Zap className="w-4 h-4 text-amber-400 flex-shrink-0 mt-0.5" />
                    <div>
                      <p className={`text-xs font-semibold ${isDarkMode ? 'text-amber-300' : 'text-amber-700'}`}>Stem separation required first</p>
                      <p className={`text-xs mt-0.5 ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                        Go to <strong>Stem Mixer</strong>, select a Music NFT, separate stems — then freestyle over the beat.
                      </p>
                    </div>
                  </div>
                </div>
              ) : (
                <>
                  {/* Explainer */}
                  <div className={`rounded-xl p-3 ${isDarkMode ? 'bg-purple-500/10 border border-purple-500/20' : 'bg-purple-50 border border-purple-200'}`}>
                    <div className="flex items-start gap-2">
                      <Zap className="w-4 h-4 text-purple-400 flex-shrink-0 mt-0.5" />
                      <div>
                        <p className={`text-xs font-semibold ${isDarkMode ? 'text-purple-300' : 'text-purple-700'}`}>
                          Freestyle Mode — real-time AI vocal generation
                        </p>
                        <p className={`text-xs mt-0.5 ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                          Claude generates original lyrics bar-by-bar as the instrumental plays.
                          XTTS v2 synthesises each bar in the singer's cloned voice and schedules
                          it to land exactly on the beat — in real time, no pre-writing needed.
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Settings */}
                  <div className="grid grid-cols-2 gap-3">
                    {/* Theme */}
                    <div className={`col-span-2 rounded-xl p-3 ${isDarkMode ? 'bg-white/5' : 'bg-gray-50'}`}>
                      <label className={`text-xs font-medium block mb-1.5 ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                        Freestyle theme / topic
                      </label>
                      <input
                        value={freestyleTheme}
                        onChange={e => setFreestyleTheme(e.target.value)}
                        placeholder="e.g. midnight city, hustle, love lost, the cosmos..."
                        className={`w-full px-3 py-2 rounded-lg text-sm outline-none border transition-colors ${
                          isDarkMode
                            ? 'bg-black/50 border-white/10 text-white placeholder-gray-600 focus:border-purple-500/50'
                            : 'bg-white border-gray-300 text-gray-900 placeholder-gray-400 focus:border-purple-400'
                        }`}
                      />
                    </div>

                    {/* Genre hint */}
                    <div className={`rounded-xl p-3 ${isDarkMode ? 'bg-white/5' : 'bg-gray-50'}`}>
                      <label className={`text-xs font-medium block mb-1.5 ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>Style</label>
                      <select value={freestyleGenreHint} onChange={e => setFreestyleGenreHint(e.target.value)}
                        className={`w-full px-2 py-1.5 rounded-lg text-xs outline-none border ${isDarkMode ? 'bg-black/50 border-white/10 text-white' : 'bg-white border-gray-300 text-gray-900'}`}>
                        {['hip_hop','trap','drill','r_and_b','pop','reggae','country','spoken_word'].map(g => (
                          <option key={g} value={g}>{g.replace(/_/g, ' ')}</option>
                        ))}
                      </select>
                    </div>

                    {/* Bars */}
                    <div className={`rounded-xl p-3 ${isDarkMode ? 'bg-white/5' : 'bg-gray-50'}`}>
                      <label className={`text-xs font-medium block mb-1.5 ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>Bars</label>
                      <div className="flex gap-1.5">
                        {[8, 16, 24, 32].map(b => (
                          <button key={b} onClick={() => setFreestyleMaxBars(b)}
                            className={`flex-1 py-1 rounded-lg text-xs font-bold transition-all ${
                              freestyleMaxBars === b
                                ? 'bg-gradient-to-r from-purple-500 to-cyan-500 text-white'
                                : isDarkMode ? 'bg-white/10 text-gray-400 hover:bg-white/20' : 'bg-gray-200 text-gray-600'
                            }`}>{b}</button>
                        ))}
                      </div>
                    </div>

                    {/* Beats per bar + intro */}
                    <div className={`rounded-xl p-3 ${isDarkMode ? 'bg-white/5' : 'bg-gray-50'}`}>
                      <label className={`text-xs font-medium block mb-1.5 ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>Beats / bar</label>
                      <div className="flex gap-1.5">
                        {[2, 4, 8].map(b => (
                          <button key={b} onClick={() => setFreestyleBeatsPerBar(b)}
                            className={`flex-1 py-1 rounded-lg text-xs font-bold transition-all ${
                              freestyleBeatsPerBar === b
                                ? 'bg-gradient-to-r from-purple-500 to-cyan-500 text-white'
                                : isDarkMode ? 'bg-white/10 text-gray-400 hover:bg-white/20' : 'bg-gray-200 text-gray-600'
                            }`}>{b}</button>
                        ))}
                      </div>
                    </div>

                    <div className={`rounded-xl p-3 ${isDarkMode ? 'bg-white/5' : 'bg-gray-50'}`}>
                      <label className={`text-xs font-medium block mb-1.5 ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>Intro beats</label>
                      <div className="flex gap-1.5">
                        {[0, 4, 8].map(b => (
                          <button key={b} onClick={() => setFreestyleIntroBeats(b)}
                            className={`flex-1 py-1 rounded-lg text-xs font-bold transition-all ${
                              freestyleIntroBeats === b
                                ? 'bg-gradient-to-r from-purple-500 to-cyan-500 text-white'
                                : isDarkMode ? 'bg-white/10 text-gray-400 hover:bg-white/20' : 'bg-gray-200 text-gray-600'
                            }`}>{b === 0 ? '—' : b}</button>
                        ))}
                      </div>
                    </div>

                    {/* Voice clone toggle */}
                    <div className={`col-span-2 rounded-xl p-3 flex items-center justify-between ${isDarkMode ? 'bg-white/5' : 'bg-gray-50'}`}>
                      <div>
                        <p className={`text-xs font-medium ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>Clone singer's voice</p>
                        <p className={`text-[10px] mt-0.5 ${isDarkMode ? 'text-gray-500' : 'text-gray-400'}`}>
                          {freestyleCloneVoice ? 'Freestyle vocals sound like the original artist' : 'Default XTTS natural voice'}
                        </p>
                      </div>
                      <button onClick={() => setFreestyleCloneVoice(v => !v)}
                        className={`w-10 h-6 rounded-full transition-all relative ${freestyleCloneVoice ? 'bg-purple-500' : isDarkMode ? 'bg-white/10' : 'bg-gray-300'}`}>
                        <span className={`absolute top-1 w-4 h-4 rounded-full bg-white shadow transition-all ${freestyleCloneVoice ? 'left-5' : 'left-1'}`} />
                      </button>
                    </div>
                  </div>

                  {/* Go / Stop button */}
                  <button
                    onClick={freestyling ? stopFreestyle : handleFreestyle}
                    disabled={!freestyling && (paymentProcessing || !walletAddress)}
                    className="flex items-center justify-center gap-2 py-4 px-6 rounded-xl font-bold text-sm transition-all disabled:opacity-60"
                    style={{
                      background: freestyling
                        ? 'linear-gradient(135deg, #ef4444, #b91c1c)'
                        : 'linear-gradient(135deg, #a855f7, #06b6d4)',
                      color: 'white',
                      boxShadow: freestyling ? '0 0 30px rgba(239,68,68,0.4)' : '0 0 30px rgba(168,85,247,0.4)',
                    }}>
                    {paymentProcessing ? (
                      <><Loader2 className="w-4 h-4 animate-spin" /> Confirming payment...</>
                    ) : freestyling ? (
                      <><Square className="w-4 h-4" /> Stop Freestyle</>
                    ) : (
                      <><Zap className="w-4 h-4" /> Start Freestyle ({STUDIO_PRICES[3].label})</>
                    )}
                  </button>

                  {freestyleError && (
                    <p className="text-sm text-red-400 bg-red-500/10 rounded-lg p-3">{freestyleError}</p>
                  )}

                  {/* Live lyric ticker */}
                  {(freestyling || freestyleBars.length > 0) && (
                    <div className={`rounded-xl overflow-hidden border ${isDarkMode ? 'bg-black/60 border-purple-500/20' : 'bg-gray-900 border-purple-400/20'}`}>
                      {/* Header bar */}
                      <div className="flex items-center justify-between px-3 py-2 border-b border-white/10">
                        <div className="flex items-center gap-2">
                          {freestyling && (
                            <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
                          )}
                          <span className="text-xs font-mono text-purple-300">LIVE LYRICS</span>
                        </div>
                        <div className="flex items-center gap-3 text-[10px] font-mono text-gray-500">
                          {freestyleBpm && <span>{freestyleBpm} BPM</span>}
                          <span>{freestyleBars.length}/{freestyleMaxBars} bars</span>
                          {freestyleDone && <span className="text-emerald-400">DONE</span>}
                        </div>
                      </div>

                      {/* Scrolling lyric lines */}
                      <div className="p-3 space-y-1 max-h-52 overflow-y-auto">
                        {freestyleBars.length === 0 && freestyling && (
                          <div className="flex items-center gap-2 text-xs text-gray-500 animate-pulse">
                            <Loader2 className="w-3 h-3 animate-spin" />
                            Generating first bar...
                          </div>
                        )}
                        {freestyleBars.map((b, i) => (
                          <div key={b.bar}
                            className={`flex items-baseline gap-2 text-sm font-mono transition-all ${
                              i === freestyleBars.length - 1 && freestyling
                                ? 'text-white scale-[1.02] origin-left'
                                : 'text-gray-400'
                            }`}>
                            <span className="text-[10px] text-purple-500 w-6 flex-shrink-0">
                              {b.bar + 1}
                            </span>
                            <span>{b.line}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              )}
            </>
          )}

        </div>
      </div>
    </div>,
    document.body
  );
};
