'use client';

import { useEffect, useState } from 'react';
import { useAccount, useReadContract, useWriteContract, useWaitForTransactionReceipt } from 'wagmi';
import { Address, parseEther } from 'viem';
import { useParams, useRouter } from 'next/navigation';
import dynamic from 'next/dynamic';

const MapWithLocation = dynamic(() => import('@/components/MapWithLocation'), { ssr: false });

const EXPERIENCE_NFT_ADDRESS = process.env.NEXT_PUBLIC_EXPERIENCE_NFT as Address;
const WMON_ADDRESS = process.env.NEXT_PUBLIC_WMON as Address;

const EXPERIENCE_TYPES = [
  'Food', 'Attraction', 'Cultural', 'Nature',
  'Entertainment', 'Accommodation', 'Shopping', 'Adventure', 'Other'
];

interface ExperiencePreview {
  title: string;
  previewDescription: string;
  country: string;
  city: string;
  experienceType: number;
  price: bigint;
  completionReward: bigint;
  previewImageHash: string;
  totalPurchased: number;
  totalCompleted: number;
  active: boolean;
}

interface ExperienceLocation {
  latitude: bigint;
  longitude: bigint;
  locationName: string;
  fullDescription: string;
  proximityRadius: number;
}

export default function ExperienceDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { address } = useAccount();
  const experienceId = Number(params.id);

  const [hasPurchased, setHasPurchased] = useState(false);
  const [location, setLocation] = useState<ExperienceLocation | null>(null);
  const [approvalNeeded, setApprovalNeeded] = useState(true);

  // Read preview (public info)
  const { data: preview } = useReadContract({
    address: EXPERIENCE_NFT_ADDRESS,
    abi: ExperienceNFTABI,
    functionName: 'getExperiencePreview',
    args: [BigInt(experienceId)],
  }) as { data: ExperiencePreview | undefined };

  // Check if user purchased
  const { data: purchased } = useReadContract({
    address: EXPERIENCE_NFT_ADDRESS,
    abi: ExperienceNFTABI,
    functionName: 'hasUserPurchased',
    args: [address!, BigInt(experienceId)],
    query: { enabled: !!address },
  });

  // Check WMON allowance
  const { data: allowance } = useReadContract({
    address: WMON_ADDRESS,
    abi: ERC20ABI,
    functionName: 'allowance',
    args: [address!, EXPERIENCE_NFT_ADDRESS],
    query: { enabled: !!address },
  });

  // Approve WMON
  const { writeContract: approveWMON, data: approveHash } = useWriteContract();
  const { isSuccess: approveSuccess } = useWaitForTransactionReceipt({ hash: approveHash });

  // Purchase experience
  const { writeContract: purchaseExperience, data: purchaseHash } = useWriteContract();
  const { isSuccess: purchaseSuccess } = useWaitForTransactionReceipt({ hash: purchaseHash });

  useEffect(() => {
    if (purchased) {
      setHasPurchased(true);
      fetchLocation();
    }
  }, [purchased]);

  useEffect(() => {
    if (allowance && preview) {
      setApprovalNeeded(allowance < preview.price);
    }
  }, [allowance, preview]);

  useEffect(() => {
    if (approveSuccess) {
      setApprovalNeeded(false);
    }
  }, [approveSuccess]);

  useEffect(() => {
    if (purchaseSuccess) {
      setHasPurchased(true);
      fetchLocation();
    }
  }, [purchaseSuccess]);

  const fetchLocation = async () => {
    if (!address) return;

    try {
      // Call contract to get location (only works if purchased)
      const loc = await fetch('/api/experience/location', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ experienceId, userAddress: address }),
      }).then(res => res.json());

      setLocation(loc);
    } catch (error) {
      console.error('Failed to fetch location:', error);
    }
  };

  const handleApprove = () => {
    if (!preview) return;
    approveWMON({
      address: WMON_ADDRESS,
      abi: ERC20ABI,
      functionName: 'approve',
      args: [EXPERIENCE_NFT_ADDRESS, preview.price],
    });
  };

  const handlePurchase = () => {
    purchaseExperience({
      address: EXPERIENCE_NFT_ADDRESS,
      abi: ExperienceNFTABI,
      functionName: 'purchaseExperience',
      args: [BigInt(experienceId)],
    });
  };

  const handleRequestTransport = () => {
    // Get user's current location
    navigator.geolocation.getCurrentPosition((position) => {
      const pickupLat = Math.floor(position.coords.latitude * 1e6);
      const pickupLon = Math.floor(position.coords.longitude * 1e6);

      // Emit transportation request event
      router.push(
        `/service-marketplace?type=ride&fromLat=${pickupLat}&fromLon=${pickupLon}&toLat=${location?.latitude}&toLon=${location?.longitude}&experienceId=${experienceId}`
      );
    });
  };

  if (!preview) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-gray-900 to-black text-white flex items-center justify-center">
        <div className="text-xl">Loading experience...</div>
      </div>
    );
  }

  const priceInMON = Number(preview.price) / 1e18;
  const rewardInMON = Number(preview.completionReward) / 1e18;

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-900 to-black text-white">
      <div className="max-w-5xl mx-auto p-6">
        {/* Back Button */}
        <button
          onClick={() => router.back()}
          className="mb-4 text-gray-400 hover:text-white"
        >
          ← Back to Experiences
        </button>

        {/* Preview Image */}
        <div className="relative h-96 bg-gray-800 rounded-xl overflow-hidden mb-6">
          {preview.previewImageHash ? (
            <img
              src={`https://ipfs.io/ipfs/${preview.previewImageHash}`}
              alt={preview.title}
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-gray-500">
              No preview image
            </div>
          )}
          <div className="absolute top-4 right-4 bg-black/70 px-4 py-2 rounded-full">
            {EXPERIENCE_TYPES[preview.experienceType]}
          </div>
        </div>

        {/* Title & Location */}
        <h1 className="text-4xl font-bold mb-2">{preview.title}</h1>
        <div className="flex items-center gap-2 text-gray-400 mb-6">
          <span>📍 {preview.city}, {preview.country}</span>
          {hasPurchased && location && (
            <span className="text-green-400">• Location Revealed</span>
          )}
        </div>

        {/* Preview Description */}
        <div className="bg-gray-800 rounded-xl p-6 mb-6">
          <h2 className="text-2xl font-bold mb-4">About This Experience</h2>
          <p className="text-gray-300 leading-relaxed">{preview.previewDescription}</p>

          {!hasPurchased && (
            <div className="mt-4 p-4 bg-yellow-900/20 border border-yellow-700 rounded-lg">
              <p className="text-yellow-400 text-sm">
                🔒 Purchase this experience to reveal the exact location and full details
              </p>
            </div>
          )}
        </div>

        {/* Location Revealed (Only if purchased) */}
        {hasPurchased && location && (
          <>
            <div className="bg-gray-800 rounded-xl p-6 mb-6">
              <h2 className="text-2xl font-bold mb-4">📍 Exact Location</h2>
              <div className="mb-4">
                <div className="text-xl font-semibold text-purple-400 mb-2">
                  {location.locationName}
                </div>
                <div className="text-sm text-gray-400">
                  Lat: {Number(location.latitude) / 1e6}, Lon: {Number(location.longitude) / 1e6}
                </div>
                <div className="text-sm text-gray-400">
                  Check-in radius: {location.proximityRadius}m
                </div>
              </div>

              {/* Map */}
              <div className="h-64 bg-gray-700 rounded-lg overflow-hidden">
                <MapWithLocation
                  latitude={Number(location.latitude) / 1e6}
                  longitude={Number(location.longitude) / 1e6}
                  radius={location.proximityRadius}
                />
              </div>
            </div>

            <div className="bg-gray-800 rounded-xl p-6 mb-6">
              <h2 className="text-2xl font-bold mb-4">Full Experience Guide</h2>
              <p className="text-gray-300 leading-relaxed whitespace-pre-wrap">
                {location.fullDescription}
              </p>
            </div>

            {/* Transportation */}
            <div className="bg-purple-900/20 border border-purple-700 rounded-xl p-6 mb-6">
              <h3 className="text-xl font-bold mb-2">Need a ride?</h3>
              <p className="text-gray-300 mb-4">
                Book transportation to this experience location
              </p>
              <button
                onClick={handleRequestTransport}
                className="bg-purple-600 hover:bg-purple-700 px-6 py-3 rounded-lg font-semibold"
              >
                🚗 Book Transportation
              </button>
            </div>

            {/* Check-in Button */}
            <div className="bg-green-900/20 border border-green-700 rounded-xl p-6">
              <h3 className="text-xl font-bold mb-2">Ready to complete?</h3>
              <p className="text-gray-300 mb-4">
                Visit the location and check in to earn your {rewardInMON} MON reward!
              </p>
              <button
                onClick={() => router.push(`/experiences/${experienceId}/checkin`)}
                className="bg-green-600 hover:bg-green-700 px-6 py-3 rounded-lg font-semibold"
              >
                ✓ Check In & Earn Reward
              </button>
            </div>
          </>
        )}

        {/* Purchase Section (Only if NOT purchased) */}
        {!hasPurchased && (
          <div className="bg-gray-800 rounded-xl p-6">
            <div className="flex items-center justify-between mb-4">
              <div>
                <div className="text-3xl font-bold text-purple-400">{priceInMON} MON</div>
                <div className="text-sm text-gray-400">
                  Complete and earn {rewardInMON} MON back
                </div>
              </div>
              <div className="text-right text-sm text-gray-400">
                <div>{preview.totalPurchased} purchased</div>
                <div>{preview.totalCompleted} completed</div>
              </div>
            </div>

            {!address ? (
              <div className="bg-red-900/20 border border-red-700 rounded-lg p-4 text-center">
                <p className="text-red-400">Connect wallet to purchase</p>
              </div>
            ) : approvalNeeded ? (
              <button
                onClick={handleApprove}
                className="w-full bg-blue-600 hover:bg-blue-700 px-6 py-4 rounded-lg font-bold text-lg"
              >
                1. Approve WMON
              </button>
            ) : (
              <button
                onClick={handlePurchase}
                className="w-full bg-purple-600 hover:bg-purple-700 px-6 py-4 rounded-lg font-bold text-lg"
              >
                2. Purchase Experience
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// Minimal ABIs
const ExperienceNFTABI = [
  {
    inputs: [{ name: 'experienceId', type: 'uint256' }],
    name: 'getExperiencePreview',
    outputs: [
      { name: 'title', type: 'string' },
      { name: 'previewDescription', type: 'string' },
      { name: 'country', type: 'string' },
      { name: 'city', type: 'string' },
      { name: 'experienceType', type: 'uint8' },
      { name: 'price', type: 'uint256' },
      { name: 'completionReward', type: 'uint256' },
      { name: 'previewImageHash', type: 'string' },
      { name: 'totalPurchased', type: 'uint256' },
      { name: 'totalCompleted', type: 'uint256' },
      { name: 'active', type: 'bool' },
    ],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [
      { name: 'user', type: 'address' },
      { name: 'experienceId', type: 'uint256' },
    ],
    name: 'hasUserPurchased',
    outputs: [{ name: '', type: 'bool' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [{ name: 'experienceId', type: 'uint256' }],
    name: 'purchaseExperience',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
] as const;

const ERC20ABI = [
  {
    inputs: [
      { name: 'owner', type: 'address' },
      { name: 'spender', type: 'address' },
    ],
    name: 'allowance',
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [
      { name: 'spender', type: 'address' },
      { name: 'amount', type: 'uint256' },
    ],
    name: 'approve',
    outputs: [{ name: '', type: 'bool' }],
    stateMutability: 'nonpayable',
    type: 'function',
  },
] as const;
