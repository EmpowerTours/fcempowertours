'use client';

import { useState } from 'react';
import { useAccount, useReadContract } from 'wagmi';
import { useRouter } from 'next/navigation';
import { useFarcasterContext } from '@/app/hooks/useFarcasterContext';
import { personalAssistantConfig } from '@/src/config/contracts';

type ServiceType = 'food' | 'ride' | 'custom';
type ServiceStatus = 'pending' | 'quoted' | 'accepted' | 'completed' | 'disputed';

interface Assistant {
  address: string;
  isVerified: boolean;
  isActive: boolean;
  jobCount: number;
  rating: number;
  successfulJobs: number;
}

interface ServiceRequest {
  id: number;
  customer: string;
  assistant: string;
  description: string;
  location: string;
  quotedPrice: bigint;
  status: ServiceStatus;
  createdAt: number;
}

export default function ConciergePage() {
  const router = useRouter();
  const { walletAddress, user } = useFarcasterContext();
  const { address: wagmiAddress } = useAccount();
  const effectiveAddress = (walletAddress || wagmiAddress) as `0x${string}` | undefined;

  const [activeTab, setActiveTab] = useState<'browse' | 'request' | 'my-services'>('browse');
  const [selectedAssistant, setSelectedAssistant] = useState<string>('');
  const [serviceType, setServiceType] = useState<ServiceType>('custom');

  // Form states
  const [serviceDescription, setServiceDescription] = useState('');
  const [serviceLocation, setServiceLocation] = useState('');
  const [preferredDate, setPreferredDate] = useState('');

  // Food service states
  const [cuisine, setCuisine] = useState('');
  const [guestCount, setGuestCount] = useState('');

  // Ride service states
  const [pickupLocation, setPickupLocation] = useState('');
  const [dropoffLocation, setDropoffLocation] = useState('');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Read verified assistants count
  const { data: assistantCount } = useReadContract({
    ...personalAssistantConfig,
    functionName: 'getVerifiedAssistantCount',
  });

  const handleRequestCustomService = async () => {
    if (!effectiveAddress || !serviceDescription) {
      setError('Please fill in all required fields');
      return;
    }

    setLoading(true);
    setError(null);
    setSuccess(null);

    try {
      const response = await fetch('/api/execute-delegated', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userAddress: effectiveAddress,
          action: 'concierge_custom',
          params: {
            serviceType: 'custom',
            details: `${serviceDescription}${serviceLocation ? ` at ${serviceLocation}` : ''}`,
            suggestedPrice: '0.1', // Default suggested price in MON
          },
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to create service request');
      }

      const { txHash } = await response.json();
      setSuccess(`Service request created! TX: ${txHash.slice(0, 10)}...`);

      setTimeout(() => {
        setServiceDescription('');
        setServiceLocation('');
        setActiveTab('my-services');
        setSuccess(null);
      }, 3000);
    } catch (err: any) {
      setError(err.message || 'Failed to create service request');
    } finally {
      setLoading(false);
    }
  };

  const handleRequestFoodService = async () => {
    if (!effectiveAddress || !serviceLocation) {
      setError('Please fill in all required fields');
      return;
    }

    setLoading(true);
    setError(null);
    setSuccess(null);

    try {
      // For MVP, use platform as provider (first registered assistant)
      const response = await fetch('/api/execute-delegated', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userAddress: effectiveAddress,
          action: 'concierge_food',
          params: {
            provider: '0xa4c15Eb48EfB739Ea6D4efBF53180cdF86c807f4', // Platform address as default provider
            menuItemIds: [1], // Default menu item
            quantities: [parseInt(guestCount || '1')],
            deliveryAddress: `${cuisine} cuisine for ${guestCount} guests at ${serviceLocation}`,
            deliveryFee: '0.01',
          },
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to create food order');
      }

      const { txHash } = await response.json();
      setSuccess(`Food order created! TX: ${txHash.slice(0, 10)}...`);

      setTimeout(() => {
        setCuisine('');
        setGuestCount('');
        setServiceLocation('');
        setPreferredDate('');
        setActiveTab('my-services');
        setSuccess(null);
      }, 3000);
    } catch (err: any) {
      setError(err.message || 'Failed to create food order');
    } finally {
      setLoading(false);
    }
  };

  const handleRequestRideService = async () => {
    if (!effectiveAddress || !pickupLocation || !dropoffLocation) {
      setError('Please fill in all required fields');
      return;
    }

    setLoading(true);
    setError(null);
    setSuccess(null);

    try {
      const response = await fetch('/api/execute-delegated', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userAddress: effectiveAddress,
          action: 'concierge_ride',
          params: {
            pickupLocation,
            destination: dropoffLocation,
            agreedPrice: '0.1', // Default price in MON
          },
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to create ride request');
      }

      const { txHash } = await response.json();
      setSuccess(`Ride request created! TX: ${txHash.slice(0, 10)}...`);

      setTimeout(() => {
        setPickupLocation('');
        setDropoffLocation('');
        setPreferredDate('');
        setActiveTab('my-services');
        setSuccess(null);
      }, 3000);
    } catch (err: any) {
      setError(err.message || 'Failed to create ride request');
    } finally {
      setLoading(false);
    }
  };

  if (!effectiveAddress) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-gray-900 to-black text-white flex items-center justify-center p-6">
        <div className="text-center">
          <h1 className="text-3xl font-bold mb-4">Personal Concierge Services</h1>
          <p className="text-gray-400 mb-6">
            {user ? 'Loading wallet...' : 'Please open in Farcaster to access concierge services'}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-900 to-black text-white p-6">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-4xl font-bold mb-2">Personal Concierge Services</h1>
          <p className="text-gray-400">
            Get verified personal assistants for food, rides, and custom services
          </p>
          <div className="mt-4 flex gap-4 text-sm">
            <div className="bg-gray-800 rounded-lg px-4 py-2">
              <span className="text-gray-400">Verified Assistants: </span>
              <span className="font-bold text-green-400">{assistantCount?.toString() || '0'}</span>
            </div>
            <button
              onClick={() => router.push('/become-assistant')}
              className="bg-purple-600 hover:bg-purple-700 rounded-lg px-4 py-2 font-semibold transition"
            >
              Become an Assistant
            </button>
          </div>
        </div>

        {/* Success/Error Messages */}
        {success && (
          <div className="bg-green-900/20 border border-green-600/30 rounded-xl p-4 mb-6">
            <p className="text-green-400">{success}</p>
          </div>
        )}
        {error && (
          <div className="bg-red-900/20 border border-red-600/30 rounded-xl p-4 mb-6">
            <p className="text-red-400">{error}</p>
          </div>
        )}

        {/* Tabs */}
        <div className="flex gap-2 mb-6">
          <button
            onClick={() => setActiveTab('browse')}
            className={`flex-1 py-3 rounded-lg font-semibold transition ${
              activeTab === 'browse'
                ? 'bg-purple-600 text-white'
                : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
            }`}
          >
            Browse Assistants
          </button>
          <button
            onClick={() => setActiveTab('request')}
            className={`flex-1 py-3 rounded-lg font-semibold transition ${
              activeTab === 'request'
                ? 'bg-purple-600 text-white'
                : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
            }`}
          >
            Request Service
          </button>
          <button
            onClick={() => setActiveTab('my-services')}
            className={`flex-1 py-3 rounded-lg font-semibold transition ${
              activeTab === 'my-services'
                ? 'bg-purple-600 text-white'
                : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
            }`}
          >
            My Services
          </button>
        </div>

        {/* Browse Assistants Tab */}
        {activeTab === 'browse' && (
          <div className="space-y-4">
            <div className="bg-gray-800 rounded-xl p-6">
              <h2 className="text-2xl font-bold mb-4">Available Assistants</h2>
              <p className="text-gray-400 mb-6">
                Browse verified personal assistants in your area
              </p>

              {/* Placeholder for assistant list */}
              <div className="space-y-4">
                <div className="bg-gray-900 rounded-lg p-6 border border-gray-700">
                  <div className="flex items-start justify-between mb-4">
                    <div>
                      <h3 className="text-xl font-bold mb-1">Looking for assistants?</h3>
                      <p className="text-gray-400 text-sm">
                        Connect your wallet and verified assistants will appear here
                      </p>
                    </div>
                    <div className="text-4xl">👨‍💼</div>
                  </div>
                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <div className="bg-gray-800 rounded-lg p-3">
                      <div className="text-gray-400 mb-1">Services</div>
                      <div className="font-semibold">Food, Rides, Tours</div>
                    </div>
                    <div className="bg-gray-800 rounded-lg p-3">
                      <div className="text-gray-400 mb-1">Verification</div>
                      <div className="font-semibold text-green-400">Verified</div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Request Service Tab */}
        {activeTab === 'request' && (
          <div className="space-y-6">
            <div className="bg-gray-800 rounded-xl p-6">
              <h2 className="text-2xl font-bold mb-4">Request a Service</h2>

              {/* Service Type Selection */}
              <div className="mb-6">
                <label className="block text-sm text-gray-400 mb-3">Service Type</label>
                <div className="grid grid-cols-3 gap-3">
                  <button
                    onClick={() => setServiceType('custom')}
                    className={`p-4 rounded-lg border-2 transition ${
                      serviceType === 'custom'
                        ? 'border-purple-600 bg-purple-600/20'
                        : 'border-gray-700 bg-gray-900 hover:border-gray-600'
                    }`}
                  >
                    <div className="text-3xl mb-2">🛎️</div>
                    <div className="font-semibold">Custom Service</div>
                    <div className="text-xs text-gray-400 mt-1">Personal assistant</div>
                  </button>
                  <button
                    onClick={() => setServiceType('food')}
                    className={`p-4 rounded-lg border-2 transition ${
                      serviceType === 'food'
                        ? 'border-purple-600 bg-purple-600/20'
                        : 'border-gray-700 bg-gray-900 hover:border-gray-600'
                    }`}
                  >
                    <div className="text-3xl mb-2">🍽️</div>
                    <div className="font-semibold">Food Delivery</div>
                    <div className="text-xs text-gray-400 mt-1">Chef & delivery</div>
                  </button>
                  <button
                    onClick={() => setServiceType('ride')}
                    className={`p-4 rounded-lg border-2 transition ${
                      serviceType === 'ride'
                        ? 'border-purple-600 bg-purple-600/20'
                        : 'border-gray-700 bg-gray-900 hover:border-gray-600'
                    }`}
                  >
                    <div className="text-3xl mb-2">🚗</div>
                    <div className="font-semibold">Ride Request</div>
                    <div className="text-xs text-gray-400 mt-1">Private driver</div>
                  </button>
                </div>
              </div>

              {/* Custom Service Form */}
              {serviceType === 'custom' && (
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm text-gray-400 mb-2">Service Description*</label>
                    <textarea
                      value={serviceDescription}
                      onChange={(e) => setServiceDescription(e.target.value)}
                      className="w-full bg-gray-700 border border-gray-600 rounded-lg px-4 py-3 text-white h-32"
                      placeholder="Describe the service you need (e.g., personal chef for dinner, tour guide, translator...)"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-sm text-gray-400 mb-2">Location*</label>
                    <input
                      type="text"
                      value={serviceLocation}
                      onChange={(e) => setServiceLocation(e.target.value)}
                      className="w-full bg-gray-700 border border-gray-600 rounded-lg px-4 py-3 text-white"
                      placeholder="Service location"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-sm text-gray-400 mb-2">Preferred Date & Time</label>
                    <input
                      type="datetime-local"
                      value={preferredDate}
                      onChange={(e) => setPreferredDate(e.target.value)}
                      className="w-full bg-gray-700 border border-gray-600 rounded-lg px-4 py-3 text-white"
                    />
                  </div>
                  <button
                    onClick={handleRequestCustomService}
                    disabled={loading}
                    className="w-full bg-purple-600 hover:bg-purple-700 disabled:bg-gray-600 disabled:cursor-not-allowed py-4 rounded-lg font-bold text-lg transition"
                  >
                    {loading ? 'Creating Request...' : 'Request Custom Service'}
                  </button>
                </div>
              )}

              {/* Food Service Form */}
              {serviceType === 'food' && (
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm text-gray-400 mb-2">Cuisine Type*</label>
                    <input
                      type="text"
                      value={cuisine}
                      onChange={(e) => setCuisine(e.target.value)}
                      className="w-full bg-gray-700 border border-gray-600 rounded-lg px-4 py-3 text-white"
                      placeholder="Italian, Japanese, Mexican, etc."
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-sm text-gray-400 mb-2">Number of Guests*</label>
                    <input
                      type="number"
                      value={guestCount}
                      onChange={(e) => setGuestCount(e.target.value)}
                      className="w-full bg-gray-700 border border-gray-600 rounded-lg px-4 py-3 text-white"
                      placeholder="2"
                      min="1"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-sm text-gray-400 mb-2">Delivery Location*</label>
                    <input
                      type="text"
                      value={serviceLocation}
                      onChange={(e) => setServiceLocation(e.target.value)}
                      className="w-full bg-gray-700 border border-gray-600 rounded-lg px-4 py-3 text-white"
                      placeholder="Delivery address"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-sm text-gray-400 mb-2">Preferred Date & Time*</label>
                    <input
                      type="datetime-local"
                      value={preferredDate}
                      onChange={(e) => setPreferredDate(e.target.value)}
                      className="w-full bg-gray-700 border border-gray-600 rounded-lg px-4 py-3 text-white"
                      required
                    />
                  </div>
                  <button
                    onClick={handleRequestFoodService}
                    disabled={loading}
                    className="w-full bg-orange-600 hover:bg-orange-700 disabled:bg-gray-600 disabled:cursor-not-allowed py-4 rounded-lg font-bold text-lg transition"
                  >
                    {loading ? 'Creating Order...' : 'Request Food Delivery'}
                  </button>
                </div>
              )}

              {/* Ride Service Form */}
              {serviceType === 'ride' && (
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm text-gray-400 mb-2">Pickup Location*</label>
                    <input
                      type="text"
                      value={pickupLocation}
                      onChange={(e) => setPickupLocation(e.target.value)}
                      className="w-full bg-gray-700 border border-gray-600 rounded-lg px-4 py-3 text-white"
                      placeholder="Pickup address"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-sm text-gray-400 mb-2">Dropoff Location*</label>
                    <input
                      type="text"
                      value={dropoffLocation}
                      onChange={(e) => setDropoffLocation(e.target.value)}
                      className="w-full bg-gray-700 border border-gray-600 rounded-lg px-4 py-3 text-white"
                      placeholder="Destination address"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-sm text-gray-400 mb-2">Pickup Date & Time*</label>
                    <input
                      type="datetime-local"
                      value={preferredDate}
                      onChange={(e) => setPreferredDate(e.target.value)}
                      className="w-full bg-gray-700 border border-gray-600 rounded-lg px-4 py-3 text-white"
                      required
                    />
                  </div>
                  <button
                    onClick={handleRequestRideService}
                    disabled={loading}
                    className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 disabled:cursor-not-allowed py-4 rounded-lg font-bold text-lg transition"
                  >
                    {loading ? 'Creating Request...' : 'Request Ride'}
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

        {/* My Services Tab */}
        {activeTab === 'my-services' && (
          <div className="space-y-4">
            <div className="bg-gray-800 rounded-xl p-6">
              <h2 className="text-2xl font-bold mb-4">My Service Requests</h2>
              <p className="text-gray-400 mb-6">
                Track your ongoing and completed services
              </p>

              {/* Placeholder for service requests */}
              <div className="bg-gray-900 rounded-lg p-8 text-center border border-gray-700">
                <div className="text-5xl mb-4">📋</div>
                <h3 className="text-xl font-bold mb-2">No Service Requests Yet</h3>
                <p className="text-gray-400 mb-4">
                  Request a service to get started
                </p>
                <button
                  onClick={() => setActiveTab('request')}
                  className="bg-purple-600 hover:bg-purple-700 px-6 py-3 rounded-lg font-semibold transition"
                >
                  Request Service
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Info Banner */}
        <div className="mt-8 bg-gradient-to-r from-purple-900/50 to-pink-900/50 rounded-xl p-6 border border-purple-700/50">
          <h3 className="text-lg font-bold mb-2">How It Works</h3>
          <div className="grid md:grid-cols-3 gap-4 text-sm">
            <div>
              <div className="text-2xl mb-2">1️⃣</div>
              <div className="font-semibold mb-1">Request Service</div>
              <div className="text-gray-300">Describe what you need and when</div>
            </div>
            <div>
              <div className="text-2xl mb-2">2️⃣</div>
              <div className="font-semibold mb-1">Get Quote</div>
              <div className="text-gray-300">Verified assistant provides pricing</div>
            </div>
            <div>
              <div className="text-2xl mb-2">3️⃣</div>
              <div className="font-semibold mb-1">Pay & Enjoy</div>
              <div className="text-gray-300">Accept quote and service is delivered</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
