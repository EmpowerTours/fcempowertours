'use client';

import React, { useState } from 'react';
import { X, ArrowLeft } from 'lucide-react';
import { useFarcasterContext } from '@/app/hooks/useFarcasterContext';
import { useBotCommand } from '@/app/hooks/useBotCommand';

interface CreateNFTModalProps {
  onClose: () => void;
}

const steps = [
  { number: 1, title: 'Choose Type', icon: '🎨' },
  { number: 2, title: 'Upload Files', icon: '📁' },
  { number: 3, title: 'Set Details', icon: '✏️' },
  { number: 4, title: 'Review & Mint', icon: '🚀' },
];

export function CreateNFTModal({ onClose }: CreateNFTModalProps) {
  console.log('[CreateNFTModal] Component rendering');
  const { user, walletAddress, requestWallet } = useFarcasterContext();
  const { executeCommand, loading: botLoading, error: botError } = useBotCommand();

  const [previewFile, setPreviewFile] = useState<File | null>(null);
  const [fullFile, setFullFile] = useState<File | null>(null);
  const [coverFile, setCoverFile] = useState<File | null>(null);
  const [title, setTitle] = useState('');
  const [price, setPrice] = useState('1');
  const [uploading, setUploading] = useState(false);
  const [minting, setMinting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<{ tokenId: number; txHash: string; title: string; price: string } | null>(null);
  const [currentStep, setCurrentStep] = useState(1);
  const [nftType, setNftType] = useState<'music' | 'art'>('music');
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [audioDuration, setAudioDuration] = useState(0);
  const [trimStart, setTrimStart] = useState(0);
  const [trimEnd, setTrimEnd] = useState(5);
  const [isPlaying, setIsPlaying] = useState(false);
  const [audioElement, setAudioElement] = useState<HTMLAudioElement | null>(null);

  const farcasterFid = user?.fid || 0;

  // Resize image using canvas
  const resizeImage = async (file: File, maxWidth: number = 1200, maxHeight: number = 1200, quality: number = 0.85): Promise<File> => {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        let { width, height } = img;

        if (width > maxWidth || height > maxHeight) {
          const ratio = Math.min(maxWidth / width, maxHeight / height);
          width = Math.round(width * ratio);
          height = Math.round(height * ratio);
        }

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('Failed to get canvas context'));
          return;
        }

        ctx.drawImage(img, 0, 0, width, height);

        canvas.toBlob(
          (blob) => {
            if (!blob) {
              reject(new Error('Failed to create blob'));
              return;
            }
            const resizedFile = new File([blob], file.name, { type: 'image/jpeg' });
            resolve(resizedFile);
          },
          'image/jpeg',
          quality
        );
      };
      img.onerror = () => reject(new Error('Failed to load image'));
      img.src = URL.createObjectURL(file);
    });
  };

  const handleFileChange =
    (setter: React.Dispatch<React.SetStateAction<File | null>>) =>
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      if (e.target.files) {
        let file = e.target.files[0];

        if (setter === setCoverFile && file.type.startsWith('image/')) {
          try {
            file = await resizeImage(file, 1200, 1200, 0.85);
          } catch (err) {
            console.warn('Failed to resize image, using original:', err);
          }
        }

        setter(file);

        if (setter === setFullFile) {
          const url = URL.createObjectURL(file);
          setAudioUrl(url);

          const audio = new Audio(url);
          audio.addEventListener('loadedmetadata', () => {
            setAudioDuration(audio.duration);
            setTrimStart(0);
            setTrimEnd(Math.min(5, audio.duration));
          });
          setAudioElement(audio);
        }
      }
    };

  const trimAudio = async (file: File, startTime: number, endTime: number): Promise<File> => {
    return new Promise((resolve, reject) => {
      const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
      const reader = new FileReader();

      reader.onload = async (e) => {
        try {
          const arrayBuffer = e.target?.result as ArrayBuffer;
          const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);

          const sampleRate = audioBuffer.sampleRate;
          const startOffset = Math.floor(startTime * sampleRate);
          const endOffset = Math.floor(endTime * sampleRate);
          const frameCount = endOffset - startOffset;

          const trimmedBuffer = audioContext.createBuffer(
            audioBuffer.numberOfChannels,
            frameCount,
            sampleRate
          );

          for (let channel = 0; channel < audioBuffer.numberOfChannels; channel++) {
            const sourceData = audioBuffer.getChannelData(channel);
            const targetData = trimmedBuffer.getChannelData(channel);
            for (let i = 0; i < frameCount; i++) {
              targetData[i] = sourceData[startOffset + i];
            }
          }

          const wav = audioBufferToWav(trimmedBuffer);
          const blob = new Blob([wav], { type: 'audio/wav' });
          const trimmedFile = new File([blob], 'preview.wav', { type: 'audio/wav' });

          resolve(trimmedFile);
        } catch (error) {
          reject(error);
        }
      };

      reader.onerror = reject;
      reader.readAsArrayBuffer(file);
    });
  };

  const audioBufferToWav = (buffer: AudioBuffer): ArrayBuffer => {
    const numOfChan = buffer.numberOfChannels;
    const length = buffer.length * numOfChan * 2 + 44;
    const arrayBuffer = new ArrayBuffer(length);
    const view = new DataView(arrayBuffer);
    const channels = [];
    let pos = 0;

    const setUint16 = (data: number) => {
      view.setUint16(pos, data, true);
      pos += 2;
    };
    const setUint32 = (data: number) => {
      view.setUint32(pos, data, true);
      pos += 4;
    };

    setUint32(0x46464952); // "RIFF"
    setUint32(length - 8);
    setUint32(0x45564157); // "WAVE"
    setUint32(0x20746d66); // "fmt "
    setUint32(16);
    setUint16(1); // PCM
    setUint16(numOfChan);
    setUint32(buffer.sampleRate);
    setUint32(buffer.sampleRate * 2 * numOfChan);
    setUint16(numOfChan * 2);
    setUint16(16);
    setUint32(0x61746164); // "data"
    setUint32(length - pos - 4);

    for (let i = 0; i < buffer.numberOfChannels; i++) {
      channels.push(buffer.getChannelData(i));
    }

    let offset = 0;
    while (pos < length) {
      for (let i = 0; i < numOfChan; i++) {
        let sample = Math.max(-1, Math.min(1, channels[i][offset]));
        sample = sample < 0 ? sample * 0x8000 : sample * 0x7fff;
        view.setInt16(pos, sample, true);
        pos += 2;
      }
      offset++;
    }

    return arrayBuffer;
  };

  const playPreview = () => {
    if (audioElement) {
      audioElement.currentTime = trimStart;
      audioElement.play();
      setIsPlaying(true);

      setTimeout(() => {
        audioElement.pause();
        setIsPlaying(false);
      }, (trimEnd - trimStart) * 1000);
    }
  };

  const uploadAndMint = async () => {
    if (previewFile && previewFile.size > 600 * 1024) {
      setError(`Preview audio too large: ${(previewFile.size / 1024).toFixed(0)}KB (max 600KB)`);
      return;
    }
    if (fullFile && fullFile.size > 15 * 1024 * 1024) {
      setError(`Full track too large: ${(fullFile.size / 1024 / 1024).toFixed(1)}MB (max 15MB)`);
      return;
    }
    if (coverFile && coverFile.size > 3 * 1024 * 1024) {
      setError(`Cover art too large: ${(coverFile.size / 1024 / 1024).toFixed(1)}MB (max 3MB)`);
      return;
    }

    const isArtOnly = !previewFile && !fullFile;

    if (!coverFile || !title) {
      const missing = [];
      if (!coverFile) missing.push('Cover Art');
      if (!title) missing.push('Title');
      setError(`Please fill required fields: ${missing.join(', ')}`);
      return;
    }

    if (previewFile && !fullFile) {
      setError('If providing a preview, please also provide the full track');
      return;
    }
    const priceNum = parseFloat(price);
    if (isNaN(priceNum) || priceNum < 1) {
      setError('Price must be at least 1 WMON');
      return;
    }
    if (!walletAddress) {
      setError('Please connect your wallet first');
      await requestWallet();
      return;
    }

    setUploading(true);
    setError(null);

    try {
      const formData = new FormData();

      let actualPreviewFile = previewFile;
      if (!previewFile && fullFile && nftType === 'music') {
        console.log(`🎬 Auto-trimming preview from ${trimStart}s to ${trimEnd}s`);
        actualPreviewFile = await trimAudio(fullFile, trimStart, trimEnd);
      }

      if (actualPreviewFile) {
        formData.append('previewAudio', actualPreviewFile);
      }
      if (fullFile) {
        formData.append('fullAudio', fullFile);
      }
      formData.append('cover', coverFile);
      formData.append('description', title);
      formData.append('address', walletAddress);
      formData.append('fid', farcasterFid?.toString() || '0');
      formData.append('isArtOnly', isArtOnly.toString());

      const uploadRes = await fetch('/api/upload', {
        method: 'POST',
        body: formData,
      });

      if (!uploadRes.ok) {
        const errorData = await uploadRes.json();
        throw new Error(errorData.error || 'Upload failed');
      }

      const uploadData = await uploadRes.json();
      const tokenURI = uploadData.tokenURI || `ipfs://${uploadData.metadataCid}`;
      const coverUrl = uploadData.coverUrl || `ipfs://${uploadData.coverCid}`;

      setUploading(false);
      setMinting(true);

      const command = `mint_music ${title.slice(0, 50)} ${tokenURI} ${price}`;

      const mintData = await executeCommand(command, {
        imageUrl: coverUrl,
        title,
        tokenURI,
        is_art: nftType === 'art',
      });

      if (!mintData.success) {
        throw new Error(mintData.error || mintData.message || 'Mint failed');
      }

      const tokenId = mintData.tokenId ? parseInt(String(mintData.tokenId)) : Math.floor(Math.random() * 10000);
      const txHash = mintData.txHash || '';

      setSuccess({ tokenId, txHash, title, price });
      setPreviewFile(null);
      setFullFile(null);
      setCoverFile(null);
      setTitle('');
      setPrice('0.01');
    } catch (err: any) {
      console.error('❌ Error:', err);
      setError(err.message || 'Something went wrong');
    } finally {
      setUploading(false);
      setMinting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/95 backdrop-blur-xl z-[9999] flex items-center justify-center p-4 overflow-y-auto">
      <div className="w-full max-w-4xl bg-gradient-to-br from-gray-900 via-purple-900/20 to-black border border-cyan-500/30 rounded-3xl shadow-2xl shadow-purple-500/20 my-8 relative overflow-hidden">
        {/* Animated gradient background */}
        <div className="absolute inset-0 bg-gradient-to-br from-cyan-500/5 via-purple-500/5 to-pink-500/5 animate-pulse" />
        <div className="absolute top-0 right-0 w-96 h-96 bg-cyan-500/10 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2" />
        <div className="absolute bottom-0 left-0 w-96 h-96 bg-purple-500/10 rounded-full blur-3xl translate-y-1/2 -translate-x-1/2" />
        <div className="relative p-8">
          {/* Header */}
          <div className="flex items-center justify-between mb-6">
            <div>
              <h1 className="text-3xl font-bold text-white mb-2">Create Your NFT</h1>
              <p className="text-gray-400">Choose music or art, upload files, and mint on Monad</p>
            </div>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-white transition-colors"
            >
              <X className="w-6 h-6" />
            </button>
          </div>

          {/* Free Mint Badge */}
          <div className="mb-6 p-3 bg-gradient-to-r from-green-500/20 to-emerald-500/20 rounded-lg border border-green-500/30">
            <p className="text-sm font-bold text-green-400 text-center">✨ FREE Mint! We pay all gas fees</p>
          </div>

          {/* Progress Stepper */}
          <div className="mb-8">
            <div className="flex items-center justify-between">
              {steps.map((step, index) => (
                <div key={step.number} className="flex items-center flex-1">
                  <div className="flex flex-col items-center flex-1">
                    <div
                      className={`w-12 h-12 rounded-full flex items-center justify-center text-xl font-bold transition-all ${
                        currentStep >= step.number
                          ? 'bg-gradient-to-r from-cyan-500 to-purple-600 text-white scale-110 shadow-lg'
                          : 'bg-gray-800 text-gray-500'
                      }`}
                    >
                      {step.icon}
                    </div>
                    <div className="mt-2 text-center">
                      <p
                        className={`text-xs font-medium ${
                          currentStep >= step.number ? 'text-cyan-400' : 'text-gray-500'
                        }`}
                      >
                        {step.title}
                      </p>
                    </div>
                  </div>
                  {index < steps.length - 1 && (
                    <div
                      className={`h-1 flex-1 mx-2 rounded transition-all ${
                        currentStep > step.number
                          ? 'bg-gradient-to-r from-cyan-500 to-purple-600'
                          : 'bg-gray-800'
                      }`}
                    />
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* User Info */}
          {user && (
            <div className="mb-6 p-4 bg-cyan-500/10 rounded-lg border border-cyan-500/30">
              <p className="text-sm text-cyan-400">
                <strong>✅ Farcaster User:</strong> @{user.username || 'Unknown'}
              </p>
              {walletAddress && (
                <p className="text-sm text-cyan-400 mt-1 font-mono text-xs">
                  <strong>Wallet:</strong> {walletAddress.slice(0, 6)}...{walletAddress.slice(-4)}
                </p>
              )}
            </div>
          )}

          {/* Errors */}
          {(error || botError) && (
            <div className="mb-6 p-4 bg-red-500/20 border border-red-500/30 rounded-lg">
              <p className="text-red-400 font-medium">❌ {error || botError}</p>
            </div>
          )}

          {/* Success */}
          {success && (
            <div className="mb-6 p-6 bg-gradient-to-r from-green-500/20 to-emerald-500/20 border border-green-500/40 rounded-2xl">
              <p className="text-green-400 font-bold text-xl mb-3">🎉 NFT Minted Successfully!</p>
              <div className="space-y-2 text-sm">
                <p className="text-green-300">
                  <strong className="text-green-400">Token ID:</strong> #{success.tokenId}
                </p>
                <p className="text-green-300">
                  <strong className="text-green-400">Title:</strong> {success.title || 'Untitled'}
                </p>
                <p className="text-green-300">
                  <strong className="text-green-400">Price:</strong> {success.price} WMON per license
                </p>
                {success.txHash && (
                  <a
                    href={`https://testnet.monadscan.com/tx/${success.txHash}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-block px-4 py-2 bg-gradient-to-r from-cyan-500 to-purple-600 text-white rounded-lg hover:from-cyan-400 hover:to-purple-500 font-medium mt-3 transition-all"
                  >
                    View on Monadscan →
                  </a>
                )}
              </div>
            </div>
          )}

          {/* Step Content */}
          <div className="space-y-6">
            {/* STEP 1: Choose NFT Type */}
            {currentStep === 1 && (
              <div className="space-y-4">
                <h2 className="text-2xl font-bold text-white mb-4">What would you like to create?</h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <button
                    onClick={() => {
                      setNftType('music');
                      setCurrentStep(2);
                    }}
                    className="p-8 bg-gradient-to-br from-purple-500/20 to-pink-500/20 rounded-2xl border-2 border-purple-500/30 hover:border-purple-500 hover:scale-105 transition-all"
                  >
                    <div className="text-6xl mb-4">🎵</div>
                    <h3 className="text-2xl font-bold text-white mb-2">Music NFT</h3>
                    <p className="text-gray-400">Upload cover art + audio files</p>
                    <div className="mt-4 text-sm text-purple-400 font-medium">Cover + Preview + Full Track →</div>
                  </button>

                  <button
                    onClick={() => {
                      setNftType('art');
                      setCurrentStep(2);
                    }}
                    className="p-8 bg-gradient-to-br from-blue-500/20 to-cyan-500/20 rounded-2xl border-2 border-blue-500/30 hover:border-blue-500 hover:scale-105 transition-all"
                  >
                    <div className="text-6xl mb-4">🎨</div>
                    <h3 className="text-2xl font-bold text-white mb-2">Art NFT</h3>
                    <p className="text-gray-400">Upload only cover art</p>
                    <div className="mt-4 text-sm text-blue-400 font-medium">Cover Art Only →</div>
                  </button>
                </div>
              </div>
            )}

            {/* STEP 2: Upload Files */}
            {currentStep === 2 && (
              <div className="space-y-6">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-2xl font-bold text-white">
                    Upload Your {nftType === 'music' ? 'Music' : 'Art'} Files
                  </h2>
                  <button
                    onClick={() => setCurrentStep(1)}
                    className="px-4 py-2 bg-gray-800 text-gray-300 rounded-lg hover:bg-gray-700 flex items-center gap-2"
                  >
                    <ArrowLeft className="w-4 h-4" />
                    Back
                  </button>
                </div>

                {/* Cover Art Upload */}
                <div className="p-6 bg-gradient-to-br from-gray-800 to-gray-900 rounded-2xl border-2 border-dashed border-gray-600">
                  <label className="block cursor-pointer">
                    <div className="text-center">
                      {coverFile ? (
                        <div>
                          <img
                            src={URL.createObjectURL(coverFile)}
                            alt="Cover"
                            className="w-64 h-64 object-cover rounded-xl mx-auto mb-4 shadow-lg"
                          />
                          <p className="text-green-400 font-bold text-lg">✓ {coverFile.name}</p>
                          <p className="text-gray-500 text-sm">{(coverFile.size / 1024).toFixed(0)}KB</p>
                        </div>
                      ) : (
                        <div className="py-12">
                          <div className="text-6xl mb-4">🖼️</div>
                          <p className="text-xl font-bold text-gray-300">Click to upload cover art</p>
                          <p className="text-sm text-gray-500 mt-2">JPG, PNG, or WebP - Max 3MB</p>
                        </div>
                      )}
                    </div>
                    <input
                      type="file"
                      accept="image/*"
                      onChange={handleFileChange(setCoverFile)}
                      className="hidden"
                    />
                  </label>
                </div>

                {/* Audio Files (only for music NFTs) */}
                {nftType === 'music' && (
                  <>
                    <div className="p-6 bg-gradient-to-br from-purple-900/30 to-pink-900/30 rounded-2xl border-2 border-dashed border-purple-500/30">
                      <label className="block cursor-pointer">
                        <div className="text-center">
                          {previewFile ? (
                            <div className="py-6">
                              <div className="text-5xl mb-3">🎧</div>
                              <p className="text-purple-400 font-bold text-lg">✓ Preview Audio</p>
                              <p className="text-gray-300">{previewFile.name}</p>
                              <p className="text-gray-500 text-sm">{(previewFile.size / 1024).toFixed(0)}KB</p>
                            </div>
                          ) : (
                            <div className="py-8">
                              <div className="text-5xl mb-3">🎧</div>
                              <p className="text-xl font-bold text-gray-300">Upload Preview Audio (Optional)</p>
                              <p className="text-sm text-gray-500 mt-2">MP3, WAV, M4A - Max 600KB</p>
                              <p className="text-xs text-purple-400 font-medium mt-2">
                                💡 Or skip - we'll auto-generate a 5s preview!
                              </p>
                            </div>
                          )}
                        </div>
                        <input
                          type="file"
                          accept="audio/mpeg,audio/mp3,audio/wav,audio/x-wav,audio/x-m4a,audio/aac,audio/ogg,.mp3,.wav,.m4a,.aac,.ogg"
                          onChange={handleFileChange(setPreviewFile)}
                          className="hidden"
                        />
                      </label>
                    </div>

                    <div className="p-6 bg-gradient-to-br from-blue-900/30 to-cyan-900/30 rounded-2xl border-2 border-dashed border-blue-500/30">
                      <label className="block cursor-pointer">
                        <div className="text-center">
                          {fullFile ? (
                            <div className="py-6">
                              <div className="text-5xl mb-3">🎵</div>
                              <p className="text-blue-400 font-bold text-lg">✓ Full Track</p>
                              <p className="text-gray-300">{fullFile.name}</p>
                              <p className="text-gray-500 text-sm">{(fullFile.size / 1024 / 1024).toFixed(2)}MB</p>
                            </div>
                          ) : (
                            <div className="py-8">
                              <div className="text-5xl mb-3">🎵</div>
                              <p className="text-xl font-bold text-gray-300">Upload Full Track</p>
                              <p className="text-sm text-gray-500 mt-2">MP3, WAV, M4A - Max 15MB</p>
                            </div>
                          )}
                        </div>
                        <input
                          type="file"
                          accept="audio/mpeg,audio/mp3,audio/wav,audio/x-wav,audio/x-m4a,audio/aac,audio/ogg,.mp3,.wav,.m4a,.aac,.ogg"
                          onChange={handleFileChange(setFullFile)}
                          className="hidden"
                        />
                      </label>
                    </div>

                    {/* Audio Trimmer */}
                    {fullFile && !previewFile && audioUrl && (
                      <div className="p-6 bg-gradient-to-br from-yellow-900/30 to-orange-900/30 rounded-2xl border-2 border-yellow-500/30">
                        <h3 className="text-xl font-bold text-white mb-4">✂️ Select 5-Second Preview</h3>
                        <p className="text-sm text-gray-400 mb-4">
                          Choose which part of your track to use as the preview
                        </p>

                        <div className="mb-4">
                          <div className="relative h-16 bg-gradient-to-r from-purple-500/30 to-pink-500/30 rounded-lg overflow-hidden">
                            <div
                              className="absolute top-0 h-full bg-gradient-to-r from-purple-500 to-pink-500 opacity-50"
                              style={{
                                left: `${(trimStart / audioDuration) * 100}%`,
                                width: `${((trimEnd - trimStart) / audioDuration) * 100}%`,
                              }}
                            />
                            <div className="absolute inset-0 flex items-center justify-between px-2 text-xs text-white font-bold">
                              <span>0:00</span>
                              <span>{Math.floor(audioDuration / 60)}:{String(Math.floor(audioDuration % 60)).padStart(2, '0')}</span>
                            </div>
                          </div>

                          <div className="flex justify-between items-center mt-2 text-sm text-gray-400">
                            <span>Start: {trimStart.toFixed(1)}s</span>
                            <span className="font-bold text-purple-400">{(trimEnd - trimStart).toFixed(1)}s preview</span>
                            <span>End: {trimEnd.toFixed(1)}s</span>
                          </div>
                        </div>

                        <div className="space-y-4">
                          <div>
                            <label className="text-sm font-medium text-gray-400">Start Time</label>
                            <input
                              type="range"
                              min="0"
                              max={Math.max(0, audioDuration - 5)}
                              step="0.1"
                              value={trimStart}
                              onChange={(e) => {
                                const newStart = parseFloat(e.target.value);
                                setTrimStart(newStart);
                                setTrimEnd(Math.min(newStart + 5, audioDuration));
                              }}
                              className="w-full h-2 bg-purple-500/30 rounded-lg appearance-none cursor-pointer"
                            />
                          </div>

                          <button
                            onClick={playPreview}
                            disabled={isPlaying}
                            className="w-full px-6 py-3 bg-gradient-to-r from-green-500 to-emerald-500 text-white rounded-xl font-bold hover:scale-105 disabled:opacity-50 transition-all"
                          >
                            {isPlaying ? '▶️ Playing...' : '▶️ Play Preview'}
                          </button>
                        </div>
                      </div>
                    )}
                  </>
                )}

                <button
                  onClick={() => setCurrentStep(3)}
                  disabled={!coverFile || (nftType === 'music' && !fullFile)}
                  className="w-full px-8 py-4 bg-gradient-to-r from-cyan-500 to-purple-600 text-white rounded-xl font-bold text-lg hover:scale-105 disabled:opacity-50 disabled:scale-100 transition-all"
                >
                  Continue to Details →
                </button>
              </div>
            )}

            {/* STEP 3: Set Details */}
            {currentStep === 3 && (
              <div className="space-y-6">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-2xl font-bold text-white">Set NFT Details</h2>
                  <button
                    onClick={() => setCurrentStep(2)}
                    className="px-4 py-2 bg-gray-800 text-gray-300 rounded-lg hover:bg-gray-700 flex items-center gap-2"
                  >
                    <ArrowLeft className="w-4 h-4" />
                    Back
                  </button>
                </div>

                <div className="p-6 bg-gradient-to-br from-purple-900/30 to-pink-900/30 rounded-2xl border-2 border-purple-500/30">
                  <label className="block text-xl font-bold text-white mb-4">
                    {nftType === 'music' ? '🎵 Song Title' : '🎨 Art Title'}
                  </label>
                  <input
                    type="text"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder={nftType === 'music' ? 'e.g., Money Making Machine - Electronic Mix' : 'e.g., Sunset Over Mountains'}
                    maxLength={200}
                    className="w-full px-6 py-4 text-lg bg-black/50 border-2 border-purple-500/30 rounded-xl text-white placeholder-gray-500 focus:ring-4 focus:ring-purple-500/50 focus:border-transparent"
                  />
                  <p className="text-sm text-gray-400 mt-2">{title.length}/200 characters</p>
                </div>

                <div className="p-6 bg-gradient-to-br from-cyan-900/30 to-blue-900/30 rounded-2xl border border-cyan-500/30">
                  <label className="block text-xl font-bold text-white mb-2">💰 License Price</label>
                  <p className="text-sm text-gray-400 mb-4">Set your price in WMON</p>

                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
                    {['1', '2', '5', '10'].map((p) => (
                      <button
                        key={p}
                        onClick={() => setPrice(p)}
                        className={`px-4 py-3 rounded-xl font-bold text-base transition-all ${
                          price === p
                            ? 'bg-gradient-to-r from-cyan-500 to-purple-600 text-white scale-105 shadow-lg shadow-cyan-500/30'
                            : 'bg-gray-800/80 text-gray-300 hover:scale-105 border border-gray-600 hover:border-cyan-500/50'
                        }`}
                      >
                        {p} WMON
                      </button>
                    ))}
                  </div>

                  <div className="relative">
                    <input
                      type="number"
                      step="0.1"
                      min="1"
                      value={price}
                      onChange={(e) => setPrice(e.target.value)}
                      placeholder="Custom price"
                      className="w-full px-6 py-4 text-lg bg-black/50 border border-cyan-500/30 rounded-xl text-white placeholder-gray-500 focus:ring-2 focus:ring-cyan-500/50 focus:border-cyan-500"
                    />
                    <span className="absolute right-6 top-1/2 -translate-y-1/2 text-cyan-400 font-bold pointer-events-none">WMON</span>
                  </div>
                  <p className="text-xs text-gray-500 mt-2">Minimum: 1 WMON</p>
                </div>

                <button
                  onClick={() => setCurrentStep(4)}
                  disabled={!title || !price}
                  className="w-full px-8 py-4 bg-gradient-to-r from-cyan-500 to-purple-600 text-white rounded-xl font-bold text-lg hover:scale-105 disabled:opacity-50 disabled:scale-100 transition-all"
                >
                  Review & Mint →
                </button>
              </div>
            )}

            {/* STEP 4: Review & Mint */}
            {currentStep === 4 && (
              <div className="space-y-6">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-2xl font-bold text-white">Review Your NFT</h2>
                  <button
                    onClick={() => setCurrentStep(3)}
                    className="px-4 py-2 bg-gray-800 text-gray-300 rounded-lg hover:bg-gray-700 flex items-center gap-2"
                  >
                    <ArrowLeft className="w-4 h-4" />
                    Back
                  </button>
                </div>

                {/* Preview Card */}
                <div className="p-8 bg-gradient-to-br from-purple-900/30 via-pink-900/30 to-blue-900/30 rounded-3xl border-4 border-purple-500/30 shadow-2xl">
                  <div className="flex flex-col md:flex-row gap-6 items-center">
                    {coverFile && (
                      <img
                        src={URL.createObjectURL(coverFile)}
                        alt="Preview"
                        className="w-48 h-48 object-cover rounded-2xl shadow-xl"
                      />
                    )}
                    <div className="flex-1">
                      <div className="text-sm font-bold text-purple-400 mb-2">
                        {nftType === 'music' ? '🎵 MUSIC NFT' : '🎨 ART NFT'}
                      </div>
                      <h3 className="text-3xl font-bold text-white mb-4">{title || 'Untitled'}</h3>
                      <div className="space-y-2 text-gray-300">
                        <p><strong>Type:</strong> {nftType === 'music' ? 'Music NFT' : 'Art NFT'}</p>
                        <p><strong>Price:</strong> {price} WMON</p>
                        <p><strong>Creator:</strong> @{user?.username || 'You'}</p>
                        {nftType === 'music' && (
                          <>
                            <p><strong>Preview:</strong> ✓ 5-second preview {previewFile ? `(${previewFile.name})` : '(auto-generated)'}</p>
                            <p><strong>Full Track:</strong> ✓ {fullFile?.name}</p>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Mint Button */}
                <button
                  onClick={uploadAndMint}
                  disabled={uploading || minting || botLoading}
                  className="w-full px-8 py-6 bg-gradient-to-r from-cyan-500 via-purple-600 to-pink-600 text-white rounded-2xl font-bold text-2xl hover:scale-105 disabled:opacity-50 disabled:scale-100 transition-all shadow-2xl"
                >
                  {uploading
                    ? '⏳ Uploading to IPFS...'
                    : minting || botLoading
                    ? '⚡ Minting NFT (FREE)...'
                    : `🚀 Mint NFT (FREE!)` }
                </button>

                {!walletAddress && (
                  <button
                    onClick={requestWallet}
                    className="w-full px-6 py-4 bg-yellow-500 text-black rounded-xl font-bold text-lg hover:bg-yellow-400 transition-all"
                  >
                    🔑 Connect Wallet First
                  </button>
                )}

                <div className="p-4 bg-green-500/20 rounded-xl border-2 border-green-500/30">
                  <p className="text-green-400 font-bold text-center">✨ FREE Mint! We pay all gas fees for you</p>
                </div>
              </div>
            )}
          </div>

          {/* Info Box */}
          <div className="mt-8 p-5 bg-gradient-to-r from-cyan-500/10 to-purple-500/10 rounded-2xl border border-cyan-500/20">
            <p className="text-sm text-cyan-400 font-bold mb-3">
              💡 How NFT Pricing Works:
            </p>
            <ul className="text-sm text-gray-300 space-y-2">
              <li className="flex items-start gap-2">
                <span className="text-cyan-400">•</span>
                <span>Set your price in WMON (minimum 1 WMON)</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-cyan-400">•</span>
                <span>You receive 90% of sales + royalties on resales</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-cyan-400">•</span>
                <span>Minting is FREE - we cover all gas costs</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-cyan-400">•</span>
                <span>Music NFTs include 5-second audio preview</span>
              </li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
