'use client';

import { useState, useEffect } from 'react';
import { useFarcasterContext } from '@/app/hooks/useFarcasterContext';
import { uploadImageToIPFS } from '@/lib/utils/pinata';
import { getCurrentPosition, formatDistance } from '@/lib/utils/gps';

const ENVIO_ENDPOINT = process.env.NEXT_PUBLIC_ENVIO_ENDPOINT || 'https://indexer.dev.hyperindex.xyz/5e18e81/v1/graphql';

interface Itinerary {
  tokenId: string;
  creator: string;
  locationName: string;
  city: string;
  country: string;
  description: string;
  experienceType: string;
  price: string;
  latitude: string;
  longitude: string;
  proximityRadius: string;
  imageHash: string;
  rating?: number;
  reviews?: number;
}

type ViewMode = 'browse' | 'create' | 'detail';

export default function ItineraryMarketPage() {
  const { user, walletAddress, requestWallet } = useFarcasterContext();

  const [viewMode, setViewMode] = useState<ViewMode>('browse');
  const [itineraries, setItineraries] = useState<Itinerary[]>([]);
  const [selectedItinerary, setSelectedItinerary] = useState<Itinerary | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Filters
  const [filterCountry, setFilterCountry] = useState('');
  const [filterCity, setFilterCity] = useState('');
  const [filterType, setFilterType] = useState('');
  const [filterPriceMax, setFilterPriceMax] = useState('');

  // Create form
  const [locationName, setLocationName] = useState('');
  const [city, setCity] = useState('');
  const [country, setCountry] = useState('');
  const [description, setDescription] = useState('');
  const [experienceType, setExperienceType] = useState('general');
  const [price, setPrice] = useState('');
  const [latitude, setLatitude] = useState('');
  const [longitude, setLongitude] = useState('');
  const [proximityRadius, setProximityRadius] = useState('100');
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState('');
  const [imageHash, setImageHash] = useState('');

  // User location
  const [userLocation, setUserLocation] = useState<{ lat: number; lon: number } | null>(null);

  // Load itineraries
  useEffect(() => {
    loadItineraries();
  }, []);

  // Get user location
  useEffect(() => {
    getCurrentPosition()
      .then(loc => setUserLocation(loc))
      .catch(err => console.warn('Could not get location:', err));
  }, []);

  const loadItineraries = async () => {
    setLoading(true);
    try {
      const query = `
        query GetAllItineraries {
          ItineraryNFT_ItineraryCreated(order_by: {block_timestamp: desc}) {
            tokenId
            creator
            name
            description
            price
          }
        }
      `;

      const res = await fetch(ENVIO_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query })
      });

      const data = await res.json();
      const items = data.data?.ItineraryNFT_ItineraryCreated || [];

      // Transform data
      const transformed = items.map((item: any) => ({
        tokenId: item.tokenId,
        creator: item.creator,
        locationName: item.name,
        city: '',
        country: '',
        description: item.description || '',
        experienceType: 'general',
        price: item.price || '0',
        latitude: '0',
        longitude: '0',
        proximityRadius: '100',
        imageHash: '',
        rating: 0,
        reviews: 0,
      }));

      setItineraries(transformed);
    } catch (err: any) {
      console.error('Failed to load itineraries:', err);
      setError('Failed to load itineraries');
    } finally {
      setLoading(false);
    }
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate
    if (!file.type.startsWith('image/')) {
      setError('Please select an image file');
      return;
    }

    if (file.size > 10 * 1024 * 1024) {
      setError('Image too large. Maximum 10MB.');
      return;
    }

    setImageFile(file);
    setImagePreview(URL.createObjectURL(file));
  };

  const handleGetCurrentLocation = async () => {
    setLoading(true);
    try {
      const pos = await getCurrentPosition();
      setLatitude(pos.lat.toFixed(6));
      setLongitude(pos.lon.toFixed(6));
      setSuccess('Location detected!');
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateExperience = async () => {
    if (!walletAddress) {
      setError('Please connect your wallet');
      return;
    }

    if (!locationName || !city || !country || !price || !latitude || !longitude) {
      setError('Please fill in all required fields');
      return;
    }

    setLoading(true);
    setError('');
    setSuccess('');

    try {
      // Upload image if provided
      let ipfsHash = '';
      if (imageFile) {
        setSuccess('Uploading image to IPFS...');
        const uploadResult = await uploadImageToIPFS(imageFile);
        ipfsHash = uploadResult.ipfsHash;
        setImageHash(ipfsHash);
      }

      setSuccess('Creating experience (gasless)...');

      // Create delegation if needed
      const delegationRes = await fetch(`/api/delegation-status?address=${walletAddress}`);
      const delegationData = await delegationRes.json();

      if (!delegationData.success || !delegationData.delegation?.permissions?.includes('create_itinerary')) {
        setSuccess('Setting up permissions...');
        await fetch('/api/create-delegation', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            userAddress: walletAddress,
            durationHours: 24,
            maxTransactions: 100,
            permissions: ['create_itinerary', 'purchase_itinerary', 'checkin_itinerary', 'mint_passport']
          })
        });
      }

      // Execute create via delegation
      const createRes = await fetch('/api/execute-delegated', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userAddress: walletAddress,
          action: 'create_itinerary',
          params: {
            locationName,
            city,
            country,
            description,
            experienceType,
            price: parseFloat(price),
            latitude: parseFloat(latitude),
            longitude: parseFloat(longitude),
            proximityRadius: parseInt(proximityRadius),
            imageHash: ipfsHash,
            fid: user?.fid
          }
        })
      });

      if (!createRes.ok) {
        const errorData = await createRes.json();
        throw new Error(errorData.error || 'Failed to create experience');
      }

      const result = await createRes.json();
      setSuccess(`Experience created! ID: ${result.itineraryId} - TX: ${result.txHash}`);

      // Reset form
      setLocationName('');
      setCity('');
      setCountry('');
      setDescription('');
      setPrice('');
      setLatitude('');
      setLongitude('');
      setImageFile(null);
      setImagePreview('');
      setImageHash('');

      // Reload itineraries
      setTimeout(loadItineraries, 2000);
    } catch (err: any) {
      console.error('Create failed:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handlePurchase = async (itineraryId: string) => {
    if (!walletAddress) {
      setError('Please connect your wallet');
      return;
    }

    setLoading(true);
    setError('');
    setSuccess('');

    try {
      const res = await fetch('/api/execute-delegated', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userAddress: walletAddress,
          action: 'purchase_itinerary',
          params: { itineraryId }
        })
      });

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || 'Purchase failed');
      }

      const result = await res.json();
      setSuccess(`Purchased! TX: ${result.txHash}`);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // Filter itineraries
  const filteredItineraries = itineraries.filter(item => {
    if (filterCountry && item.country !== filterCountry) return false;
    if (filterCity && item.city !== filterCity) return false;
    if (filterType && item.experienceType !== filterType) return false;
    if (filterPriceMax && parseFloat(item.price) > parseFloat(filterPriceMax)) return false;
    return true;
  });

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-900 via-black to-blue-900 p-4">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-white mb-2">Itinerary Marketplace</h1>
          <p className="text-gray-400">Discover experiences, earn passport stamps</p>
        </div>

        {/* Navigation */}
        <div className="flex gap-2 mb-6 bg-black/30 p-2 rounded-lg">
          <button
            onClick={() => setViewMode('browse')}
            className={`flex-1 py-3 rounded-lg font-semibold ${
              viewMode === 'browse'
                ? 'bg-purple-600 text-white'
                : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
            }`}
          >
            Browse
          </button>
          <button
            onClick={() => setViewMode('create')}
            className={`flex-1 py-3 rounded-lg font-semibold ${
              viewMode === 'create'
                ? 'bg-purple-600 text-white'
                : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
            }`}
          >
            Create
          </button>
        </div>

        {/* Wallet Status */}
        {!walletAddress && (
          <div className="mb-6 bg-yellow-500/20 border border-yellow-500/50 rounded-lg p-4">
            <p className="text-yellow-300 mb-2">Connect your wallet to create or purchase</p>
            <button
              onClick={requestWallet}
              className="px-4 py-2 bg-yellow-600 text-white rounded-lg hover:bg-yellow-700"
            >
              Connect Wallet
            </button>
          </div>
        )}

        {/* Messages */}
        {error && (
          <div className="mb-4 bg-red-500/20 border border-red-500/50 rounded-lg p-3">
            <p className="text-red-300">{error}</p>
          </div>
        )}
        {success && (
          <div className="mb-4 bg-green-500/20 border border-green-500/50 rounded-lg p-3">
            <p className="text-green-300">{success}</p>
          </div>
        )}

        {/* Browse View */}
        {viewMode === 'browse' && (
          <div>
            {/* Filters */}
            <div className="mb-6 bg-black/40 rounded-lg p-4">
              <h3 className="text-white font-semibold mb-3">Filters</h3>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <input
                  type="text"
                  placeholder="Country"
                  value={filterCountry}
                  onChange={(e) => setFilterCountry(e.target.value)}
                  className="px-3 py-2 bg-gray-800 text-white rounded-lg border border-gray-700"
                />
                <input
                  type="text"
                  placeholder="City"
                  value={filterCity}
                  onChange={(e) => setFilterCity(e.target.value)}
                  className="px-3 py-2 bg-gray-800 text-white rounded-lg border border-gray-700"
                />
                <select
                  value={filterType}
                  onChange={(e) => setFilterType(e.target.value)}
                  className="px-3 py-2 bg-gray-800 text-white rounded-lg border border-gray-700"
                >
                  <option value="">All Types</option>
                  <option value="adventure">Adventure</option>
                  <option value="culture">Culture</option>
                  <option value="food">Food</option>
                  <option value="nature">Nature</option>
                  <option value="general">General</option>
                </select>
                <input
                  type="number"
                  placeholder="Max Price (TOURS)"
                  value={filterPriceMax}
                  onChange={(e) => setFilterPriceMax(e.target.value)}
                  className="px-3 py-2 bg-gray-800 text-white rounded-lg border border-gray-700"
                />
              </div>
            </div>

            {/* Itinerary Grid */}
            {loading ? (
              <div className="text-center text-white py-12">
                <div className="text-4xl mb-4">Loading...</div>
              </div>
            ) : filteredItineraries.length === 0 ? (
              <div className="text-center text-gray-400 py-12">
                <p className="text-xl">No itineraries found</p>
                <p className="mt-2">Be the first to create one!</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {filteredItineraries.map((item) => (
                  <div
                    key={item.tokenId}
                    className="bg-black/40 border border-purple-500/30 rounded-lg overflow-hidden hover:border-purple-500 transition-all cursor-pointer"
                    onClick={() => {
                      setSelectedItinerary(item);
                      setViewMode('detail');
                    }}
                  >
                    {item.imageHash && (
                      <img
                        src={`https://harlequin-used-hare-224.mypinata.cloud/ipfs/${item.imageHash}`}
                        alt={item.locationName}
                        className="w-full h-48 object-cover"
                      />
                    )}
                    <div className="p-4">
                      <h3 className="text-white font-bold text-lg mb-1">{item.locationName}</h3>
                      <p className="text-gray-400 text-sm mb-2">
                        {item.city}, {item.country}
                      </p>
                      <div className="flex justify-between items-center">
                        <span className="text-green-400 font-semibold">
                          {(parseFloat(item.price) / 1e18).toFixed(2)} TOURS
                        </span>
                        <span className="text-purple-400 text-sm">
                          {item.experienceType}
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Create View */}
        {viewMode === 'create' && (
          <div className="bg-black/40 rounded-lg p-6">
            <h2 className="text-2xl font-bold text-white mb-6">Create New Experience</h2>

            <div className="space-y-4">
              <div>
                <label className="block text-white mb-2">Location Name *</label>
                <input
                  type="text"
                  value={locationName}
                  onChange={(e) => setLocationName(e.target.value)}
                  placeholder="e.g., Eiffel Tower"
                  className="w-full px-4 py-3 bg-gray-800 text-white rounded-lg border border-gray-700"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-white mb-2">City *</label>
                  <input
                    type="text"
                    value={city}
                    onChange={(e) => setCity(e.target.value)}
                    placeholder="Paris"
                    className="w-full px-4 py-3 bg-gray-800 text-white rounded-lg border border-gray-700"
                  />
                </div>
                <div>
                  <label className="block text-white mb-2">Country *</label>
                  <input
                    type="text"
                    value={country}
                    onChange={(e) => setCountry(e.target.value)}
                    placeholder="France"
                    className="w-full px-4 py-3 bg-gray-800 text-white rounded-lg border border-gray-700"
                  />
                </div>
              </div>

              <div>
                <label className="block text-white mb-2">Description</label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Describe the experience..."
                  rows={3}
                  className="w-full px-4 py-3 bg-gray-800 text-white rounded-lg border border-gray-700"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-white mb-2">Experience Type</label>
                  <select
                    value={experienceType}
                    onChange={(e) => setExperienceType(e.target.value)}
                    className="w-full px-4 py-3 bg-gray-800 text-white rounded-lg border border-gray-700"
                  >
                    <option value="general">General</option>
                    <option value="adventure">Adventure</option>
                    <option value="culture">Culture</option>
                    <option value="food">Food</option>
                    <option value="nature">Nature</option>
                  </select>
                </div>
                <div>
                  <label className="block text-white mb-2">Price (TOURS) *</label>
                  <input
                    type="number"
                    value={price}
                    onChange={(e) => setPrice(e.target.value)}
                    placeholder="10"
                    step="0.1"
                    className="w-full px-4 py-3 bg-gray-800 text-white rounded-lg border border-gray-700"
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="block text-white mb-2">Latitude *</label>
                  <input
                    type="number"
                    value={latitude}
                    onChange={(e) => setLatitude(e.target.value)}
                    placeholder="48.8584"
                    step="0.000001"
                    className="w-full px-4 py-3 bg-gray-800 text-white rounded-lg border border-gray-700"
                  />
                </div>
                <div>
                  <label className="block text-white mb-2">Longitude *</label>
                  <input
                    type="number"
                    value={longitude}
                    onChange={(e) => setLongitude(e.target.value)}
                    placeholder="2.2945"
                    step="0.000001"
                    className="w-full px-4 py-3 bg-gray-800 text-white rounded-lg border border-gray-700"
                  />
                </div>
                <div>
                  <label className="block text-white mb-2">Radius (m)</label>
                  <input
                    type="number"
                    value={proximityRadius}
                    onChange={(e) => setProximityRadius(e.target.value)}
                    placeholder="100"
                    className="w-full px-4 py-3 bg-gray-800 text-white rounded-lg border border-gray-700"
                  />
                </div>
              </div>

              <button
                onClick={handleGetCurrentLocation}
                disabled={loading}
                className="w-full py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
              >
                Use My Current Location
              </button>

              <div>
                <label className="block text-white mb-2">Image</label>
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleImageUpload}
                  className="w-full px-4 py-3 bg-gray-800 text-white rounded-lg border border-gray-700"
                />
                {imagePreview && (
                  <img src={imagePreview} alt="Preview" className="mt-2 w-full h-48 object-cover rounded-lg" />
                )}
              </div>

              <button
                onClick={handleCreateExperience}
                disabled={loading || !walletAddress}
                className="w-full py-4 bg-gradient-to-r from-purple-600 to-pink-600 text-white rounded-lg font-bold text-lg hover:from-purple-700 hover:to-pink-700 disabled:opacity-50"
              >
                {loading ? 'Creating...' : 'Create Experience (FREE)'}
              </button>
            </div>
          </div>
        )}

        {/* Detail View */}
        {viewMode === 'detail' && selectedItinerary && (
          <div className="bg-black/40 rounded-lg p-6">
            <button
              onClick={() => setViewMode('browse')}
              className="mb-4 text-purple-400 hover:text-purple-300"
            >
              &larr; Back to Browse
            </button>

            {selectedItinerary.imageHash && (
              <img
                src={`https://harlequin-used-hare-224.mypinata.cloud/ipfs/${selectedItinerary.imageHash}`}
                alt={selectedItinerary.locationName}
                className="w-full h-64 object-cover rounded-lg mb-6"
              />
            )}

            <h2 className="text-3xl font-bold text-white mb-2">{selectedItinerary.locationName}</h2>
            <p className="text-gray-400 text-lg mb-4">
              {selectedItinerary.city}, {selectedItinerary.country}
            </p>

            <div className="mb-6">
              <p className="text-white">{selectedItinerary.description}</p>
            </div>

            <div className="grid grid-cols-2 gap-4 mb-6">
              <div className="bg-purple-900/30 p-4 rounded-lg">
                <p className="text-gray-400 text-sm">Price</p>
                <p className="text-white font-bold text-xl">
                  {(parseFloat(selectedItinerary.price) / 1e18).toFixed(2)} TOURS
                </p>
              </div>
              <div className="bg-purple-900/30 p-4 rounded-lg">
                <p className="text-gray-400 text-sm">Type</p>
                <p className="text-white font-bold text-xl capitalize">
                  {selectedItinerary.experienceType}
                </p>
              </div>
            </div>

            <button
              onClick={() => handlePurchase(selectedItinerary.tokenId)}
              disabled={loading || !walletAddress}
              className="w-full py-4 bg-green-600 text-white rounded-lg font-bold text-lg hover:bg-green-700 disabled:opacity-50 mb-3"
            >
              {loading ? 'Processing...' : 'Purchase Experience'}
            </button>

            <p className="text-center text-gray-400 text-sm">
              After purchase, visit the location to check in and earn a passport stamp
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
