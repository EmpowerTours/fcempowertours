'use client';

import { useState, useEffect } from 'react';
import { Download, ExternalLink, Music, Play, Users, DollarSign, CheckCircle, MapPin } from 'lucide-react';
import type { EPKMetadata, ArtistStreamingStats } from '@/lib/epk/types';
import { getRumbleEmbedUrl } from '@/lib/epk/utils';
import BookingForm from './BookingForm';
import RiderAccordion from './RiderAccordion';
import StreamingStats from './StreamingStats';
import MusicCatalog from './MusicCatalog';

interface EPKPageProps {
  identifier: string;
}

export default function EPKPage({ identifier }: EPKPageProps) {
  const [epk, setEpk] = useState<EPKMetadata | null>(null);
  const [stats, setStats] = useState<ArtistStreamingStats | null>(null);
  const [artistAddress, setArtistAddress] = useState<string>('');
  const [ipfsUrl, setIpfsUrl] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>('');

  useEffect(() => {
    async function fetchEPK() {
      try {
        const res = await fetch(`/api/epk/${identifier}`);
        const data = await res.json();

        if (!res.ok || !data.success) {
          setError(data.error || 'EPK not found');
          return;
        }

        setEpk(data.epk);
        setStats(data.streamingStats);
        setArtistAddress(data.artistAddress || '');
        setIpfsUrl(data.ipfsUrl || '');
      } catch (err: any) {
        setError(err.message || 'Failed to load EPK');
      } finally {
        setLoading(false);
      }
    }

    fetchEPK();
  }, [identifier]);

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0f172a] flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin w-8 h-8 border-2 border-purple-400 border-t-transparent rounded-full mx-auto mb-4" />
          <p className="text-slate-400">Loading press kit...</p>
        </div>
      </div>
    );
  }

  if (error || !epk) {
    return (
      <div className="min-h-screen bg-[#0f172a] flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-white mb-2">Press Kit Not Found</h1>
          <p className="text-slate-400">{error || 'This EPK does not exist.'}</p>
        </div>
      </div>
    );
  }

  const verified = !!epk.onChain?.ipfsCid;

  return (
    <div className="min-h-screen bg-[#0f172a]">
      {/* Hero Section */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-[#0f172a] via-[#1e1b4b] to-[#312e81]" />
        <div className="relative max-w-5xl mx-auto px-4 sm:px-6 py-16 sm:py-24">
          <div className="flex flex-col sm:flex-row items-start gap-8">
            {/* Artist Info */}
            <div className="flex-1">
              <div className="flex items-center gap-3 mb-4">
                {verified && (
                  <span className="inline-flex items-center gap-1.5 text-xs font-medium text-green-400 bg-green-400/10 border border-green-400/20 rounded-full px-3 py-1">
                    <CheckCircle className="w-3.5 h-3.5" />
                    On-Chain Verified
                  </span>
                )}
              </div>

              <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold text-white mb-4">
                {epk.artist.name}
              </h1>

              <div className="flex flex-wrap gap-2 mb-4">
                {epk.artist.genre.map((g) => (
                  <span
                    key={g}
                    className="text-sm text-purple-300 bg-purple-500/10 border border-purple-500/20 rounded-full px-4 py-1"
                  >
                    {g}
                  </span>
                ))}
              </div>

              <p className="flex items-center gap-2 text-slate-400 mb-8">
                <MapPin className="w-4 h-4" />
                {epk.artist.location}
              </p>

              <div className="flex flex-wrap gap-3">
                <a
                  href={`/api/epk/pdf/${identifier}`}
                  className="inline-flex items-center gap-2 bg-purple-600 hover:bg-purple-700 text-white font-medium px-6 py-3 rounded-lg transition-colors"
                >
                  <Download className="w-4 h-4" />
                  Download PDF
                </a>
                <a
                  href="#booking"
                  className="inline-flex items-center gap-2 bg-white/10 hover:bg-white/20 text-white font-medium px-6 py-3 rounded-lg border border-white/10 transition-colors"
                >
                  Book Now
                </a>
                {verified && epk.onChain?.ipfsCid && (
                  <a
                    href={ipfsUrl || `https://ipfs.io/ipfs/${epk.onChain.ipfsCid}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 text-sm text-slate-400 hover:text-purple-300 px-4 py-3 transition-colors"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                    IPFS
                  </a>
                )}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Content */}
      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-12 space-y-16">
        {/* About */}
        <section>
          <h2 className="text-2xl font-bold text-white mb-6 flex items-center gap-3">
            <span className="w-1 h-8 bg-purple-500 rounded-full" />
            About
          </h2>
          <p className="text-slate-300 leading-relaxed text-lg">
            {epk.artist.bio}
          </p>
        </section>

        {/* Music Catalog */}
        {epk.musicCatalog.showCatalog && stats?.topSongs && stats.topSongs.length > 0 && (
          <section>
            <h2 className="text-2xl font-bold text-white mb-6 flex items-center gap-3">
              <span className="w-1 h-8 bg-purple-500 rounded-full" />
              Music Catalog
            </h2>
            <MusicCatalog songs={stats.topSongs} />
          </section>
        )}

        {/* Streaming Stats */}
        {stats && (stats.totalPlays > 0 || stats.totalSales > 0) && (
          <section>
            <h2 className="text-2xl font-bold text-white mb-6 flex items-center gap-3">
              <span className="w-1 h-8 bg-purple-500 rounded-full" />
              On-Chain Streaming Stats
            </h2>
            <StreamingStats stats={stats} />
          </section>
        )}

        {/* Media */}
        {(epk.media.videos.length > 0 || epk.media.photos.length > 0) && (
          <section>
            <h2 className="text-2xl font-bold text-white mb-6 flex items-center gap-3">
              <span className="w-1 h-8 bg-purple-500 rounded-full" />
              Media
            </h2>
            <div className="space-y-6">
              {epk.media.videos.map((video, i) => {
                const embedUrl = video.platform === 'rumble' ? getRumbleEmbedUrl(video.url) : null;
                return (
                  <div key={i} className="rounded-xl overflow-hidden bg-[#1e293b]">
                    {embedUrl ? (
                      <div className="aspect-video">
                        <iframe
                          src={embedUrl}
                          className="w-full h-full"
                          allowFullScreen
                          title={video.title}
                        />
                      </div>
                    ) : (
                      <a
                        href={video.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-4 p-6 hover:bg-white/5 transition-colors"
                      >
                        <Play className="w-10 h-10 text-purple-400" />
                        <div>
                          <p className="text-white font-medium">{video.title}</p>
                          <p className="text-sm text-slate-400">{video.platform}</p>
                        </div>
                      </a>
                    )}
                    <div className="px-6 py-3 border-t border-white/5">
                      <p className="text-sm text-slate-300">{video.title}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {/* Press */}
        {epk.press.length > 0 && (
          <section>
            <h2 className="text-2xl font-bold text-white mb-6 flex items-center gap-3">
              <span className="w-1 h-8 bg-purple-500 rounded-full" />
              Press
            </h2>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {epk.press.map((article, i) => (
                <a
                  key={i}
                  href={article.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="group block bg-[#1e293b] rounded-xl p-6 border border-white/5 hover:border-purple-500/30 transition-all"
                >
                  <p className="text-xs font-semibold text-purple-400 uppercase tracking-wider mb-2">
                    {article.outlet}
                  </p>
                  <h3 className="text-white font-medium mb-3 group-hover:text-purple-300 transition-colors line-clamp-2">
                    {article.title}
                  </h3>
                  <p className="text-sm text-slate-400 line-clamp-3 mb-3">
                    {article.excerpt}
                  </p>
                  <p className="text-xs text-slate-500">
                    {new Date(article.date).toLocaleDateString('en-US', {
                      year: 'numeric',
                      month: 'long',
                      day: 'numeric',
                    })}
                  </p>
                </a>
              ))}
            </div>
          </section>
        )}

        {/* Technical Rider */}
        <section>
          <h2 className="text-2xl font-bold text-white mb-6 flex items-center gap-3">
            <span className="w-1 h-8 bg-purple-500 rounded-full" />
            Technical Rider
          </h2>
          <RiderAccordion sections={Object.values(epk.technicalRider)} />
        </section>

        {/* Hospitality Rider */}
        <section>
          <h2 className="text-2xl font-bold text-white mb-6 flex items-center gap-3">
            <span className="w-1 h-8 bg-purple-500 rounded-full" />
            Hospitality Rider
          </h2>
          <RiderAccordion sections={Object.values(epk.hospitalityRider)} />
        </section>

        {/* Booking */}
        {epk.booking.inquiryEnabled && (
          <section id="booking">
            <h2 className="text-2xl font-bold text-white mb-2 flex items-center gap-3">
              <span className="w-1 h-8 bg-purple-500 rounded-full" />
              Booking Inquiry
            </h2>
            <p className="text-slate-400 mb-6">
              {epk.booking.pricing} | WMON deposit required for confirmation
            </p>

            <div className="grid gap-8 lg:grid-cols-3">
              <div className="lg:col-span-2">
                <BookingForm
                  artistAddress={artistAddress}
                  artistName={epk.artist.name}
                  minimumDeposit={epk.booking.minimumDeposit || '100'}
                />
              </div>
              <div className="space-y-6">
                <div className="bg-[#1e293b] rounded-xl p-6 border border-white/5">
                  <h3 className="text-white font-semibold mb-3">Available For</h3>
                  <ul className="space-y-2">
                    {epk.booking.availableFor.map((item, i) => (
                      <li key={i} className="text-sm text-slate-400 flex items-start gap-2">
                        <span className="text-purple-400 mt-0.5">&#8226;</span>
                        {item}
                      </li>
                    ))}
                  </ul>
                </div>
                <div className="bg-[#1e293b] rounded-xl p-6 border border-white/5">
                  <h3 className="text-white font-semibold mb-3">Target Events</h3>
                  <div className="flex flex-wrap gap-2">
                    {epk.booking.targetEvents.map((event, i) => (
                      <span
                        key={i}
                        className="text-xs text-slate-300 bg-white/5 rounded-full px-3 py-1"
                      >
                        {event}
                      </span>
                    ))}
                  </div>
                </div>
                <div className="bg-[#1e293b] rounded-xl p-6 border border-white/5">
                  <h3 className="text-white font-semibold mb-3">Territories</h3>
                  <p className="text-sm text-slate-400">{epk.booking.territories.join(', ')}</p>
                </div>
              </div>
            </div>
          </section>
        )}

        {/* Footer */}
        <footer className="border-t border-white/5 pt-8">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              {epk.socials?.farcaster && (
                <a
                  href={`https://warpcast.com/${epk.socials.farcaster}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm text-slate-400 hover:text-purple-300 transition-colors"
                >
                  Farcaster
                </a>
              )}
              {epk.socials?.twitter && (
                <a
                  href={`https://twitter.com/${epk.socials.twitter}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm text-slate-400 hover:text-purple-300 transition-colors"
                >
                  Twitter
                </a>
              )}
              {epk.socials?.instagram && (
                <a
                  href={`https://instagram.com/${epk.socials.instagram}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm text-slate-400 hover:text-purple-300 transition-colors"
                >
                  Instagram
                </a>
              )}
            </div>
            <div className="flex items-center gap-4 text-xs text-slate-500">
              {verified && epk.onChain?.ipfsCid && (
                <a
                  href={ipfsUrl || '#'}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:text-purple-400 transition-colors"
                >
                  IPFS: {epk.onChain.ipfsCid.slice(0, 12)}...
                </a>
              )}
              <span>Powered by EmpowerTours on Monad</span>
            </div>
          </div>
        </footer>
      </div>
    </div>
  );
}
