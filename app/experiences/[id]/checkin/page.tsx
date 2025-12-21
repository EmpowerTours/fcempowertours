'use client';

import { useState, useEffect } from 'react';
import { useAccount, useWriteContract, useWaitForTransactionReceipt } from 'wagmi';
import { Address } from 'viem';
import { useParams, useRouter } from 'next/navigation';
import { uploadToIPFS } from '@/lib/uploadToIPFS';

const EXPERIENCE_NFT_ADDRESS = process.env.NEXT_PUBLIC_EXPERIENCE_NFT as Address;

interface UserLocation {
  latitude: number;
  longitude: number;
  accuracy: number;
}

interface ExperienceLocation {
  latitude: bigint;
  longitude: bigint;
  locationName: string;
  proximityRadius: number;
}

export default function CheckInPage() {
  const params = useParams();
  const router = useRouter();
  const { address } = useAccount();
  const experienceId = Number(params.id);

  const [userLocation, setUserLocation] = useState<UserLocation | null>(null);
  const [experienceLocation, setExperienceLocation] = useState<ExperienceLocation | null>(null);
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [photoIPFSHash, setPhotoIPFSHash] = useState<string | null>(null);
  const [distance, setDistance] = useState<number | null>(null);
  const [withinRadius, setWithinRadius] = useState(false);
  const [gettingLocation, setGettingLocation] = useState(false);

  // Complete experience
  const { writeContract: completeExp, data: completeHash } = useWriteContract();
  const { isSuccess: completeSuccess } = useWaitForTransactionReceipt({ hash: completeHash });

  useEffect(() => {
    fetchExperienceLocation();
  }, []);

  useEffect(() => {
    if (userLocation && experienceLocation) {
      const dist = calculateDistance(
        userLocation.latitude,
        userLocation.longitude,
        Number(experienceLocation.latitude) / 1e6,
        Number(experienceLocation.longitude) / 1e6
      );
      setDistance(dist);
      setWithinRadius(dist <= experienceLocation.proximityRadius);
    }
  }, [userLocation, experienceLocation]);

  useEffect(() => {
    if (completeSuccess) {
      router.push(`/experiences/${experienceId}?completed=true`);
    }
  }, [completeSuccess]);

  const fetchExperienceLocation = async () => {
    try {
      const response = await fetch('/api/experience/location', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ experienceId, userAddress: address }),
      });
      const loc = await response.json();
      setExperienceLocation(loc);
    } catch (error) {
      console.error('Failed to fetch location:', error);
    }
  };

  const getUserLocation = () => {
    setGettingLocation(true);

    if (!navigator.geolocation) {
      alert('Geolocation not supported by your browser');
      setGettingLocation(false);
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        setUserLocation({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracy: position.coords.accuracy,
        });
        setGettingLocation(false);
      },
      (error) => {
        console.error('Error getting location:', error);
        alert('Failed to get your location. Please enable location services.');
        setGettingLocation(false);
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 0,
      }
    );
  };

  const handlePhotoSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      alert('Please select an image file');
      return;
    }

    if (file.size > 10 * 1024 * 1024) {
      alert('Image must be less than 10MB');
      return;
    }

    setPhotoFile(file);

    // Create preview
    const reader = new FileReader();
    reader.onloadend = () => {
      setPhotoPreview(reader.result as string);
    };
    reader.readAsDataURL(file);
  };

  const handleUploadPhoto = async () => {
    if (!photoFile) return;

    setUploadingPhoto(true);
    try {
      const hash = await uploadToIPFS(photoFile);
      setPhotoIPFSHash(hash);
    } catch (error) {
      console.error('Failed to upload photo:', error);
      alert('Failed to upload photo to IPFS');
    } finally {
      setUploadingPhoto(false);
    }
  };

  const handleCheckIn = async () => {
    if (!userLocation || !photoIPFSHash) {
      alert('Please get your location and upload a photo first');
      return;
    }

    if (!withinRadius) {
      alert(`You must be within ${experienceLocation?.proximityRadius}m of the location`);
      return;
    }

    // Convert to contract format (scaled by 1e6)
    const latInt = Math.floor(userLocation.latitude * 1e6);
    const lonInt = Math.floor(userLocation.longitude * 1e6);

    completeExp({
      address: EXPERIENCE_NFT_ADDRESS,
      abi: ExperienceNFTABI,
      functionName: 'completeExperience',
      args: [BigInt(experienceId), BigInt(latInt), BigInt(lonInt), photoIPFSHash],
    });
  };

  // Haversine distance formula
  const calculateDistance = (lat1: number, lon1: number, lat2: number, lon2: number): number => {
    const R = 6371000; // Earth radius in meters
    const φ1 = (lat1 * Math.PI) / 180;
    const φ2 = (lat2 * Math.PI) / 180;
    const Δφ = ((lat2 - lat1) * Math.PI) / 180;
    const Δλ = ((lon2 - lon1) * Math.PI) / 180;

    const a =
      Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
      Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    return R * c; // Distance in meters
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-900 to-black text-white p-6">
      <div className="max-w-2xl mx-auto">
        <button
          onClick={() => router.back()}
          className="mb-4 text-gray-400 hover:text-white"
        >
          ← Back
        </button>

        <h1 className="text-3xl font-bold mb-2">Check In</h1>
        <p className="text-gray-400 mb-8">Complete your experience and earn rewards</p>

        {/* Step 1: Get Location */}
        <div className="bg-gray-800 rounded-xl p-6 mb-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-bold">1. Verify Location</h2>
            {userLocation && withinRadius && (
              <span className="text-green-400 text-sm">✓ Verified</span>
            )}
          </div>

          <p className="text-gray-300 text-sm mb-4">
            We need to verify you're at {experienceLocation?.locationName}
          </p>

          <button
            onClick={getUserLocation}
            disabled={gettingLocation}
            className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-gray-700 px-6 py-3 rounded-lg font-semibold mb-4"
          >
            {gettingLocation ? 'Getting Location...' : '📍 Get My Location'}
          </button>

          {userLocation && (
            <div className="bg-gray-900 rounded-lg p-4">
              <div className="text-sm text-gray-400 mb-2">Your Location:</div>
              <div className="text-xs font-mono mb-2">
                Lat: {userLocation.latitude.toFixed(6)}, Lon: {userLocation.longitude.toFixed(6)}
              </div>
              <div className="text-xs text-gray-500 mb-3">
                Accuracy: ±{userLocation.accuracy.toFixed(0)}m
              </div>

              {distance !== null && (
                <div className={`text-sm font-semibold ${withinRadius ? 'text-green-400' : 'text-red-400'}`}>
                  {withinRadius ? (
                    <>✓ Within {experienceLocation?.proximityRadius}m radius ({distance.toFixed(0)}m away)</>
                  ) : (
                    <>✗ Too far! You are {distance.toFixed(0)}m away (need ≤{experienceLocation?.proximityRadius}m)</>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Step 2: Upload Photo */}
        <div className="bg-gray-800 rounded-xl p-6 mb-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-bold">2. Upload Photo Proof</h2>
            {photoIPFSHash && (
              <span className="text-green-400 text-sm">✓ Uploaded</span>
            )}
          </div>

          <p className="text-gray-300 text-sm mb-4">
            Take a photo at the location to prove you were there
          </p>

          <input
            type="file"
            accept="image/*"
            capture="environment"
            onChange={handlePhotoSelect}
            className="hidden"
            id="photo-input"
          />

          <label
            htmlFor="photo-input"
            className="block w-full bg-purple-600 hover:bg-purple-700 px-6 py-3 rounded-lg font-semibold text-center cursor-pointer mb-4"
          >
            📸 Take Photo
          </label>

          {photoPreview && (
            <div className="mb-4">
              <img
                src={photoPreview}
                alt="Preview"
                className="w-full h-64 object-cover rounded-lg mb-3"
              />
              {!photoIPFSHash && (
                <button
                  onClick={handleUploadPhoto}
                  disabled={uploadingPhoto}
                  className="w-full bg-green-600 hover:bg-green-700 disabled:bg-gray-700 px-6 py-3 rounded-lg font-semibold"
                >
                  {uploadingPhoto ? 'Uploading to IPFS...' : '☁️ Upload to IPFS'}
                </button>
              )}
            </div>
          )}

          {photoIPFSHash && (
            <div className="bg-gray-900 rounded-lg p-4">
              <div className="text-sm text-gray-400 mb-1">IPFS Hash:</div>
              <div className="text-xs font-mono text-green-400 break-all">
                {photoIPFSHash}
              </div>
            </div>
          )}
        </div>

        {/* Step 3: Complete */}
        <div className="bg-gray-800 rounded-xl p-6">
          <h2 className="text-xl font-bold mb-4">3. Complete Experience</h2>

          <div className="mb-6">
            <div className="flex items-center gap-3 mb-2">
              <span className={userLocation && withinRadius ? 'text-green-400' : 'text-gray-500'}>
                {userLocation && withinRadius ? '✓' : '○'} Location verified
              </span>
            </div>
            <div className="flex items-center gap-3">
              <span className={photoIPFSHash ? 'text-green-400' : 'text-gray-500'}>
                {photoIPFSHash ? '✓' : '○'} Photo uploaded
              </span>
            </div>
          </div>

          <button
            onClick={handleCheckIn}
            disabled={!userLocation || !withinRadius || !photoIPFSHash}
            className="w-full bg-green-600 hover:bg-green-700 disabled:bg-gray-700 disabled:cursor-not-allowed px-6 py-4 rounded-lg font-bold text-lg"
          >
            ✓ Complete & Claim Reward
          </button>

          {(!userLocation || !withinRadius || !photoIPFSHash) && (
            <p className="text-xs text-gray-500 text-center mt-3">
              Complete all steps above to check in
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

const ExperienceNFTABI = [
  {
    inputs: [
      { name: 'experienceId', type: 'uint256' },
      { name: 'userLatitude', type: 'int256' },
      { name: 'userLongitude', type: 'int256' },
      { name: 'photoProofHash', type: 'string' },
    ],
    name: 'completeExperience',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
] as const;
