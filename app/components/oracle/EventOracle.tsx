'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { X, Calendar, MapPin, Users, Upload, QrCode, Check, Clock, Gift, Sparkles, Camera, Navigation, Building } from 'lucide-react';
import { useAccount } from 'wagmi';
import { useFarcasterContext } from '@/app/hooks/useFarcasterContext';
import QRCode from 'qrcode';

/**
 * EventOracle Component
 *
 * Manages sponsored events, QR code generation, GPS check-ins,
 * and Travel Stamp NFT distribution.
 *
 * For "Rendez-vous Gala Mexico 2026" by La Mille
 * - 10,000 MON sponsorship
 * - 120 guests at Casa Seminario 12, Mexico City
 * - Travel Stamp NFT for attendees
 */

interface SponsoredEvent {
  eventId: string;
  name: string;
  description: string;
  eventType: 'Gala' | 'Conference' | 'Festival' | 'Meetup' | 'Custom';
  status: 'Pending' | 'Active' | 'Completed' | 'Cancelled';
  sponsor: string;
  sponsorFid: number;
  sponsorName: string;
  sponsorLogoIPFS: string;
  sponsorLogoUrl?: string;
  totalDeposit: string;
  wmonRewardPerUser: string;
  toursRewardPerUser: string;
  venueName: string;
  venueAddress: string;
  city: string;
  country: string;
  latitude: number;
  longitude: number;
  googlePlaceId: string;
  eventDate: number;
  checkInStart: number;
  checkInEnd: number;
  maxAttendees: number;
  checkedInCount: number;
  stampImageIPFS: string;
  stampName: string;
}

interface Attendee {
  userAddress: string;
  userFid: number;
  username?: string;
  pfpUrl?: string;
  checkInTime: number;
  gpsVerified: boolean;
  rewardsClaimed: boolean;
  stampTokenId: string;
}

interface EventOracleProps {
  isOpen: boolean;
  onClose: () => void;
  isDarkMode?: boolean;
}

type TabType = 'events' | 'create' | 'checkin' | 'manage';

export const EventOracle: React.FC<EventOracleProps> = ({ isOpen, onClose, isDarkMode = true }) => {
  const { address, isConnected } = useAccount();
  const { user } = useFarcasterContext();
  const userFid = user?.fid || 0;

  console.log('[EventOracle] Rendering, isOpen:', isOpen, 'userFid:', userFid);

  const [activeTab, setActiveTab] = useState<TabType>('events');
  const [events, setEvents] = useState<SponsoredEvent[]>([]);
  const [selectedEvent, setSelectedEvent] = useState<SponsoredEvent | null>(null);
  const [attendees, setAttendees] = useState<Attendee[]>([]);
  const [loading, setLoading] = useState(false);
  const [qrCodeDataUrl, setQrCodeDataUrl] = useState<string>('');
  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [locationError, setLocationError] = useState<string>('');

  // Create event form (simplified - TOURS only, optional logo)
  const [createForm, setCreateForm] = useState({
    name: '',
    description: '',
    eventType: 'Gala' as const,
    sponsorName: '',
    depositAmount: '',
    venueName: '',
    venueAddress: '',
    city: '',
    country: '',
    latitude: '',
    longitude: '',
    googlePlaceId: '',
    eventDate: '',
    maxAttendees: '120',
    toursPerUser: '100',
  });
  const [isCapturingLocation, setIsCapturingLocation] = useState(false);
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoPreview, setLogoPreview] = useState<string>('');

  // Fetch events
  const fetchEvents = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/events/list');
      const data = await response.json();
      if (data.success) {
        setEvents(data.events);
      }
    } catch (error) {
      console.error('[EventOracle] Failed to fetch events:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isOpen) {
      fetchEvents();
    }
  }, [isOpen, fetchEvents]);

  // Get user's GPS location (for check-in)
  const requestLocation = useCallback(() => {
    if (!navigator.geolocation) {
      setLocationError('Geolocation is not supported by your browser');
      return;
    }

    setLocationError('');
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setUserLocation({
          lat: position.coords.latitude,
          lng: position.coords.longitude,
        });
      },
      (error) => {
        switch (error.code) {
          case error.PERMISSION_DENIED:
            setLocationError('Location permission denied. Please enable location access.');
            break;
          case error.POSITION_UNAVAILABLE:
            setLocationError('Location information is unavailable.');
            break;
          case error.TIMEOUT:
            setLocationError('Location request timed out.');
            break;
          default:
            setLocationError('An unknown error occurred.');
        }
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 0,
      }
    );
  }, []);

  // Capture venue GPS for create form
  const captureVenueLocation = useCallback(() => {
    if (!navigator.geolocation) {
      alert('Geolocation is not supported by your browser');
      return;
    }

    setIsCapturingLocation(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setCreateForm(prev => ({
          ...prev,
          latitude: position.coords.latitude.toFixed(6),
          longitude: position.coords.longitude.toFixed(6),
        }));
        setIsCapturingLocation(false);
      },
      (error) => {
        alert('Could not get location. Please enter coordinates manually.');
        setIsCapturingLocation(false);
      },
      {
        enableHighAccuracy: true,
        timeout: 15000,
        maximumAge: 0,
      }
    );
  }, []);

  // Generate QR code for event
  const generateQRCode = async (event: SponsoredEvent) => {
    const qrData = JSON.stringify({
      eventId: event.eventId,
      name: event.name,
      checkInUrl: `${window.location.origin}/event/checkin/${event.eventId}`,
    });

    try {
      const dataUrl = await QRCode.toDataURL(qrData, {
        width: 300,
        margin: 2,
        color: {
          dark: '#000000',
          light: '#ffffff',
        },
      });
      setQrCodeDataUrl(dataUrl);
    } catch (error) {
      console.error('[EventOracle] QR generation failed:', error);
    }
  };

  // Handle logo upload
  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setLogoFile(file);
      const reader = new FileReader();
      reader.onloadend = () => {
        setLogoPreview(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  // Create event
  const handleCreateEvent = async () => {
    if (!isConnected || !address) {
      alert('Please connect your wallet');
      return;
    }

    // Validate required fields
    if (!createForm.name || !createForm.city || !createForm.eventDate) {
      alert('Please fill in all required fields: Event Name, City, and Event Date');
      return;
    }

    setLoading(true);
    try {
      // Upload logo to IPFS first
      let logoIPFS = '';
      if (logoFile) {
        const formData = new FormData();
        formData.append('file', logoFile);
        const uploadRes = await fetch('/api/upload-to-ipfs', {
          method: 'POST',
          body: formData,
        });
        const uploadData = await uploadRes.json();
        if (uploadData.success) {
          logoIPFS = uploadData.ipfsHash;
        }
      }

      // Create event via API (TOURS rewards only)
      const response = await fetch('/api/events/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...createForm,
          sponsorAddress: address,
          sponsorFid: userFid,
          sponsorLogoIPFS: logoIPFS || '', // Optional
          depositAmount: createForm.depositAmount || '0', // Optional deposit
          latitude: createForm.latitude ? parseFloat(createForm.latitude) * 1e6 : 0,
          longitude: createForm.longitude ? parseFloat(createForm.longitude) * 1e6 : 0,
          eventDate: new Date(createForm.eventDate).getTime() / 1000,
          maxAttendees: parseInt(createForm.maxAttendees) || 100,
          toursPerUser: createForm.toursPerUser,
        }),
      });

      const data = await response.json();
      if (data.success) {
        alert('Event created successfully!');
        setActiveTab('events');
        fetchEvents();
      } else {
        throw new Error(data.error || 'Failed to create event');
      }
    } catch (error: any) {
      console.error('[EventOracle] Create event failed:', error);
      alert(`Failed to create event: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  // Check in to event
  const handleCheckIn = async (event: SponsoredEvent) => {
    if (!isConnected || !address) {
      alert('Please connect your wallet');
      return;
    }

    if (!userLocation) {
      alert('Please enable location access to check in');
      requestLocation();
      return;
    }

    setLoading(true);
    try {
      const response = await fetch('/api/events/checkin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          eventId: event.eventId,
          userAddress: address,
          userFid,
          latitude: userLocation.lat * 1e6,
          longitude: userLocation.lng * 1e6,
        }),
      });

      const data = await response.json();
      if (data.success) {
        alert(data.gpsVerified
          ? 'Check-in successful! GPS verified.'
          : 'Checked in, but GPS could not be verified (too far from venue).'
        );
        fetchEvents();
      } else {
        throw new Error(data.error || 'Check-in failed');
      }
    } catch (error: any) {
      console.error('[EventOracle] Check-in failed:', error);
      alert(`Check-in failed: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  // Claim rewards
  const handleClaimRewards = async (event: SponsoredEvent) => {
    if (!isConnected || !address) {
      alert('Please connect your wallet');
      return;
    }

    setLoading(true);
    try {
      const response = await fetch('/api/events/claim-rewards', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          eventId: event.eventId,
          userAddress: address,
        }),
      });

      const data = await response.json();
      if (data.success) {
        alert(`Rewards claimed! You received ${data.toursAmount} TOURS and Travel Stamp #${data.stampTokenId}`);
        fetchEvents();
      } else {
        throw new Error(data.error || 'Claim failed');
      }
    } catch (error: any) {
      console.error('[EventOracle] Claim failed:', error);
      alert(`Claim failed: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  // Use portal to render modal at document body level to avoid z-index stacking issues
  if (typeof document === 'undefined') return null;

  const modalContent = (
    <div className={`fixed inset-0 z-[100] flex items-center justify-center ${isDarkMode ? 'bg-black' : 'bg-white'}`} style={{ backgroundColor: isDarkMode ? '#000000' : '#ffffff' }}>
      <div className={`relative w-full max-w-2xl max-h-[90vh] overflow-hidden rounded-2xl shadow-2xl ${isDarkMode ? 'bg-gradient-to-br from-gray-900 via-purple-900/20 to-gray-900 border border-purple-500/30' : 'bg-white border border-gray-200'}`}>
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-purple-500/30">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-purple-500/20 rounded-xl">
              <Sparkles className="w-6 h-6 text-purple-400" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-white">Event Oracle</h2>
              <p className="text-sm text-gray-400">Sponsored Events & Travel Stamps</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-gray-800 rounded-lg transition-colors">
            <X className="w-5 h-5 text-gray-400" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-purple-500/30">
          {[
            { id: 'events', label: 'Events', icon: Calendar },
            { id: 'checkin', label: 'Check-in', icon: QrCode },
            { id: 'create', label: 'Sponsor', icon: Building },
            { id: 'manage', label: 'Manage', icon: Users },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as TabType)}
              className={`flex-1 flex items-center justify-center gap-2 py-3 text-sm font-medium transition-colors ${
                activeTab === tab.id
                  ? 'text-purple-400 border-b-2 border-purple-500 bg-purple-500/10'
                  : 'text-gray-400 hover:text-gray-200 hover:bg-gray-800/50'
              }`}
            >
              <tab.icon className="w-4 h-4" />
              {tab.label}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="p-4 overflow-y-auto max-h-[calc(90vh-180px)]">
          {/* Events List */}
          {activeTab === 'events' && (
            <div className="space-y-4">
              {loading ? (
                <div className="flex items-center justify-center py-12">
                  <div className="w-8 h-8 border-2 border-purple-500 border-t-transparent rounded-full animate-spin" />
                </div>
              ) : events.length === 0 ? (
                <div className="text-center py-12">
                  <Calendar className="w-12 h-12 mx-auto text-gray-600 mb-4" />
                  <p className="text-gray-400">No sponsored events yet</p>
                  <button
                    onClick={() => setActiveTab('create')}
                    className="mt-4 px-4 py-2 bg-purple-600 hover:bg-purple-500 rounded-lg text-white text-sm"
                  >
                    Create First Event
                  </button>
                </div>
              ) : (
                events.map((event) => (
                  <div
                    key={event.eventId}
                    className="p-4 bg-gray-800/50 rounded-xl border border-gray-700 hover:border-purple-500/50 transition-colors"
                  >
                    <div className="flex items-start gap-4">
                      {event.sponsorLogoUrl && (
                        <img
                          src={event.sponsorLogoUrl}
                          alt={event.sponsorName}
                          className="w-16 h-16 rounded-lg object-cover"
                        />
                      )}
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <h3 className="font-bold text-white">{event.name}</h3>
                          <span className={`px-2 py-0.5 text-xs rounded-full ${
                            event.status === 'Active' ? 'bg-green-500/20 text-green-400' :
                            event.status === 'Pending' ? 'bg-yellow-500/20 text-yellow-400' :
                            'bg-gray-500/20 text-gray-400'
                          }`}>
                            {event.status}
                          </span>
                        </div>
                        <p className="text-sm text-gray-400 mt-1">{event.description}</p>
                        <div className="flex flex-wrap gap-3 mt-2 text-xs text-gray-500">
                          <span className="flex items-center gap-1">
                            <MapPin className="w-3 h-3" />
                            {event.city}, {event.country}
                          </span>
                          <span className="flex items-center gap-1">
                            <Clock className="w-3 h-3" />
                            {new Date(event.eventDate * 1000).toLocaleDateString()}
                          </span>
                          <span className="flex items-center gap-1">
                            <Users className="w-3 h-3" />
                            {event.checkedInCount}/{event.maxAttendees}
                          </span>
                          <span className="flex items-center gap-1">
                            <Gift className="w-3 h-3" />
                            {event.toursRewardPerUser} TOURS + Travel Stamp
                          </span>
                        </div>
                      </div>
                    </div>
                    <div className="flex gap-2 mt-4">
                      <button
                        onClick={() => {
                          setSelectedEvent(event);
                          generateQRCode(event);
                          setActiveTab('checkin');
                        }}
                        className="flex-1 py-2 bg-purple-600 hover:bg-purple-500 rounded-lg text-white text-sm font-medium transition-colors"
                      >
                        View QR
                      </button>
                      {event.status === 'Active' && (
                        <button
                          onClick={() => handleCheckIn(event)}
                          disabled={loading}
                          className="flex-1 py-2 bg-green-600 hover:bg-green-500 rounded-lg text-white text-sm font-medium transition-colors"
                        >
                          Check In
                        </button>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          )}

          {/* Check-in Tab */}
          {activeTab === 'checkin' && (
            <div className="space-y-6">
              {selectedEvent ? (
                <div className="text-center">
                  <h3 className="text-xl font-bold text-white mb-2">{selectedEvent.name}</h3>
                  <p className="text-gray-400 mb-4">Scan this QR code at the event</p>

                  {qrCodeDataUrl && (
                    <div className="inline-block p-4 bg-white rounded-xl shadow-lg">
                      <img src={qrCodeDataUrl} alt="Event QR Code" className="w-64 h-64" />
                    </div>
                  )}

                  <div className="mt-6 p-4 bg-gray-800/50 rounded-xl">
                    <h4 className="font-medium text-white mb-2">Event Details</h4>
                    <div className="space-y-2 text-sm text-gray-400">
                      <p><MapPin className="inline w-4 h-4 mr-1" />{selectedEvent.venueName}</p>
                      <p>{selectedEvent.venueAddress}</p>
                      <p><Clock className="inline w-4 h-4 mr-1" />
                        {new Date(selectedEvent.eventDate * 1000).toLocaleString()}
                      </p>
                      <p><Gift className="inline w-4 h-4 mr-1" />
                        Rewards: {selectedEvent.toursRewardPerUser} TOURS + Travel Stamp NFT
                      </p>
                    </div>
                  </div>

                  {/* GPS Status */}
                  <div className="mt-4 p-4 bg-gray-800/50 rounded-xl">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-white font-medium">GPS Location</span>
                      <button
                        onClick={requestLocation}
                        className="text-sm text-purple-400 hover:text-purple-300"
                      >
                        <Navigation className="inline w-4 h-4 mr-1" />
                        Refresh
                      </button>
                    </div>
                    {userLocation ? (
                      <p className="text-green-400 text-sm">
                        <Check className="inline w-4 h-4 mr-1" />
                        Location: {userLocation.lat.toFixed(6)}, {userLocation.lng.toFixed(6)}
                      </p>
                    ) : locationError ? (
                      <p className="text-red-400 text-sm">{locationError}</p>
                    ) : (
                      <p className="text-gray-400 text-sm">Click refresh to get your location</p>
                    )}
                  </div>

                  <button
                    onClick={() => handleCheckIn(selectedEvent)}
                    disabled={loading || !userLocation}
                    className="w-full mt-4 py-3 bg-green-600 hover:bg-green-500 disabled:bg-gray-600 rounded-xl text-white font-medium transition-colors"
                  >
                    {loading ? 'Checking in...' : 'Check In Now'}
                  </button>
                </div>
              ) : (
                <div className="text-center py-12">
                  <QrCode className="w-12 h-12 mx-auto text-gray-600 mb-4" />
                  <p className="text-gray-400">Select an event to view its QR code</p>
                  <button
                    onClick={() => setActiveTab('events')}
                    className="mt-4 px-4 py-2 bg-purple-600 hover:bg-purple-500 rounded-lg text-white text-sm"
                  >
                    Browse Events
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Create/Sponsor Tab */}
          {activeTab === 'create' && (
            <div className="space-y-4">
              <div className="p-4 bg-purple-500/10 border border-purple-500/30 rounded-xl">
                <h3 className="font-bold text-purple-400 mb-2">Create a Sponsored Event</h3>
                <p className="text-sm text-gray-400">
                  Reward attendees with TOURS tokens and exclusive Travel Stamp NFTs.
                  GPS check-in verification available.
                </p>
              </div>

              {/* Logo Upload - Optional */}
              <div className="space-y-2">
                <label className="text-sm font-medium text-gray-300">
                  Sponsor Logo <span className="text-gray-500">(optional)</span>
                </label>
                <div className="flex items-center gap-4">
                  {logoPreview ? (
                    <div className="relative">
                      <img src={logoPreview} alt="Logo preview" className="w-20 h-20 rounded-lg object-cover" />
                      <button
                        onClick={() => { setLogoFile(null); setLogoPreview(''); }}
                        className="absolute -top-2 -right-2 w-5 h-5 bg-red-500 rounded-full flex items-center justify-center"
                      >
                        <X className="w-3 h-3 text-white" />
                      </button>
                    </div>
                  ) : (
                    <div className="w-20 h-20 bg-gray-800 rounded-lg flex items-center justify-center border-2 border-dashed border-gray-600">
                      <Upload className="w-6 h-6 text-gray-500" />
                    </div>
                  )}
                  <div className="flex flex-col gap-2">
                    <label className="px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg cursor-pointer text-sm text-white">
                      <Camera className="inline w-4 h-4 mr-2" />
                      Upload Logo
                      <input
                        type="file"
                        accept="image/*"
                        onChange={handleLogoUpload}
                        className="hidden"
                      />
                    </label>
                    <span className="text-xs text-gray-500">Or skip - text-only event</span>
                  </div>
                </div>
              </div>

              {/* Form Fields */}
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2">
                  <label className="text-sm font-medium text-gray-300">Event Name</label>
                  <input
                    type="text"
                    value={createForm.name}
                    onChange={(e) => setCreateForm({ ...createForm, name: e.target.value })}
                    placeholder="Rendez-vous Gala Mexico 2026"
                    className="w-full mt-1 px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder:text-gray-500 focus:border-purple-500 focus:outline-none"
                  />
                </div>

                <div className="col-span-2">
                  <label className="text-sm font-medium text-gray-300">Description</label>
                  <textarea
                    value={createForm.description}
                    onChange={(e) => setCreateForm({ ...createForm, description: e.target.value })}
                    placeholder="Art gala featuring Latin American artists..."
                    rows={3}
                    className="w-full mt-1 px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder:text-gray-500 focus:border-purple-500 focus:outline-none resize-none"
                  />
                </div>

                <div>
                  <label className="text-sm font-medium text-gray-300">Sponsor Name</label>
                  <input
                    type="text"
                    value={createForm.sponsorName}
                    onChange={(e) => setCreateForm({ ...createForm, sponsorName: e.target.value })}
                    placeholder="La Mille"
                    className="w-full mt-1 px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder:text-gray-500 focus:border-purple-500 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="text-sm font-medium text-gray-300">Event Type</label>
                  <select
                    value={createForm.eventType}
                    onChange={(e) => setCreateForm({ ...createForm, eventType: e.target.value as any })}
                    className="w-full mt-1 px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white focus:border-purple-500 focus:outline-none"
                  >
                    <option value="Gala">Gala</option>
                    <option value="Conference">Conference</option>
                    <option value="Festival">Festival</option>
                    <option value="Meetup">Meetup</option>
                    <option value="Custom">Custom</option>
                  </select>
                </div>

                <div>
                  <label className="text-sm font-medium text-gray-300">Venue Name</label>
                  <input
                    type="text"
                    value={createForm.venueName}
                    onChange={(e) => setCreateForm({ ...createForm, venueName: e.target.value })}
                    placeholder="Casa Seminario 12"
                    className="w-full mt-1 px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder:text-gray-500 focus:border-purple-500 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="text-sm font-medium text-gray-300">Event Date</label>
                  <input
                    type="datetime-local"
                    value={createForm.eventDate}
                    onChange={(e) => setCreateForm({ ...createForm, eventDate: e.target.value })}
                    className="w-full mt-1 px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white focus:border-purple-500 focus:outline-none"
                  />
                </div>

                <div className="col-span-2">
                  <label className="text-sm font-medium text-gray-300">Venue Address</label>
                  <input
                    type="text"
                    value={createForm.venueAddress}
                    onChange={(e) => setCreateForm({ ...createForm, venueAddress: e.target.value })}
                    placeholder="Seminario #12, Centro Historico, CDMX"
                    className="w-full mt-1 px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder:text-gray-500 focus:border-purple-500 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="text-sm font-medium text-gray-300">City</label>
                  <input
                    type="text"
                    value={createForm.city}
                    onChange={(e) => setCreateForm({ ...createForm, city: e.target.value })}
                    placeholder="Mexico City"
                    className="w-full mt-1 px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder:text-gray-500 focus:border-purple-500 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="text-sm font-medium text-gray-300">Country</label>
                  <input
                    type="text"
                    value={createForm.country}
                    onChange={(e) => setCreateForm({ ...createForm, country: e.target.value })}
                    placeholder="Mexico"
                    className="w-full mt-1 px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder:text-gray-500 focus:border-purple-500 focus:outline-none"
                  />
                </div>

                {/* GPS Location for Check-in Verification */}
                <div className="col-span-2 p-3 bg-gray-800/50 rounded-lg border border-gray-700">
                  <div className="flex items-center justify-between mb-2">
                    <label className="text-sm font-medium text-gray-300">
                      Venue GPS <span className="text-gray-500">(for check-in verification)</span>
                    </label>
                    <button
                      type="button"
                      onClick={captureVenueLocation}
                      disabled={isCapturingLocation}
                      className="flex items-center gap-1 px-3 py-1 bg-purple-600 hover:bg-purple-500 disabled:bg-gray-600 rounded text-xs text-white"
                    >
                      {isCapturingLocation ? (
                        <>
                          <div className="w-3 h-3 border border-white border-t-transparent rounded-full animate-spin" />
                          Getting...
                        </>
                      ) : (
                        <>
                          <Navigation className="w-3 h-3" />
                          Use My Location
                        </>
                      )}
                    </button>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <input
                      type="number"
                      step="0.000001"
                      value={createForm.latitude}
                      onChange={(e) => setCreateForm({ ...createForm, latitude: e.target.value })}
                      placeholder="Latitude (19.4326)"
                      className="px-3 py-2 bg-gray-900 border border-gray-700 rounded text-white text-sm placeholder:text-gray-500 focus:border-purple-500 focus:outline-none"
                    />
                    <input
                      type="number"
                      step="0.000001"
                      value={createForm.longitude}
                      onChange={(e) => setCreateForm({ ...createForm, longitude: e.target.value })}
                      placeholder="Longitude (-99.1332)"
                      className="px-3 py-2 bg-gray-900 border border-gray-700 rounded text-white text-sm placeholder:text-gray-500 focus:border-purple-500 focus:outline-none"
                    />
                  </div>
                  {createForm.latitude && createForm.longitude && (
                    <p className="mt-2 text-xs text-green-400">
                      <Check className="inline w-3 h-3 mr-1" />
                      Location set: {createForm.latitude}, {createForm.longitude}
                    </p>
                  )}
                  <p className="mt-1 text-xs text-gray-500">
                    Optional: Attendees within 500m can verify check-in via GPS
                  </p>
                </div>

                <div>
                  <label className="text-sm font-medium text-gray-300">Max Attendees</label>
                  <input
                    type="number"
                    value={createForm.maxAttendees}
                    onChange={(e) => setCreateForm({ ...createForm, maxAttendees: e.target.value })}
                    placeholder="120"
                    className="w-full mt-1 px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder:text-gray-500 focus:border-purple-500 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="text-sm font-medium text-gray-300">TOURS per Attendee</label>
                  <input
                    type="number"
                    value={createForm.toursPerUser}
                    onChange={(e) => setCreateForm({ ...createForm, toursPerUser: e.target.value })}
                    placeholder="100"
                    className="w-full mt-1 px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder:text-gray-500 focus:border-purple-500 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="text-sm font-medium text-gray-300">
                    Deposit (MON) <span className="text-gray-500">(optional)</span>
                  </label>
                  <input
                    type="number"
                    value={createForm.depositAmount}
                    onChange={(e) => setCreateForm({ ...createForm, depositAmount: e.target.value })}
                    placeholder="0"
                    className="w-full mt-1 px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder:text-gray-500 focus:border-purple-500 focus:outline-none"
                  />
                  <p className="text-xs text-gray-500 mt-1">Sponsors can deposit MON for extra benefits</p>
                </div>
              </div>

              {/* Summary */}
              <div className="p-4 bg-gray-800/50 rounded-xl border border-gray-700">
                <h4 className="font-medium text-white mb-2">Event Summary</h4>
                <div className="space-y-1 text-sm">
                  <div className="flex justify-between text-gray-400">
                    <span>Max Attendees</span>
                    <span className="text-white">{createForm.maxAttendees || '100'}</span>
                  </div>
                  <div className="flex justify-between text-gray-400">
                    <span>Rewards per Attendee</span>
                    <span className="text-purple-400">{createForm.toursPerUser} TOURS + Travel Stamp NFT</span>
                  </div>
                  {parseFloat(createForm.depositAmount || '0') > 0 && (
                    <>
                      <div className="flex justify-between text-gray-400 pt-2 border-t border-gray-700 mt-2">
                        <span>Deposit Amount</span>
                        <span className="text-white">{createForm.depositAmount} MON</span>
                      </div>
                      <div className="flex justify-between text-gray-400">
                        <span>Platform Fee (5%)</span>
                        <span className="text-white">{(parseFloat(createForm.depositAmount) * 0.05).toFixed(2)} MON</span>
                      </div>
                    </>
                  )}
                </div>
              </div>

              <button
                onClick={handleCreateEvent}
                disabled={loading || !createForm.name || !createForm.eventDate || !createForm.city}
                className="w-full py-3 bg-purple-600 hover:bg-purple-500 disabled:bg-gray-600 rounded-xl text-white font-medium transition-colors"
              >
                {loading ? 'Creating Event...' : 'Create Event'}
              </button>
            </div>
          )}

          {/* Manage Tab */}
          {activeTab === 'manage' && (
            <div className="space-y-4">
              {events.filter(e => e.sponsor.toLowerCase() === address?.toLowerCase()).length === 0 ? (
                <div className="text-center py-12">
                  <Building className="w-12 h-12 mx-auto text-gray-600 mb-4" />
                  <p className="text-gray-400">You haven't sponsored any events yet</p>
                  <button
                    onClick={() => setActiveTab('create')}
                    className="mt-4 px-4 py-2 bg-purple-600 hover:bg-purple-500 rounded-lg text-white text-sm"
                  >
                    Sponsor Your First Event
                  </button>
                </div>
              ) : (
                events
                  .filter(e => e.sponsor.toLowerCase() === address?.toLowerCase())
                  .map((event) => (
                    <div
                      key={event.eventId}
                      className="p-4 bg-gray-800/50 rounded-xl border border-gray-700"
                    >
                      <div className="flex items-center justify-between mb-3">
                        <h3 className="font-bold text-white">{event.name}</h3>
                        <span className={`px-2 py-0.5 text-xs rounded-full ${
                          event.status === 'Active' ? 'bg-green-500/20 text-green-400' :
                          event.status === 'Pending' ? 'bg-yellow-500/20 text-yellow-400' :
                          event.status === 'Completed' ? 'bg-blue-500/20 text-blue-400' :
                          'bg-gray-500/20 text-gray-400'
                        }`}>
                          {event.status}
                        </span>
                      </div>

                      <div className="grid grid-cols-2 gap-4 text-sm">
                        <div>
                          <span className="text-gray-400">Check-ins</span>
                          <p className="text-white font-medium">{event.checkedInCount} / {event.maxAttendees}</p>
                        </div>
                        <div>
                          <span className="text-gray-400">Deposit</span>
                          <p className="text-white font-medium">{event.totalDeposit} MON</p>
                        </div>
                        <div>
                          <span className="text-gray-400">Event Date</span>
                          <p className="text-white font-medium">
                            {new Date(event.eventDate * 1000).toLocaleDateString()}
                          </p>
                        </div>
                        <div>
                          <span className="text-gray-400">Location</span>
                          <p className="text-white font-medium">{event.city}, {event.country}</p>
                        </div>
                      </div>

                      <div className="flex gap-2 mt-4">
                        <button
                          onClick={() => {
                            setSelectedEvent(event);
                            generateQRCode(event);
                          }}
                          className="flex-1 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg text-white text-sm"
                        >
                          <QrCode className="inline w-4 h-4 mr-1" />
                          View QR
                        </button>
                        <button
                          onClick={() => {
                            // TODO: View attendees list
                          }}
                          className="flex-1 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg text-white text-sm"
                        >
                          <Users className="inline w-4 h-4 mr-1" />
                          Attendees
                        </button>
                      </div>
                    </div>
                  ))
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );

  return createPortal(modalContent, document.body);
};

export default EventOracle;
