'use client';

import { useState } from 'react';
import { useFarcasterContext } from '@/app/hooks/useFarcasterContext';
import { useBotCommand } from '@/app/hooks/useBotCommand';

// Add animation styles
const styles = `
  @keyframes fadeIn {
    from { opacity: 0; transform: translateY(20px); }
    to { opacity: 1; transform: translateY(0); }
  }
  .animate-fadeIn {
    animation: fadeIn 0.5s ease-out;
  }
`;

// ✅ EmpowerToursNFTv5 with Music + Art support
const MUSIC_NFT_ADDRESS = process.env.NEXT_PUBLIC_NFT_CONTRACT || '0xb7c3565C2a00F29947219875AaE067c6cC36331a';

export default function MusicPage() {
  const { user, walletAddress, isLoading: contextLoading, error: contextError, requestWallet } = useFarcasterContext();
  const { executeCommand, loading: botLoading, error: botError } = useBotCommand();

  const [previewFile, setPreviewFile] = useState<File | null>(null);
  const [fullFile, setFullFile] = useState<File | null>(null);
  const [coverFile, setCoverFile] = useState<File | null>(null);
  const [title, setTitle] = useState(''); // NFT title (works for both music and art)
  const [price, setPrice] = useState('0.01');
  const [uploading, setUploading] = useState(false);
  const [minting, setMinting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<{ tokenId: number; txHash: string; title: string; price: string } | null>(null);
  const [currentStep, setCurrentStep] = useState(1);
  const [nftType, setNftType] = useState<'music' | 'art'>('music');
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [audioDuration, setAudioDuration] = useState(0);
  const [trimStart, setTrimStart] = useState(0);
  const [trimEnd, setTrimEnd] = useState(3);
  const [isPlaying, setIsPlaying] = useState(false);
  const [audioElement, setAudioElement] = useState<HTMLAudioElement | null>(null);
  const [isCollectorEdition, setIsCollectorEdition] = useState(false);
  const [collectorPrice, setCollectorPrice] = useState('500');
  const [maxEditions, setMaxEditions] = useState('100');

  const farcasterFid = user?.fid || 0;

  const steps = [
    { number: 1, title: 'Choose Type', icon: '🎨' },
    { number: 2, title: 'Upload Files', icon: '📁' },
    { number: 3, title: 'Set Details', icon: '✏️' },
    { number: 4, title: 'Review & Mint', icon: '🚀' },
  ];

  // Resize image using canvas for optimal upload size
  const resizeImage = async (file: File, maxWidth: number = 1200, maxHeight: number = 1200, quality: number = 0.85): Promise<File> => {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        let { width, height } = img;

        // Calculate new dimensions maintaining aspect ratio
        if (width > maxWidth || height > maxHeight) {
          const ratio = Math.min(maxWidth / width, maxHeight / height);
          width = Math.round(width * ratio);
          height = Math.round(height * ratio);
        }

        // Create canvas and draw resized image
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('Failed to get canvas context'));
          return;
        }

        ctx.drawImage(img, 0, 0, width, height);

        // Convert to blob
        canvas.toBlob(
          (blob) => {
            if (!blob) {
              reject(new Error('Failed to create blob'));
              return;
            }
            const resizedFile = new File([blob], file.name, { type: 'image/jpeg' });
            console.log(`🖼️ Image resized: ${(file.size / 1024).toFixed(0)}KB → ${(resizedFile.size / 1024).toFixed(0)}KB (${width}x${height})`);
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
        console.log('📎 File selected:', file?.name, 'Size:', (file?.size / 1024).toFixed(0) + 'KB');

        // Resize cover images automatically (max 1200x1200, 85% quality)
        if (setter === setCoverFile && file.type.startsWith('image/')) {
          try {
            file = await resizeImage(file, 1200, 1200, 0.85);
          } catch (err) {
            console.warn('Failed to resize image, using original:', err);
          }
        }

        setter(file);

        // If it's the full track, load it for trimming
        if (setter === setFullFile) {
          const url = URL.createObjectURL(file);
          setAudioUrl(url);

          // Create audio element to get duration
          const audio = new Audio(url);
          audio.addEventListener('loadedmetadata', () => {
            setAudioDuration(audio.duration);
            setTrimStart(0);
            setTrimEnd(Math.min(3, audio.duration));
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

          // Convert to WAV
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

    // Write WAV header
    const setUint16 = (data: number) => {
      view.setUint16(pos, data, true);
      pos += 2;
    };
    const setUint32 = (data: number) => {
      view.setUint32(pos, data, true);
      pos += 4;
    };

    setUint32(0x46464952); // "RIFF"
    setUint32(length - 8); // file length - 8
    setUint32(0x45564157); // "WAVE"
    setUint32(0x20746d66); // "fmt " chunk
    setUint32(16); // length = 16
    setUint16(1); // PCM (uncompressed)
    setUint16(numOfChan);
    setUint32(buffer.sampleRate);
    setUint32(buffer.sampleRate * 2 * numOfChan); // avg. bytes/sec
    setUint16(numOfChan * 2); // block-align
    setUint16(16); // 16-bit
    setUint32(0x61746164); // "data" - chunk
    setUint32(length - pos - 4); // chunk length

    // Write interleaved data
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
    // File size validations
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

    // ✅ NEW: Support art-only NFTs (cover art + title required, audio optional)
    const isArtOnly = !previewFile && !fullFile;
    const isMusicNFT = previewFile || fullFile;

    if (!coverFile || !title) {
      const missing = [];
      if (!coverFile) missing.push('Cover Art');
      if (!title) missing.push('Title');
      setError(`Please fill required fields: ${missing.join(', ')}`);
      return;
    }

    // If user provides preview but no full track, require both
    // If user provides full track but no preview, auto-trim will create preview
    if (previewFile && !fullFile) {
      setError('If providing a preview, please also provide the full track');
      return;
    }
    const priceNum = parseFloat(price);
    if (isNaN(priceNum) || priceNum <= 0 || priceNum > 100_000_000) {
      setError('Price must be between 0.001 and 100,000,000 WMON');
      return;
    }
    // Collector edition validations
    if (isCollectorEdition) {
      const cPrice = parseFloat(collectorPrice);
      if (isNaN(cPrice) || cPrice < 500 || cPrice > 100_000_000) {
        setError('Collector price must be between 500 and 100,000,000 WMON');
        return;
      }
      const editions = parseInt(maxEditions);
      if (isNaN(editions) || editions < 1 || editions > 1000) {
        setError('Max editions must be between 1 and 1,000');
        return;
      }
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

      // Auto-trim full track to create preview if no preview provided
      let actualPreviewFile = previewFile;
      if (!previewFile && fullFile && nftType === 'music') {
        console.log(`Auto-trimming preview from ${trimStart}s to ${trimEnd}s`);
        actualPreviewFile = await trimAudio(fullFile, trimStart, trimEnd);
        console.log(`Trimmed preview created: ${(actualPreviewFile.size / 1024).toFixed(0)}KB`);
      }

      // Only append audio files if they exist (support art-only NFTs)
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

      // Pass collector edition flags so upload route can AI-generate collector art
      if (isCollectorEdition) {
        formData.append('isCollectorEdition', 'true');
        formData.append('collectorTitle', title);
      }

      // Upload files
      let uploadRes: Response;
      try {
        uploadRes = await fetch('/api/upload', {
          method: 'POST',
          body: formData,
        });
      } catch (fetchError: any) {
        console.error('[NFT Upload] Fetch error:', fetchError);
        throw new Error(`Upload failed: ${fetchError.message || 'Network error'}`);
      }

      if (!uploadRes.ok) {
        const errorData = await uploadRes.json();
        throw new Error(errorData.error || 'Upload failed');
      }

      const uploadData = await uploadRes.json();
      const tokenURI = uploadData.tokenURI || `ipfs://${uploadData.metadataCid}`;
      const coverUrl = uploadData.coverUrl || `ipfs://${uploadData.coverCid}`;
      const collectorTokenURI = uploadData.collectorTokenURI || uploadData.tokenURI || tokenURI;

      console.log('Upload successful:', {
        tokenURI,
        coverUrl,
        title,
        isCollectorEdition,
        collectorTokenURI: isCollectorEdition ? collectorTokenURI : 'N/A',
      });

      setUploading(false);
      setMinting(true);

      let mintData;

      if (isCollectorEdition) {
        // Collector edition mint
        const command = `mint_collector ${title.slice(0, 50)} ${tokenURI} ${price}`;
        console.log('Executing collector mint command with cover URL:', coverUrl);

        mintData = await executeCommand(command, {
          imageUrl: coverUrl,
          title,
          tokenURI,
          collectorTokenURI,
          collectorPrice,
          maxEditions,
          is_art: nftType === 'art',
        });
      } else {
        // Standard mint
        const command = `mint_music ${title.slice(0, 50)} ${tokenURI} ${price}`;
        console.log('Executing mint command with cover URL:', coverUrl);

        mintData = await executeCommand(command, {
          imageUrl: coverUrl,
          title,
          tokenURI,
          is_art: nftType === 'art',
        });
      }

      if (!mintData.success) {
        throw new Error(mintData.error || mintData.message || 'Mint failed');
      }

      // Extract tokenId and txHash from bot response
      const tokenId = mintData.tokenId ? parseInt(String(mintData.tokenId)) : Math.floor(Math.random() * 10000);
      const txHash = mintData.txHash || '';

      setSuccess({ tokenId, txHash, title, price });
      setPreviewFile(null);
      setFullFile(null);
      setCoverFile(null);
      setTitle('');
      setPrice('0.01');
      setIsCollectorEdition(false);
      setCollectorPrice('500');
      setMaxEditions('100');
    } catch (err: any) {
      console.error('Error:', err);
      setError(err.message || 'Something went wrong');
    } finally {
      setUploading(false);
      setMinting(false);
    }
  };

  if (contextLoading) {
    return null;
  }

  if (!user && !contextLoading) {
    console.warn('⚠️ No Farcaster user detected');
  }

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: styles }} />
      <div className="min-h-screen bg-gradient-to-br from-gray-50 via-purple-50 to-pink-50 p-6">
        <div className="max-w-4xl mx-auto">
          <div className="bg-white rounded-3xl shadow-2xl p-8 mb-8">
            <div className="text-center mb-8">
              {user?.pfpUrl && (
                <img
                  src={user.pfpUrl}
                  alt={user.username || 'User'}
                  className="rounded-full mx-auto mb-4 border-2 border-purple-200"
                  style={{
                    width: '40px',
                    height: '40px',
                    minWidth: '40px',
                    minHeight: '40px',
                    maxWidth: '40px',
                    maxHeight: '40px',
                    objectFit: 'cover'
                  }}
                />
              )}
              <h1 className="text-4xl font-bold text-gray-900 mb-2">Create Your NFT</h1>
              <p className="text-gray-600 text-lg">Choose music or art, upload files, and mint on Monad</p>
              <div className="mt-4 p-3 bg-gradient-to-r from-green-50 to-blue-50 rounded-lg border-2 border-green-200">
                <p className="text-sm font-bold text-green-900">✨ FREE Mint! We pay all gas fees</p>
              </div>
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
                          ? 'bg-gradient-to-r from-purple-600 to-pink-600 text-white scale-110 shadow-lg'
                          : 'bg-gray-200 text-gray-400'
                      }`}
                    >
                      {step.icon}
                    </div>
                    <div className="mt-2 text-center">
                      <p
                        className={`text-xs font-medium ${
                          currentStep >= step.number ? 'text-purple-600' : 'text-gray-400'
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
                          ? 'bg-gradient-to-r from-purple-600 to-pink-600'
                          : 'bg-gray-200'
                      }`}
                    />
                  )}
                </div>
              ))}
            </div>
          </div>

          {user ? (
            <div className="mb-6 p-4 bg-purple-50 rounded-lg">
              <p className="text-sm text-purple-900">
                <strong>✅ Farcaster User:</strong> @{user.username || 'Unknown'}
              </p>
              <p className="text-sm text-purple-900 mt-1">
                <strong>FID:</strong> {user.fid}
              </p>
              {walletAddress && (
                <p className="text-sm text-purple-900 mt-1 font-mono text-xs">
                  <strong>Wallet:</strong> {walletAddress.slice(0, 6)}...{walletAddress.slice(-4)}
                </p>
              )}
            </div>
          ) : (
            <div className="mb-6 p-4 bg-yellow-50 rounded-lg border-2 border-yellow-200">
              <p className="text-yellow-900 text-sm">
                <strong>⚠️ User info not loaded</strong>
              </p>
              <p className="text-yellow-700 text-xs mt-1">
                Loading your Farcaster profile...
              </p>
            </div>
          )}

          {(error || botError) && (
            <div className="mb-6 p-4 bg-red-50 border-2 border-red-200 rounded-lg">
              <p className="text-red-700 font-medium">❌ {error || botError}</p>
            </div>
          )}

          {success && (
            <div className="mb-6 p-4 bg-green-50 border-2 border-green-200 rounded-lg">
              <p className="text-green-700 font-bold text-lg mb-2">🎉 Music NFT Minted!</p>
              <div className="space-y-2 text-sm">
                <p className="text-green-700">
                  <strong>Token ID:</strong> #{success.tokenId}
                </p>
                <p className="text-green-700">
                  <strong>Song:</strong> {success.title || 'Untitled'}
                </p>
                <p className="text-green-700">
                  <strong>Price:</strong> {success.price} WMON per license
                </p>
                {success.txHash && (
                  <a
                    href={`https://monadscan.com/tx/${success.txHash}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-block px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium"
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
              <div className="space-y-4 animate-fadeIn">
                <h2 className="text-2xl font-bold text-gray-900 mb-4">What would you like to create?</h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <button
                    onClick={() => {
                      setNftType('music');
                      setCurrentStep(2);
                    }}
                    className="group relative p-8 bg-gradient-to-br from-purple-50 to-pink-50 rounded-2xl border-4 border-purple-200 hover:border-purple-500 hover:scale-105 transition-all shadow-lg hover:shadow-2xl"
                  >
                    <div className="text-6xl mb-4">🎵</div>
                    <h3 className="text-2xl font-bold text-purple-900 mb-2">Music NFT</h3>
                    <p className="text-gray-700">Upload cover art + audio files to create a music NFT</p>
                    <div className="mt-4 text-sm text-purple-600 font-medium">Includes: Cover + Preview + Full Track →</div>
                  </button>

                  <button
                    onClick={() => {
                      setNftType('art');
                      setCurrentStep(2);
                    }}
                    className="group relative p-8 bg-gradient-to-br from-blue-50 to-cyan-50 rounded-2xl border-4 border-blue-200 hover:border-blue-500 hover:scale-105 transition-all shadow-lg hover:shadow-2xl"
                  >
                    <div className="text-6xl mb-4">🎨</div>
                    <h3 className="text-2xl font-bold text-blue-900 mb-2">Art NFT</h3>
                    <p className="text-gray-700">Upload only cover art to create a visual art NFT</p>
                    <div className="mt-4 text-sm text-blue-600 font-medium">Includes: Cover Art Only →</div>
                  </button>
                </div>
              </div>
            )}

            {/* STEP 2: Upload Files */}
            {currentStep === 2 && (
              <div className="space-y-6 animate-fadeIn">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-2xl font-bold text-gray-900">
                    Upload Your {nftType === 'music' ? 'Music' : 'Art'} Files
                  </h2>
                  <button
                    onClick={() => setCurrentStep(1)}
                    className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200"
                  >
                    ← Back
                  </button>
                </div>

                {/* Cover Art Upload */}
                <div className="p-6 bg-gradient-to-br from-gray-50 to-gray-100 rounded-2xl border-2 border-dashed border-gray-300">
                  <label className="block cursor-pointer">
                    <div className="text-center">
                      {coverFile ? (
                        <div>
                          <img
                            src={URL.createObjectURL(coverFile)}
                            alt="Cover"
                            className="w-64 h-64 object-cover rounded-xl mx-auto mb-4 shadow-lg"
                          />
                          <p className="text-green-600 font-bold text-lg">✓ {coverFile.name}</p>
                          <p className="text-gray-500 text-sm">{(coverFile.size / 1024).toFixed(0)}KB</p>
                        </div>
                      ) : (
                        <div className="py-12">
                          <div className="text-6xl mb-4">🖼️</div>
                          <p className="text-xl font-bold text-gray-700">Click to upload cover art</p>
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
                    <div className="p-6 bg-gradient-to-br from-purple-50 to-pink-50 rounded-2xl border-2 border-dashed border-purple-300">
                      <label className="block cursor-pointer">
                        <div className="text-center">
                          {previewFile ? (
                            <div className="py-6">
                              <div className="text-5xl mb-3">🎧</div>
                              <p className="text-purple-600 font-bold text-lg">✓ Preview Audio</p>
                              <p className="text-gray-700">{previewFile.name}</p>
                              <p className="text-gray-500 text-sm">{(previewFile.size / 1024).toFixed(0)}KB</p>
                              {previewFile.size > 600 * 1024 && (
                                <p className="text-red-600 font-bold mt-2">⚠️ File too large! Max 600KB</p>
                              )}
                            </div>
                          ) : (
                            <div className="py-8">
                              <div className="text-5xl mb-3">🎧</div>
                              <p className="text-xl font-bold text-gray-700">Upload Preview Audio (Optional)</p>
                              <p className="text-sm text-gray-500 mt-2">MP3, WAV, M4A - Max 600KB</p>
                              <p className="text-xs text-purple-600 font-medium mt-2">
                                💡 Or skip this - we'll auto-generate a 3s preview from your full track!
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

                    <div className="p-6 bg-gradient-to-br from-blue-50 to-cyan-50 rounded-2xl border-2 border-dashed border-blue-300">
                      <label className="block cursor-pointer">
                        <div className="text-center">
                          {fullFile ? (
                            <div className="py-6">
                              <div className="text-5xl mb-3">🎵</div>
                              <p className="text-blue-600 font-bold text-lg">✓ Full Track</p>
                              <p className="text-gray-700">{fullFile.name}</p>
                              <p className="text-gray-500 text-sm">{(fullFile.size / 1024 / 1024).toFixed(2)}MB</p>
                              {fullFile.size > 15 * 1024 * 1024 && (
                                <p className="text-red-600 font-bold mt-2">⚠️ File too large! Max 15MB</p>
                              )}
                            </div>
                          ) : (
                            <div className="py-8">
                              <div className="text-5xl mb-3">🎵</div>
                              <p className="text-xl font-bold text-gray-700">Upload Full Track</p>
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
                  </>
                )}

                {/* Audio Trimmer - Show when full track is uploaded */}
                {nftType === 'music' && fullFile && !previewFile && audioUrl && (
                  <div className="p-6 bg-gradient-to-br from-yellow-50 to-orange-50 rounded-2xl border-2 border-yellow-300">
                    <h3 className="text-xl font-bold text-gray-900 mb-4">✂️ Select 3-Second Preview</h3>
                    <p className="text-sm text-gray-600 mb-4">
                      Choose which part of your track to use as the preview
                    </p>

                    {/* Waveform/Timeline */}
                    <div className="mb-4">
                      <div className="relative h-16 bg-gradient-to-r from-purple-200 to-pink-200 rounded-lg overflow-hidden">
                        {/* Selection Range */}
                        <div
                          className="absolute top-0 h-full bg-gradient-to-r from-purple-500 to-pink-500 opacity-50"
                          style={{
                            left: `${(trimStart / audioDuration) * 100}%`,
                            width: `${((trimEnd - trimStart) / audioDuration) * 100}%`,
                          }}
                        />

                        {/* Time markers */}
                        <div className="absolute inset-0 flex items-center justify-between px-2 text-xs text-white font-bold">
                          <span>0:00</span>
                          <span>{Math.floor(audioDuration / 60)}:{String(Math.floor(audioDuration % 60)).padStart(2, '0')}</span>
                        </div>
                      </div>

                      {/* Selected Range Display */}
                      <div className="flex justify-between items-center mt-2 text-sm text-gray-700">
                        <span>Start: {trimStart.toFixed(1)}s</span>
                        <span className="font-bold text-purple-600">{(trimEnd - trimStart).toFixed(1)}s preview</span>
                        <span>End: {trimEnd.toFixed(1)}s</span>
                      </div>
                    </div>

                    {/* Slider Controls */}
                    <div className="space-y-4">
                      <div>
                        <label className="text-sm font-medium text-gray-700">Start Time</label>
                        <input
                          type="range"
                          min="0"
                          max={Math.max(0, audioDuration - 3)}
                          step="0.1"
                          value={trimStart}
                          onChange={(e) => {
                            const newStart = parseFloat(e.target.value);
                            setTrimStart(newStart);
                            setTrimEnd(Math.min(newStart + 3, audioDuration));
                          }}
                          className="w-full h-2 bg-purple-200 rounded-lg appearance-none cursor-pointer"
                        />
                      </div>

                      {/* Play Preview Button */}
                      <button
                        onClick={playPreview}
                        disabled={isPlaying}
                        className="w-full px-6 py-3 bg-gradient-to-r from-green-500 to-emerald-500 text-white rounded-xl font-bold hover:scale-105 disabled:opacity-50 transition-all shadow-lg"
                      >
                        {isPlaying ? '▶️ Playing...' : '▶️ Play Preview'}
                      </button>

                      <p className="text-xs text-gray-500 text-center">
                        This 3-second clip will be auto-generated as your preview
                      </p>
                    </div>
                  </div>
                )}

                {/* AI Collector Art Notice (when collector edition is enabled) */}
                {isCollectorEdition && (
                  <div className="p-6 bg-gradient-to-br from-amber-50 to-orange-50 rounded-2xl border-2 border-amber-200">
                    <div className="text-center">
                      <div className="text-5xl mb-3">&#x1F451;&#x2728;</div>
                      <p className="text-lg font-bold text-amber-900">AI-Enhanced Collector Art</p>
                      <p className="text-sm text-amber-700 mt-2">
                        Your cover art will be automatically enhanced by Gemini AI with premium collector edition effects — golden borders, holographic textures, and a limited edition badge.
                      </p>
                      <p className="text-xs text-amber-600 mt-2 font-medium">
                        Requires 5 WMON creation fee from your Safe wallet to cover AI generation costs.
                      </p>
                    </div>
                  </div>
                )}

                <button
                  onClick={() => setCurrentStep(3)}
                  disabled={!coverFile || (nftType === 'music' && !fullFile)}
                  className="w-full px-8 py-4 bg-gradient-to-r from-purple-600 to-pink-600 text-white rounded-xl font-bold text-lg hover:scale-105 disabled:opacity-50 disabled:scale-100 transition-all shadow-lg"
                >
                  Continue to Details →
                </button>
              </div>
            )}

            {/* STEP 3: Set Details */}
            {currentStep === 3 && (
              <div className="space-y-6 animate-fadeIn">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-2xl font-bold text-gray-900">Set NFT Details</h2>
                  <button
                    onClick={() => setCurrentStep(2)}
                    className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200"
                  >
                    ← Back
                  </button>
                </div>

                <div className="p-6 bg-gradient-to-br from-purple-50 to-pink-50 rounded-2xl border-2 border-purple-200">
                  <label className="block text-xl font-bold text-gray-900 mb-4">
                    {nftType === 'music' ? '🎵 Song Title' : '🎨 Art Title'}
                  </label>
                  <input
                    type="text"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder={nftType === 'music' ? 'e.g., Money Making Machine - Electronic Mix' : 'e.g., Sunset Over Mountains'}
                    maxLength={200}
                    className="w-full px-6 py-4 text-lg border-2 border-purple-300 rounded-xl focus:ring-4 focus:ring-purple-500 focus:border-transparent"
                  />
                  <p className="text-sm text-gray-600 mt-2">{title.length}/200 characters</p>
                </div>

                <div className="p-6 bg-gradient-to-br from-green-50 to-emerald-50 rounded-2xl border-2 border-green-200">
                  <label className="block text-xl font-bold text-gray-900 mb-4">💰 License Price</label>
                  <p className="text-sm text-gray-600 mb-4">How much will fans pay to own this NFT?</p>

                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
                    {['0.01', '0.05', '0.1', '1'].map((p) => (
                      <button
                        key={p}
                        onClick={() => setPrice(p)}
                        className={`px-6 py-4 rounded-xl font-bold text-lg transition-all ${
                          price === p
                            ? 'bg-gradient-to-r from-green-600 to-emerald-600 text-white scale-110 shadow-lg'
                            : 'bg-white text-gray-700 hover:scale-105 border-2 border-gray-200'
                        }`}
                      >
                        {p} WMON
                      </button>
                    ))}
                  </div>

                  <div className="relative">
                    <input
                      type="number"
                      step="0.001"
                      min="0.001"
                      max="100000000"
                      value={price}
                      onChange={(e) => setPrice(e.target.value)}
                      placeholder="Custom price"
                      className="w-full px-6 py-4 text-lg border-2 border-green-300 rounded-xl focus:ring-4 focus:ring-green-500 focus:border-transparent"
                    />
                    <span className="absolute right-6 top-4.5 text-gray-600 font-bold pointer-events-none">WMON</span>
                  </div>
                  <p className="text-xs text-gray-500 mt-2">Min: 0.001 | Max: 100,000,000 WMON</p>
                </div>

                {/* Collector Edition Panel */}
                <div className="p-6 bg-gradient-to-br from-amber-50 to-orange-50 rounded-2xl border-2 border-amber-200">
                  <div className="flex items-center justify-between mb-4">
                    <label className="text-xl font-bold text-gray-900">
                      <span className="mr-2">&#x1F451;</span> Collector Edition (Limited Run)
                    </label>
                    <button
                      type="button"
                      onClick={() => setIsCollectorEdition(!isCollectorEdition)}
                      className={`relative inline-flex h-7 w-14 items-center rounded-full transition-colors ${
                        isCollectorEdition ? 'bg-amber-500' : 'bg-gray-300'
                      }`}
                    >
                      <span
                        className={`inline-block h-5 w-5 transform rounded-full bg-white transition-transform shadow ${
                          isCollectorEdition ? 'translate-x-8' : 'translate-x-1'
                        }`}
                      />
                    </button>
                  </div>

                  {isCollectorEdition && (
                    <div className="space-y-4 animate-fadeIn">
                      <p className="text-sm text-amber-800 bg-amber-100 p-3 rounded-lg">
                        Collector editions are premium limited-run copies. Your cover art is automatically enhanced by Gemini AI with collector edition effects (golden borders, holographic textures, limited edition badge). A <strong>5 WMON creation fee</strong> is required to cover AI generation costs.
                      </p>

                      <div>
                        <label className="block text-sm font-bold text-gray-700 mb-2">Collector Price (WMON)</label>
                        <div className="relative">
                          <input
                            type="number"
                            step="1"
                            min="500"
                            max="100000000"
                            value={collectorPrice}
                            onChange={(e) => setCollectorPrice(e.target.value)}
                            placeholder="500"
                            className="w-full px-6 py-3 text-lg border-2 border-amber-300 rounded-xl focus:ring-4 focus:ring-amber-500 focus:border-transparent"
                          />
                          <span className="absolute right-6 top-3.5 text-gray-600 font-bold pointer-events-none">WMON</span>
                        </div>
                        <p className="text-xs text-gray-500 mt-1">Min: 500 | Max: 100,000,000 WMON</p>
                      </div>

                      <div>
                        <label className="block text-sm font-bold text-gray-700 mb-2">Max Editions</label>
                        <input
                          type="number"
                          step="1"
                          min="1"
                          max="1000"
                          value={maxEditions}
                          onChange={(e) => setMaxEditions(e.target.value)}
                          placeholder="100"
                          className="w-full px-6 py-3 text-lg border-2 border-amber-300 rounded-xl focus:ring-4 focus:ring-amber-500 focus:border-transparent"
                        />
                        <p className="text-xs text-gray-500 mt-1">1 - 1,000 editions</p>
                      </div>
                    </div>
                  )}
                </div>

                <button
                  onClick={() => setCurrentStep(4)}
                  disabled={!title || !price}
                  className="w-full px-8 py-4 bg-gradient-to-r from-purple-600 to-pink-600 text-white rounded-xl font-bold text-lg hover:scale-105 disabled:opacity-50 disabled:scale-100 transition-all shadow-lg"
                >
                  Review & Mint →
                </button>
              </div>
            )}

            {/* STEP 4: Review & Mint */}
            {currentStep === 4 && (
              <div className="space-y-6 animate-fadeIn">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-2xl font-bold text-gray-900">Review Your NFT</h2>
                  <button
                    onClick={() => setCurrentStep(3)}
                    className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200"
                  >
                    ← Back
                  </button>
                </div>

                {/* Preview Card */}
                <div className="p-8 bg-gradient-to-br from-purple-50 via-pink-50 to-blue-50 rounded-3xl border-4 border-purple-200 shadow-2xl">
                  <div className="flex flex-col md:flex-row gap-6 items-center">
                    {coverFile && (
                      <img
                        src={URL.createObjectURL(coverFile)}
                        alt="Preview"
                        className="w-48 h-48 object-cover rounded-2xl shadow-xl"
                      />
                    )}
                    <div className="flex-1">
                      <div className="text-sm font-bold text-purple-600 mb-2">
                        {nftType === 'music' ? '🎵 MUSIC NFT' : '🎨 ART NFT'}
                      </div>
                      <h3 className="text-3xl font-bold text-gray-900 mb-4">{title || 'Untitled'}</h3>
                      <div className="space-y-2 text-gray-700">
                        <p><strong>Type:</strong> {nftType === 'music' ? 'Music NFT' : 'Art NFT'}</p>
                        <p><strong>Standard Price:</strong> {price} WMON per license</p>
                        <p><strong>Creator:</strong> @{user?.username || 'You'}</p>
                        {nftType === 'music' && (
                          <>
                            <p><strong>Preview Audio:</strong> ✓ {previewFile?.name}</p>
                            <p><strong>Full Track:</strong> ✓ {fullFile?.name}</p>
                          </>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Collector Edition Details */}
                  {isCollectorEdition && (
                    <div className="mt-6 p-4 bg-gradient-to-r from-amber-50 to-orange-50 rounded-xl border-2 border-amber-200">
                      <p className="text-sm font-bold text-amber-800 mb-3">Collector Edition Details</p>
                      <div className="space-y-1 text-sm text-amber-900">
                        <p><strong>Collector Price:</strong> {collectorPrice} WMON per edition</p>
                        <p><strong>Max Editions:</strong> {maxEditions}</p>
                        <p><strong>Collector Art:</strong> AI-enhanced by Gemini</p>
                        <p><strong>Creation Fee:</strong> 5 WMON (covers AI art generation)</p>
                      </div>
                      <div className="mt-3 p-2 bg-white rounded-lg text-xs text-gray-600">
                        Standard: {price} WMON (unlimited) | Collector: {collectorPrice} WMON ({maxEditions} editions) | Fee: 5 WMON
                      </div>
                    </div>
                  )}
                </div>

                {/* Mint Button */}
                <button
                  onClick={uploadAndMint}
                  disabled={uploading || minting || botLoading}
                  className="w-full px-8 py-6 bg-gradient-to-r from-purple-600 via-pink-600 to-blue-600 text-white rounded-2xl font-bold text-2xl hover:scale-105 disabled:opacity-50 disabled:scale-100 transition-all shadow-2xl"
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
                    className="w-full px-6 py-4 bg-yellow-500 text-white rounded-xl font-bold text-lg hover:bg-yellow-600 transition-all shadow-lg"
                  >
                    🔑 Connect Wallet First
                  </button>
                )}

                <div className="p-4 bg-green-50 rounded-xl border-2 border-green-200">
                  <p className="text-green-900 font-bold text-center">✨ FREE Mint! We pay all gas fees for you</p>
                </div>
              </div>
            )}
          </div>

          <div className="mt-8 p-4 bg-blue-50 rounded-xl border-2 border-blue-200">
            <p className="text-sm text-blue-900 font-medium mb-2">
              💡 How NFT Pricing Works:
            </p>
            <ul className="text-sm text-blue-800 space-y-1 list-disc list-inside">
              <li>Set your price in WMON tokens (what fans pay to own your NFT)</li>
              <li>You receive 90% of sales + 10% royalties on resales</li>
              <li>Minting is FREE - we cover all gas costs for you</li>
              <li>Music NFTs: Fans can preview audio before buying</li>
            </ul>
          </div>
        </div>
      </div>
      </div>
    </>
  );
}
