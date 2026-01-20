'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useFarcasterContext } from '@/app/hooks/useFarcasterContext';
import { Calendar, MapPin, Users, Gift, Check, Loader2, Ticket, Navigation } from 'lucide-react';

interface Invite {
  code: string;
  eventId: string;
  eventName: string;
  guestName?: string;
  guestEmail?: string;
  walletAddress?: string;
  fid?: number;
  status: 'pending' | 'accepted' | 'checked_in' | 'claimed';
  createdAt: number;
  acceptedAt?: number;
  checkedInAt?: number;
}

interface EventDetails {
  eventId: string;
  name: string;
  description: string;
  venueName?: string;
  venueAddress?: string;
  city: string;
  country: string;
  eventDate: number;
  checkInStart?: number;
  checkInEnd?: number;
  maxAttendees?: number;
  checkedInCount?: number;
  wmonRewardPerUser?: string;
  toursRewardPerUser?: string;
  sponsorName?: string;
  sponsorLogoUrl?: string;
}

export default function EventInvitePage() {
  const params = useParams();
  const router = useRouter();
  const code = (params.code as string)?.toUpperCase();

  const { user, custodyAddress, loading: farcasterLoading } = useFarcasterContext();

  const [invite, setInvite] = useState<Invite | null>(null);
  const [event, setEvent] = useState<EventDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [accepting, setAccepting] = useState(false);
  const [guestName, setGuestName] = useState('');
  const [checkingIn, setCheckingIn] = useState(false);
  const [gettingLocation, setGettingLocation] = useState(false);
  const [userLocation, setUserLocation] = useState<{ latitude: number; longitude: number } | null>(null);

  // Fetch invite details
  useEffect(() => {
    const fetchInvite = async () => {
      if (!code) return;

      try {
        setLoading(true);
        const response = await fetch(`/api/events/invite?code=${code}`);
        const data = await response.json();

        if (!data.success) {
          setError(data.error || 'Invite not found');
          return;
        }

        setInvite(data.invite);

        // Fetch event details
        if (data.invite.eventId) {
          const eventsResponse = await fetch('/api/events/list');
          const eventsData = await eventsResponse.json();

          if (eventsData.success && eventsData.events) {
            const eventDetails = eventsData.events.find(
              (e: any) => e.eventId === data.invite.eventId || String(e.eventId) === String(data.invite.eventId)
            );
            if (eventDetails) {
              setEvent(eventDetails);
            }
          }
        }
      } catch (err: any) {
        console.error('[EventInvite] Error:', err);
        setError(err.message || 'Failed to load invite');
      } finally {
        setLoading(false);
      }
    };

    fetchInvite();
  }, [code]);

  // Auto-fill guest name from invite or Farcaster
  useEffect(() => {
    if (invite?.guestName) {
      setGuestName(invite.guestName);
    } else if (user?.displayName) {
      setGuestName(user.displayName);
    } else if (user?.username) {
      setGuestName(user.username);
    }
  }, [invite, user]);

  const handleAcceptInvite = async () => {
    if (!code) return;

    setAccepting(true);
    setError(null);

    try {
      const response = await fetch('/api/events/invite', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          code,
          walletAddress: custodyAddress || undefined,
          fid: user?.fid || undefined,
          guestName: guestName || undefined,
        }),
      });

      const data = await response.json();

      if (!data.success) {
        setError(data.error || 'Failed to accept invite');
        return;
      }

      setInvite(data.invite);
    } catch (err: any) {
      console.error('[EventInvite] Accept error:', err);
      setError(err.message || 'Failed to accept invite');
    } finally {
      setAccepting(false);
    }
  };

  const getUserLocation = () => {
    setGettingLocation(true);

    if (!navigator.geolocation) {
      setError('Geolocation not supported by your browser');
      setGettingLocation(false);
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        setUserLocation({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
        });
        setGettingLocation(false);
      },
      (err) => {
        console.error('[EventInvite] Location error:', err);
        setError('Failed to get your location. Please enable location services.');
        setGettingLocation(false);
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 0,
      }
    );
  };

  const handleCheckIn = async () => {
    if (!code || !invite || !userLocation) return;

    setCheckingIn(true);
    setError(null);

    try {
      // Scale coordinates by 1e6 as expected by the API
      const scaledLat = Math.round(userLocation.latitude * 1e6);
      const scaledLon = Math.round(userLocation.longitude * 1e6);

      const response = await fetch('/api/events/checkin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          eventId: invite.eventId,
          inviteCode: code,
          latitude: scaledLat,
          longitude: scaledLon,
          userFid: user?.fid,
        }),
      });

      const data = await response.json();

      if (!data.success) {
        setError(data.error || 'Failed to check in');
        return;
      }

      // Update invite status locally
      setInvite({ ...invite, status: 'checked_in', checkedInAt: Date.now() });
    } catch (err: any) {
      console.error('[EventInvite] Check-in error:', err);
      setError(err.message || 'Failed to check in');
    } finally {
      setCheckingIn(false);
    }
  };

  const formatDate = (timestamp: number) => {
    const date = new Date(timestamp * 1000);
    return date.toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  if (loading || farcasterLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-gray-900 to-black flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-12 h-12 animate-spin text-purple-500 mx-auto mb-4" />
          <p className="text-gray-400">Loading invite...</p>
        </div>
      </div>
    );
  }

  if (error && !invite) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-gray-900 to-black flex items-center justify-center p-6">
        <div className="bg-red-900/30 border border-red-500/50 rounded-xl p-8 max-w-md text-center">
          <Ticket className="w-16 h-16 text-red-400 mx-auto mb-4" />
          <h1 className="text-2xl font-bold text-white mb-2">Invite Not Found</h1>
          <p className="text-gray-400 mb-6">{error}</p>
          <button
            onClick={() => router.push('/')}
            className="bg-purple-600 hover:bg-purple-700 text-white px-6 py-3 rounded-lg font-semibold"
          >
            Go Home
          </button>
        </div>
      </div>
    );
  }

  if (!invite) return null;

  const isAccepted = invite.status !== 'pending';
  const hasRewards = event?.wmonRewardPerUser || event?.toursRewardPerUser;

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-900 via-purple-900/20 to-black text-white">
      {/* Header */}
      <div className="bg-gradient-to-r from-purple-600 to-pink-600 p-6">
        <div className="max-w-2xl mx-auto">
          <div className="flex items-center gap-2 text-purple-200 text-sm mb-2">
            <Ticket className="w-4 h-4" />
            <span>Event Invite</span>
          </div>
          <h1 className="text-3xl font-bold">
            {invite.eventName || event?.name || 'Event Invitation'}
          </h1>
          {invite.guestName && (
            <p className="text-purple-200 mt-1">
              For: {invite.guestName}
            </p>
          )}
        </div>
      </div>

      <div className="max-w-2xl mx-auto p-6 space-y-6">
        {/* Invite Status Card */}
        <div className={`rounded-xl p-6 ${
          isAccepted
            ? 'bg-green-900/30 border border-green-500/50'
            : 'bg-gray-800/50 border border-gray-700'
        }`}>
          <div className="flex items-center gap-3 mb-4">
            {isAccepted ? (
              <>
                <div className="w-12 h-12 bg-green-500/20 rounded-full flex items-center justify-center">
                  <Check className="w-6 h-6 text-green-400" />
                </div>
                <div>
                  <h2 className="text-xl font-bold text-green-400">Invite Accepted!</h2>
                  <p className="text-gray-400 text-sm">
                    {invite.status === 'checked_in' ? 'Checked in at event' :
                     invite.status === 'claimed' ? 'Rewards claimed' :
                     'Ready to check in'}
                  </p>
                </div>
              </>
            ) : (
              <>
                <div className="w-12 h-12 bg-purple-500/20 rounded-full flex items-center justify-center">
                  <Ticket className="w-6 h-6 text-purple-400" />
                </div>
                <div>
                  <h2 className="text-xl font-bold">You're Invited!</h2>
                  <p className="text-gray-400 text-sm">Accept to confirm your attendance</p>
                </div>
              </>
            )}
          </div>

          <div className="bg-gray-900/50 rounded-lg p-4 mb-4">
            <div className="text-xs text-gray-500 mb-1">Invite Code</div>
            <div className="text-2xl font-mono font-bold tracking-wider text-purple-400">
              {code}
            </div>
          </div>

          {!isAccepted && (
            <>
              {/* Guest name input */}
              <div className="mb-4">
                <label className="block text-sm text-gray-400 mb-2">Your Name</label>
                <input
                  type="text"
                  value={guestName}
                  onChange={(e) => setGuestName(e.target.value)}
                  placeholder="Enter your name"
                  className="w-full bg-gray-900 border border-gray-700 rounded-lg px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:border-purple-500"
                />
              </div>

              {error && (
                <div className="bg-red-900/30 border border-red-500/50 rounded-lg p-3 mb-4 text-red-400 text-sm">
                  {error}
                </div>
              )}

              <button
                onClick={handleAcceptInvite}
                disabled={accepting}
                className="w-full bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 disabled:opacity-50 text-white py-4 rounded-xl font-bold text-lg flex items-center justify-center gap-2"
              >
                {accepting ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    Accepting...
                  </>
                ) : (
                  <>
                    <Check className="w-5 h-5" />
                    Accept Invite
                  </>
                )}
              </button>

              {!custodyAddress && (
                <p className="text-xs text-gray-500 text-center mt-3">
                  No wallet connected - you can still accept and link a wallet later
                </p>
              )}
            </>
          )}

          {/* Check-in Section - shown when accepted but not yet checked in */}
          {isAccepted && invite.status === 'accepted' && (
            <div className="mt-6 pt-6 border-t border-gray-700">
              <h3 className="font-semibold mb-4">Check In at Event</h3>

              {error && (
                <div className="bg-red-900/30 border border-red-500/50 rounded-lg p-3 mb-4 text-red-400 text-sm">
                  {error}
                </div>
              )}

              {/* Step 1: Get Location */}
              <div className="mb-4">
                <button
                  onClick={getUserLocation}
                  disabled={gettingLocation || !!userLocation}
                  className={`w-full py-3 px-4 rounded-lg font-semibold flex items-center justify-center gap-2 ${
                    userLocation
                      ? 'bg-green-600/20 border border-green-500/50 text-green-400'
                      : 'bg-blue-600 hover:bg-blue-700 text-white'
                  } disabled:opacity-50`}
                >
                  {gettingLocation ? (
                    <>
                      <Loader2 className="w-5 h-5 animate-spin" />
                      Getting Location...
                    </>
                  ) : userLocation ? (
                    <>
                      <Check className="w-5 h-5" />
                      Location Ready
                    </>
                  ) : (
                    <>
                      <Navigation className="w-5 h-5" />
                      Get My Location
                    </>
                  )}
                </button>
                {userLocation && (
                  <p className="text-xs text-gray-500 text-center mt-2">
                    {userLocation.latitude.toFixed(4)}, {userLocation.longitude.toFixed(4)}
                  </p>
                )}
              </div>

              {/* Step 2: Check In */}
              <button
                onClick={handleCheckIn}
                disabled={checkingIn || !userLocation}
                className="w-full bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed text-white py-4 rounded-xl font-bold text-lg flex items-center justify-center gap-2"
              >
                {checkingIn ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    Checking In...
                  </>
                ) : (
                  <>
                    <Check className="w-5 h-5" />
                    Check In Now
                  </>
                )}
              </button>

              {!userLocation && (
                <p className="text-xs text-gray-500 text-center mt-3">
                  Get your location first to check in
                </p>
              )}
            </div>
          )}

          {/* Checked in confirmation */}
          {isAccepted && (invite.status === 'checked_in' || invite.status === 'claimed') && (
            <div className="mt-6 pt-6 border-t border-gray-700 text-center">
              <div className="inline-flex items-center gap-2 bg-green-600/20 border border-green-500/50 rounded-full px-4 py-2 text-green-400">
                <Check className="w-4 h-4" />
                Checked In!
              </div>
              <p className="text-sm text-gray-400 mt-3">
                You're all set. Enjoy the event!
              </p>
            </div>
          )}
        </div>

        {/* Event Details */}
        {event && (
          <div className="bg-gray-800/50 rounded-xl p-6 border border-gray-700">
            <h3 className="text-lg font-bold mb-4">Event Details</h3>

            <div className="space-y-4">
              <div className="flex items-start gap-3">
                <Calendar className="w-5 h-5 text-purple-400 mt-0.5" />
                <div>
                  <div className="font-semibold">Date & Time</div>
                  <div className="text-gray-400">{formatDate(event.eventDate)}</div>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <MapPin className="w-5 h-5 text-purple-400 mt-0.5" />
                <div>
                  <div className="font-semibold">{event.venueName || 'Venue'}</div>
                  <div className="text-gray-400">
                    {event.venueAddress || `${event.city}, ${event.country}`}
                  </div>
                </div>
              </div>

              {event.maxAttendees && (
                <div className="flex items-start gap-3">
                  <Users className="w-5 h-5 text-purple-400 mt-0.5" />
                  <div>
                    <div className="font-semibold">Capacity</div>
                    <div className="text-gray-400">
                      {event.checkedInCount || 0} / {event.maxAttendees} attendees
                    </div>
                  </div>
                </div>
              )}

              {hasRewards && (
                <div className="flex items-start gap-3">
                  <Gift className="w-5 h-5 text-purple-400 mt-0.5" />
                  <div>
                    <div className="font-semibold">Check-in Rewards</div>
                    <div className="text-gray-400">
                      {event.wmonRewardPerUser && `${event.wmonRewardPerUser} WMON`}
                      {event.wmonRewardPerUser && event.toursRewardPerUser && ' + '}
                      {event.toursRewardPerUser && `${event.toursRewardPerUser} TOURS`}
                    </div>
                  </div>
                </div>
              )}
            </div>

            {event.description && (
              <div className="mt-6 pt-4 border-t border-gray-700">
                <h4 className="font-semibold mb-2">About</h4>
                <p className="text-gray-400 text-sm">{event.description}</p>
              </div>
            )}

            {event.sponsorName && (
              <div className="mt-4 pt-4 border-t border-gray-700 flex items-center gap-3">
                {event.sponsorLogoUrl && (
                  <img
                    src={event.sponsorLogoUrl}
                    alt={event.sponsorName}
                    className="w-10 h-10 rounded-lg object-cover"
                  />
                )}
                <div>
                  <div className="text-xs text-gray-500">Sponsored by</div>
                  <div className="font-semibold">{event.sponsorName}</div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Wallet Connection Status */}
        {isAccepted && (
          <div className="bg-gray-800/50 rounded-xl p-6 border border-gray-700">
            <h3 className="text-lg font-bold mb-4">Your Details</h3>

            <div className="space-y-3">
              {invite.guestName && (
                <div className="flex justify-between">
                  <span className="text-gray-400">Name</span>
                  <span>{invite.guestName}</span>
                </div>
              )}

              {invite.walletAddress && (
                <div className="flex justify-between">
                  <span className="text-gray-400">Wallet</span>
                  <span className="font-mono text-sm">
                    {invite.walletAddress.slice(0, 6)}...{invite.walletAddress.slice(-4)}
                  </span>
                </div>
              )}

              {invite.fid && (
                <div className="flex justify-between">
                  <span className="text-gray-400">Farcaster FID</span>
                  <span>{invite.fid}</span>
                </div>
              )}

              {!invite.walletAddress && (
                <div className="bg-yellow-900/30 border border-yellow-500/50 rounded-lg p-3 text-yellow-400 text-sm">
                  Connect a wallet to receive rewards at check-in
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
