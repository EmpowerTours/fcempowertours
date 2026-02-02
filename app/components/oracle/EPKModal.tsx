'use client';

import { useState } from 'react';
import { X, ChevronLeft, ChevronRight, Loader2, CheckCircle, Music, FileText, Hotel, CalendarCheck } from 'lucide-react';
import { EVENT_TYPES } from '@/lib/epk/constants';

interface EPKModalProps {
  isOpen: boolean;
  onClose: () => void;
  userAddress?: string;
  userFid?: number;
}

type Step = 'artist' | 'media' | 'riders' | 'booking' | 'review';

const STEPS: { key: Step; label: string; icon: any }[] = [
  { key: 'artist', label: 'Artist Info', icon: Music },
  { key: 'media', label: 'Music & Media', icon: FileText },
  { key: 'riders', label: 'Riders', icon: Hotel },
  { key: 'booking', label: 'Booking', icon: CalendarCheck },
  { key: 'review', label: 'Review & Publish', icon: CheckCircle },
];

export function EPKModal({ isOpen, onClose, userAddress, userFid }: EPKModalProps) {
  const [step, setStep] = useState<Step>('artist');
  const [publishing, setPublishing] = useState(false);
  const [published, setPublished] = useState(false);
  const [publishResult, setPublishResult] = useState<any>(null);
  const [error, setError] = useState('');

  // Form state
  const [artistName, setArtistName] = useState('');
  const [bio, setBio] = useState('');
  const [genre, setGenre] = useState('');
  const [location, setLocation] = useState('');
  const [videoUrl, setVideoUrl] = useState('');
  const [videoTitle, setVideoTitle] = useState('');
  const [pressArticles, setPressArticles] = useState([{ outlet: '', title: '', url: '', date: '', excerpt: '' }]);
  const [pricing, setPricing] = useState('Contact for rates');
  const [availableFor, setAvailableFor] = useState('');
  const [territories, setTerritories] = useState('');
  const [minimumDeposit, setMinimumDeposit] = useState('100');

  // Simple rider state - comma-separated items
  const [stageItems, setStageItems] = useState('');
  const [soundItems, setSoundItems] = useState('');
  const [lightingItems, setLightingItems] = useState('');
  const [dressingRoomItems, setDressingRoomItems] = useState('');
  const [cateringItems, setCateringItems] = useState('');
  const [beverageItems, setBeverageItems] = useState('');

  if (!isOpen) return null;

  const stepIndex = STEPS.findIndex(s => s.key === step);

  const goNext = () => {
    const nextIndex = stepIndex + 1;
    if (nextIndex < STEPS.length) setStep(STEPS[nextIndex].key);
  };

  const goPrev = () => {
    const prevIndex = stepIndex - 1;
    if (prevIndex >= 0) setStep(STEPS[prevIndex].key);
  };

  const handlePublish = async () => {
    if (!artistName || !bio) {
      setError('Artist name and bio are required');
      return;
    }

    setPublishing(true);
    setError('');

    try {
      const parseItems = (text: string) => text.split('\n').map(s => s.trim()).filter(Boolean);

      const metadata = {
        version: '1.0.0',
        artist: {
          name: artistName,
          slug: '',
          bio,
          genre: genre.split(',').map(g => g.trim()).filter(Boolean),
          location,
          farcasterFid: userFid,
          walletAddress: userAddress,
        },
        musicCatalog: { showCatalog: true },
        media: {
          videos: videoUrl ? [{ title: videoTitle || 'Video', url: videoUrl, platform: 'other' as const }] : [],
          photos: [],
        },
        press: pressArticles.filter(a => a.outlet && a.title),
        booking: {
          pricing,
          inquiryEnabled: true,
          availableFor: availableFor.split(',').map(s => s.trim()).filter(Boolean),
          territories: territories.split(',').map(s => s.trim()).filter(Boolean),
          targetEvents: [],
          minimumDeposit,
        },
        technicalRider: {
          stage: { title: 'Stage Requirements', items: parseItems(stageItems) },
          sound: { title: 'Sound System', items: parseItems(soundItems) },
          lighting: { title: 'Lighting', items: parseItems(lightingItems) },
          video: { title: 'Video / LED', items: [] },
          backline: { title: 'Backline', items: [] },
          soundcheck: { title: 'Soundcheck', items: [] },
          crew: { title: 'Crew', items: [] },
        },
        hospitalityRider: {
          dressingRoom: { title: 'Dressing Room', items: parseItems(dressingRoomItems) },
          catering: { title: 'Catering', items: parseItems(cateringItems) },
          beverages: { title: 'Beverages', items: parseItems(beverageItems) },
          transport: { title: 'Transportation', items: [] },
          hotel: { title: 'Hotel', items: [] },
          security: { title: 'Security', items: [] },
          guestList: { title: 'Guest List', items: [] },
          payment: { title: 'Payment', items: ['WMON deposit required', 'Crypto payments accepted'] },
        },
        socials: {},
        onChain: {},
      };

      const res = await fetch('/api/epk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ metadata, userAddress, userFid }),
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to publish EPK');
      }

      setPublishResult(data);
      setPublished(true);
    } catch (err: any) {
      setError(err.message || 'Publishing failed');
    } finally {
      setPublishing(false);
    }
  };

  const addPressArticle = () => {
    setPressArticles(prev => [...prev, { outlet: '', title: '', url: '', date: '', excerpt: '' }]);
  };

  const updatePressArticle = (index: number, field: string, value: string) => {
    setPressArticles(prev => prev.map((a, i) => i === index ? { ...a, [field]: value } : a));
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-[#1e293b] rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-hidden border border-white/10">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/10">
          <h2 className="text-lg font-semibold text-white">Create Press Kit</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-white transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Step indicators */}
        <div className="flex items-center gap-1 px-6 py-3 border-b border-white/5">
          {STEPS.map((s, i) => (
            <button
              key={s.key}
              onClick={() => setStep(s.key)}
              className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full transition-colors ${
                step === s.key
                  ? 'bg-purple-600 text-white'
                  : i < stepIndex
                  ? 'bg-purple-600/20 text-purple-300'
                  : 'bg-white/5 text-slate-400'
              }`}
            >
              <s.icon className="w-3 h-3" />
              <span className="hidden sm:inline">{s.label}</span>
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="px-6 py-6 overflow-y-auto max-h-[60vh] space-y-4">
          {published ? (
            <div className="text-center py-8">
              <CheckCircle className="w-16 h-16 text-green-400 mx-auto mb-4" />
              <h3 className="text-xl font-bold text-white mb-2">EPK Published!</h3>
              <p className="text-slate-400 mb-4">Your press kit is now live on IPFS and registered on Monad.</p>
              {publishResult && (
                <div className="space-y-2 text-sm">
                  <a
                    href={publishResult.epkUrl}
                    className="block text-purple-400 hover:text-purple-300"
                  >
                    View EPK: {publishResult.epkUrl}
                  </a>
                  {publishResult.explorer && (
                    <a
                      href={publishResult.explorer}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="block text-slate-400 hover:text-purple-300"
                    >
                      On-chain TX: {publishResult.txHash?.slice(0, 16)}...
                    </a>
                  )}
                </div>
              )}
            </div>
          ) : (
            <>
              {/* Artist Info Step */}
              {step === 'artist' && (
                <>
                  <div>
                    <label className="block text-sm text-slate-300 mb-1.5">Artist / Act Name *</label>
                    <input
                      value={artistName}
                      onChange={e => setArtistName(e.target.value)}
                      className="w-full bg-[#0f172a] border border-white/10 rounded-lg px-4 py-2.5 text-white placeholder-slate-500 focus:outline-none focus:border-purple-500"
                      placeholder="Your artist name"
                    />
                  </div>
                  <div>
                    <label className="block text-sm text-slate-300 mb-1.5">Bio *</label>
                    <textarea
                      value={bio}
                      onChange={e => setBio(e.target.value)}
                      rows={5}
                      className="w-full bg-[#0f172a] border border-white/10 rounded-lg px-4 py-2.5 text-white placeholder-slate-500 focus:outline-none focus:border-purple-500 resize-none"
                      placeholder="Your artist biography..."
                    />
                  </div>
                  <div>
                    <label className="block text-sm text-slate-300 mb-1.5">Genre(s) (comma-separated)</label>
                    <input
                      value={genre}
                      onChange={e => setGenre(e.target.value)}
                      className="w-full bg-[#0f172a] border border-white/10 rounded-lg px-4 py-2.5 text-white placeholder-slate-500 focus:outline-none focus:border-purple-500"
                      placeholder="e.g., Hip-Hop, Electronic, AI Music"
                    />
                  </div>
                  <div>
                    <label className="block text-sm text-slate-300 mb-1.5">Location</label>
                    <input
                      value={location}
                      onChange={e => setLocation(e.target.value)}
                      className="w-full bg-[#0f172a] border border-white/10 rounded-lg px-4 py-2.5 text-white placeholder-slate-500 focus:outline-none focus:border-purple-500"
                      placeholder="City, Country"
                    />
                  </div>
                </>
              )}

              {/* Media Step */}
              {step === 'media' && (
                <>
                  <div>
                    <label className="block text-sm text-slate-300 mb-1.5">Video URL</label>
                    <input
                      value={videoUrl}
                      onChange={e => setVideoUrl(e.target.value)}
                      className="w-full bg-[#0f172a] border border-white/10 rounded-lg px-4 py-2.5 text-white placeholder-slate-500 focus:outline-none focus:border-purple-500"
                      placeholder="https://rumble.com/... or https://youtube.com/..."
                    />
                  </div>
                  <div>
                    <label className="block text-sm text-slate-300 mb-1.5">Video Title</label>
                    <input
                      value={videoTitle}
                      onChange={e => setVideoTitle(e.target.value)}
                      className="w-full bg-[#0f172a] border border-white/10 rounded-lg px-4 py-2.5 text-white placeholder-slate-500 focus:outline-none focus:border-purple-500"
                      placeholder="Music Video Title"
                    />
                  </div>
                  <div>
                    <h3 className="text-sm font-medium text-white mb-3">Press Articles</h3>
                    {pressArticles.map((article, i) => (
                      <div key={i} className="space-y-2 mb-4 p-3 bg-[#0f172a] rounded-lg">
                        <input
                          value={article.outlet}
                          onChange={e => updatePressArticle(i, 'outlet', e.target.value)}
                          className="w-full bg-transparent border border-white/10 rounded px-3 py-2 text-white text-sm placeholder-slate-500 focus:outline-none focus:border-purple-500"
                          placeholder="Outlet name (e.g., Rolling Stone)"
                        />
                        <input
                          value={article.title}
                          onChange={e => updatePressArticle(i, 'title', e.target.value)}
                          className="w-full bg-transparent border border-white/10 rounded px-3 py-2 text-white text-sm placeholder-slate-500 focus:outline-none focus:border-purple-500"
                          placeholder="Article title"
                        />
                        <input
                          value={article.url}
                          onChange={e => updatePressArticle(i, 'url', e.target.value)}
                          className="w-full bg-transparent border border-white/10 rounded px-3 py-2 text-white text-sm placeholder-slate-500 focus:outline-none focus:border-purple-500"
                          placeholder="https://..."
                        />
                        <div className="grid grid-cols-2 gap-2">
                          <input
                            type="date"
                            value={article.date}
                            onChange={e => updatePressArticle(i, 'date', e.target.value)}
                            className="bg-transparent border border-white/10 rounded px-3 py-2 text-white text-sm focus:outline-none focus:border-purple-500"
                          />
                          <input
                            value={article.excerpt}
                            onChange={e => updatePressArticle(i, 'excerpt', e.target.value)}
                            className="bg-transparent border border-white/10 rounded px-3 py-2 text-white text-sm placeholder-slate-500 focus:outline-none focus:border-purple-500"
                            placeholder="Short excerpt"
                          />
                        </div>
                      </div>
                    ))}
                    <button
                      type="button"
                      onClick={addPressArticle}
                      className="text-sm text-purple-400 hover:text-purple-300"
                    >
                      + Add another article
                    </button>
                  </div>
                </>
              )}

              {/* Riders Step */}
              {step === 'riders' && (
                <>
                  <p className="text-sm text-slate-400 mb-4">Enter each requirement on a new line.</p>
                  <div>
                    <label className="block text-sm text-slate-300 mb-1.5">Stage Requirements</label>
                    <textarea
                      value={stageItems}
                      onChange={e => setStageItems(e.target.value)}
                      rows={3}
                      className="w-full bg-[#0f172a] border border-white/10 rounded-lg px-4 py-2.5 text-white text-sm placeholder-slate-500 focus:outline-none focus:border-purple-500 resize-none"
                      placeholder="40ft x 30ft minimum&#10;4ft+ stage height"
                    />
                  </div>
                  <div>
                    <label className="block text-sm text-slate-300 mb-1.5">Sound System</label>
                    <textarea
                      value={soundItems}
                      onChange={e => setSoundItems(e.target.value)}
                      rows={3}
                      className="w-full bg-[#0f172a] border border-white/10 rounded-lg px-4 py-2.5 text-white text-sm placeholder-slate-500 focus:outline-none focus:border-purple-500 resize-none"
                      placeholder="Line array PA system&#10;6 wedge monitors"
                    />
                  </div>
                  <div>
                    <label className="block text-sm text-slate-300 mb-1.5">Lighting</label>
                    <textarea
                      value={lightingItems}
                      onChange={e => setLightingItems(e.target.value)}
                      rows={3}
                      className="w-full bg-[#0f172a] border border-white/10 rounded-lg px-4 py-2.5 text-white text-sm placeholder-slate-500 focus:outline-none focus:border-purple-500 resize-none"
                      placeholder="Moving head fixtures&#10;LED wash lights"
                    />
                  </div>
                  <div>
                    <label className="block text-sm text-slate-300 mb-1.5">Dressing Room</label>
                    <textarea
                      value={dressingRoomItems}
                      onChange={e => setDressingRoomItems(e.target.value)}
                      rows={3}
                      className="w-full bg-[#0f172a] border border-white/10 rounded-lg px-4 py-2.5 text-white text-sm placeholder-slate-500 focus:outline-none focus:border-purple-500 resize-none"
                      placeholder="Private room with bathroom&#10;Seating for 6"
                    />
                  </div>
                  <div>
                    <label className="block text-sm text-slate-300 mb-1.5">Catering</label>
                    <textarea
                      value={cateringItems}
                      onChange={e => setCateringItems(e.target.value)}
                      rows={3}
                      className="w-full bg-[#0f172a] border border-white/10 rounded-lg px-4 py-2.5 text-white text-sm placeholder-slate-500 focus:outline-none focus:border-purple-500 resize-none"
                      placeholder="Hot meal for 6&#10;Vegetarian option"
                    />
                  </div>
                  <div>
                    <label className="block text-sm text-slate-300 mb-1.5">Beverages</label>
                    <textarea
                      value={beverageItems}
                      onChange={e => setBeverageItems(e.target.value)}
                      rows={3}
                      className="w-full bg-[#0f172a] border border-white/10 rounded-lg px-4 py-2.5 text-white text-sm placeholder-slate-500 focus:outline-none focus:border-purple-500 resize-none"
                      placeholder="Water, juice, energy drinks&#10;Premium spirits"
                    />
                  </div>
                </>
              )}

              {/* Booking Step */}
              {step === 'booking' && (
                <>
                  <div>
                    <label className="block text-sm text-slate-300 mb-1.5">Pricing</label>
                    <input
                      value={pricing}
                      onChange={e => setPricing(e.target.value)}
                      className="w-full bg-[#0f172a] border border-white/10 rounded-lg px-4 py-2.5 text-white placeholder-slate-500 focus:outline-none focus:border-purple-500"
                      placeholder="Contact for rates"
                    />
                  </div>
                  <div>
                    <label className="block text-sm text-slate-300 mb-1.5">Available For (comma-separated)</label>
                    <input
                      value={availableFor}
                      onChange={e => setAvailableFor(e.target.value)}
                      className="w-full bg-[#0f172a] border border-white/10 rounded-lg px-4 py-2.5 text-white placeholder-slate-500 focus:outline-none focus:border-purple-500"
                      placeholder="Conferences, Festivals, Private Events"
                    />
                  </div>
                  <div>
                    <label className="block text-sm text-slate-300 mb-1.5">Territories (comma-separated)</label>
                    <input
                      value={territories}
                      onChange={e => setTerritories(e.target.value)}
                      className="w-full bg-[#0f172a] border border-white/10 rounded-lg px-4 py-2.5 text-white placeholder-slate-500 focus:outline-none focus:border-purple-500"
                      placeholder="Global, North America, Europe"
                    />
                  </div>
                  <div>
                    <label className="block text-sm text-slate-300 mb-1.5">Minimum WMON Deposit</label>
                    <input
                      type="number"
                      value={minimumDeposit}
                      onChange={e => setMinimumDeposit(e.target.value)}
                      className="w-full bg-[#0f172a] border border-white/10 rounded-lg px-4 py-2.5 text-white placeholder-slate-500 focus:outline-none focus:border-purple-500"
                      placeholder="100"
                    />
                  </div>
                </>
              )}

              {/* Review Step */}
              {step === 'review' && (
                <div className="space-y-4">
                  <div className="bg-[#0f172a] rounded-lg p-4">
                    <h3 className="text-white font-medium mb-2">{artistName || 'Unnamed Artist'}</h3>
                    <p className="text-sm text-slate-400 mb-2">{genre || 'No genre specified'}</p>
                    <p className="text-sm text-slate-400">{location || 'No location specified'}</p>
                  </div>
                  <div className="bg-[#0f172a] rounded-lg p-4">
                    <p className="text-sm text-slate-300 line-clamp-3">{bio || 'No bio provided'}</p>
                  </div>
                  <div className="bg-[#0f172a] rounded-lg p-4">
                    <p className="text-sm text-slate-400">
                      {pressArticles.filter(a => a.outlet).length} press articles |
                      {videoUrl ? ' 1 video' : ' No video'} |
                      Deposit: {minimumDeposit} WMON
                    </p>
                  </div>
                  <p className="text-xs text-slate-500">
                    Publishing will upload your EPK to IPFS and register it on Monad blockchain.
                    {userAddress ? ` Wallet: ${userAddress.slice(0, 6)}...${userAddress.slice(-4)}` : ' Connect wallet for on-chain registration.'}
                  </p>
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        {!published && (
          <div className="flex items-center justify-between px-6 py-4 border-t border-white/10">
            <button
              onClick={goPrev}
              disabled={stepIndex === 0}
              className="flex items-center gap-1.5 text-sm text-slate-400 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >
              <ChevronLeft className="w-4 h-4" />
              Back
            </button>

            {error && <p className="text-xs text-red-400">{error}</p>}

            {step === 'review' ? (
              <button
                onClick={handlePublish}
                disabled={publishing}
                className="flex items-center gap-2 bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white font-medium px-6 py-2.5 rounded-lg transition-colors"
              >
                {publishing ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Publishing...
                  </>
                ) : (
                  <>
                    <CheckCircle className="w-4 h-4" />
                    Publish EPK
                  </>
                )}
              </button>
            ) : (
              <button
                onClick={goNext}
                className="flex items-center gap-1.5 text-sm bg-purple-600 hover:bg-purple-700 text-white px-4 py-2 rounded-lg transition-colors"
              >
                Next
                <ChevronRight className="w-4 h-4" />
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
