'use client';

import { useState } from 'react';
import { useAccount, useWriteContract, useWaitForTransactionReceipt } from 'wagmi';
import { Address, parseEther } from 'viem';
import { useRouter } from 'next/navigation';
import { uploadToIPFS } from '@/lib/uploadToIPFS';

const EXPERIENCE_NFT_ADDRESS = process.env.NEXT_PUBLIC_EXPERIENCE_NFT as Address;

const EXPERIENCE_TYPES = [
  'Food', 'Attraction', 'Cultural', 'Nature',
  'Entertainment', 'Accommodation', 'Shopping', 'Adventure', 'Other'
];

export default function CreateExperiencePage() {
  const router = useRouter();
  const { address } = useAccount();

  const [formData, setFormData] = useState({
    title: '',
    previewDescription: '',
    country: '',
    city: '',
    experienceType: 0,
    price: '',
    completionReward: '',
    locationName: '',
    fullDescription: '',
    proximityRadius: '100',
  });

  const [location, setLocation] = useState({ latitude: '', longitude: '' });
  const [previewImage, setPreviewImage] = useState<File | null>(null);
  const [previewImageURL, setPreviewImageURL] = useState<string | null>(null);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [previewIPFSHash, setPreviewIPFSHash] = useState<string | null>(null);
  const [gettingLocation, setGettingLocation] = useState(false);

  const { writeContract: createExp, data: createHash } = useWriteContract();
  const { isSuccess: createSuccess } = useWaitForTransactionReceipt({ hash: createHash });

  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      alert('Please select an image file');
      return;
    }

    setPreviewImage(file);
    setPreviewImageURL(URL.createObjectURL(file));
  };

  const handleUploadImage = async () => {
    if (!previewImage) return;

    setUploadingImage(true);
    try {
      const hash = await uploadToIPFS(previewImage);
      setPreviewIPFSHash(hash);
      alert('Image uploaded successfully!');
    } catch (error) {
      console.error('Failed to upload image:', error);
      alert('Failed to upload image');
    } finally {
      setUploadingImage(false);
    }
  };

  const getCurrentLocation = () => {
    setGettingLocation(true);

    if (!navigator.geolocation) {
      alert('Geolocation not supported');
      setGettingLocation(false);
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        setLocation({
          latitude: position.coords.latitude.toFixed(6),
          longitude: position.coords.longitude.toFixed(6),
        });
        setGettingLocation(false);
      },
      (error) => {
        console.error('Error getting location:', error);
        alert('Failed to get location');
        setGettingLocation(false);
      },
      { enableHighAccuracy: true }
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!previewIPFSHash) {
      alert('Please upload a preview image');
      return;
    }

    if (!location.latitude || !location.longitude) {
      alert('Please set the location');
      return;
    }

    // Convert to contract format
    const latInt = Math.floor(parseFloat(location.latitude) * 1e6);
    const lonInt = Math.floor(parseFloat(location.longitude) * 1e6);
    const priceWei = parseEther(formData.price);
    const rewardWei = parseEther(formData.completionReward);

    createExp({
      address: EXPERIENCE_NFT_ADDRESS,
      abi: ExperienceNFTABI,
      functionName: 'createExperience',
      args: [
        formData.title,
        formData.previewDescription,
        formData.country,
        formData.city,
        formData.experienceType,
        priceWei,
        rewardWei,
        previewIPFSHash,
        BigInt(latInt),
        BigInt(lonInt),
        formData.locationName,
        formData.fullDescription,
        BigInt(formData.proximityRadius),
      ],
    });
  };

  if (createSuccess) {
    router.push('/experiences?created=true');
  }

  if (!address) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-gray-900 to-black text-white flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold mb-4">Connect Wallet</h1>
          <p className="text-gray-400">Please connect your wallet to create an experience</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-900 to-black text-white p-6">
      <div className="max-w-3xl mx-auto">
        <button
          onClick={() => router.back()}
          className="mb-4 text-gray-400 hover:text-white"
        >
          ← Back
        </button>

        <h1 className="text-4xl font-bold mb-2">Create Experience</h1>
        <p className="text-gray-400 mb-8">
          Share your favorite places with GPS-revealed locations
        </p>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Basic Info */}
          <div className="bg-gray-800 rounded-xl p-6">
            <h2 className="text-xl font-bold mb-4">Basic Information</h2>

            <div className="space-y-4">
              <div>
                <label className="block text-sm text-gray-400 mb-2">Title*</label>
                <input
                  type="text"
                  value={formData.title}
                  onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                  className="w-full bg-gray-700 border border-gray-600 rounded-lg px-4 py-2 text-white"
                  placeholder="Hidden Beach in Accra"
                  required
                />
              </div>

              <div>
                <label className="block text-sm text-gray-400 mb-2">Preview Description*</label>
                <textarea
                  value={formData.previewDescription}
                  onChange={(e) => setFormData({ ...formData, previewDescription: e.target.value })}
                  className="w-full bg-gray-700 border border-gray-600 rounded-lg px-4 py-2 text-white h-24"
                  placeholder="A short teaser about this experience (visible before purchase)"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm text-gray-400 mb-2">Country*</label>
                  <input
                    type="text"
                    value={formData.country}
                    onChange={(e) => setFormData({ ...formData, country: e.target.value })}
                    className="w-full bg-gray-700 border border-gray-600 rounded-lg px-4 py-2 text-white"
                    placeholder="Ghana"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm text-gray-400 mb-2">City*</label>
                  <input
                    type="text"
                    value={formData.city}
                    onChange={(e) => setFormData({ ...formData, city: e.target.value })}
                    className="w-full bg-gray-700 border border-gray-600 rounded-lg px-4 py-2 text-white"
                    placeholder="Accra"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm text-gray-400 mb-2">Type*</label>
                <select
                  value={formData.experienceType}
                  onChange={(e) => setFormData({ ...formData, experienceType: Number(e.target.value) })}
                  className="w-full bg-gray-700 border border-gray-600 rounded-lg px-4 py-2 text-white"
                >
                  {EXPERIENCE_TYPES.map((type, index) => (
                    <option key={type} value={index}>{type}</option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {/* Preview Image */}
          <div className="bg-gray-800 rounded-xl p-6">
            <h2 className="text-xl font-bold mb-4">Preview Image*</h2>

            <input
              type="file"
              accept="image/*"
              onChange={handleImageSelect}
              className="hidden"
              id="image-input"
            />

            <label
              htmlFor="image-input"
              className="block w-full bg-purple-600 hover:bg-purple-700 px-6 py-3 rounded-lg font-semibold text-center cursor-pointer mb-4"
            >
              📷 Select Image
            </label>

            {previewImageURL && (
              <div className="mb-4">
                <img
                  src={previewImageURL}
                  alt="Preview"
                  className="w-full h-64 object-cover rounded-lg mb-3"
                />
                {!previewIPFSHash && (
                  <button
                    type="button"
                    onClick={handleUploadImage}
                    disabled={uploadingImage}
                    className="w-full bg-green-600 hover:bg-green-700 disabled:bg-gray-700 px-6 py-3 rounded-lg font-semibold"
                  >
                    {uploadingImage ? 'Uploading...' : '☁️ Upload to IPFS'}
                  </button>
                )}
              </div>
            )}

            {previewIPFSHash && (
              <div className="bg-green-900/20 border border-green-700 rounded-lg p-3 text-sm">
                <div className="text-green-400 font-semibold mb-1">✓ Uploaded</div>
                <div className="text-xs font-mono text-gray-400 break-all">{previewIPFSHash}</div>
              </div>
            )}
          </div>

          {/* Hidden Details (Revealed After Purchase) */}
          <div className="bg-gray-800 rounded-xl p-6">
            <h2 className="text-xl font-bold mb-2">Hidden Details</h2>
            <p className="text-sm text-gray-400 mb-4">
              These details are only revealed after purchase
            </p>

            <div className="space-y-4">
              <div>
                <label className="block text-sm text-gray-400 mb-2">Exact Location Name*</label>
                <input
                  type="text"
                  value={formData.locationName}
                  onChange={(e) => setFormData({ ...formData, locationName: e.target.value })}
                  className="w-full bg-gray-700 border border-gray-600 rounded-lg px-4 py-2 text-white"
                  placeholder="Labadi Beach, near Palm Tree Hotel"
                  required
                />
              </div>

              <div>
                <label className="block text-sm text-gray-400 mb-2 flex items-center justify-between">
                  <span>GPS Coordinates*</span>
                  <button
                    type="button"
                    onClick={getCurrentLocation}
                    disabled={gettingLocation}
                    className="text-xs bg-blue-600 hover:bg-blue-700 disabled:bg-gray-700 px-3 py-1 rounded"
                  >
                    {gettingLocation ? 'Getting...' : '📍 Use Current'}
                  </button>
                </label>
                <div className="grid grid-cols-2 gap-4">
                  <input
                    type="text"
                    value={location.latitude}
                    onChange={(e) => setLocation({ ...location, latitude: e.target.value })}
                    className="w-full bg-gray-700 border border-gray-600 rounded-lg px-4 py-2 text-white"
                    placeholder="Latitude (5.614818)"
                    required
                  />
                  <input
                    type="text"
                    value={location.longitude}
                    onChange={(e) => setLocation({ ...location, longitude: e.target.value })}
                    className="w-full bg-gray-700 border border-gray-600 rounded-lg px-4 py-2 text-white"
                    placeholder="Longitude (-0.187500)"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm text-gray-400 mb-2">Check-in Radius (meters)*</label>
                <input
                  type="number"
                  value={formData.proximityRadius}
                  onChange={(e) => setFormData({ ...formData, proximityRadius: e.target.value })}
                  className="w-full bg-gray-700 border border-gray-600 rounded-lg px-4 py-2 text-white"
                  placeholder="100"
                  min="1"
                  max="1000"
                  required
                />
                <p className="text-xs text-gray-500 mt-1">
                  Users must be within this radius to check in
                </p>
              </div>

              <div>
                <label className="block text-sm text-gray-400 mb-2">Full Description*</label>
                <textarea
                  value={formData.fullDescription}
                  onChange={(e) => setFormData({ ...formData, fullDescription: e.target.value })}
                  className="w-full bg-gray-700 border border-gray-600 rounded-lg px-4 py-2 text-white h-32"
                  placeholder="Detailed guide: how to get there, what to expect, best times to visit, tips, etc."
                  required
                />
              </div>
            </div>
          </div>

          {/* Pricing */}
          <div className="bg-gray-800 rounded-xl p-6">
            <h2 className="text-xl font-bold mb-4">Pricing</h2>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm text-gray-400 mb-2">Price (WMON)*</label>
                <input
                  type="text"
                  value={formData.price}
                  onChange={(e) => setFormData({ ...formData, price: e.target.value })}
                  className="w-full bg-gray-700 border border-gray-600 rounded-lg px-4 py-2 text-white"
                  placeholder="25"
                  required
                />
                <p className="text-xs text-gray-500 mt-1">What users pay to unlock</p>
              </div>
              <div>
                <label className="block text-sm text-gray-400 mb-2">Completion Reward (WMON)*</label>
                <input
                  type="text"
                  value={formData.completionReward}
                  onChange={(e) => setFormData({ ...formData, completionReward: e.target.value })}
                  className="w-full bg-gray-700 border border-gray-600 rounded-lg px-4 py-2 text-white"
                  placeholder="10"
                  required
                />
                <p className="text-xs text-gray-500 mt-1">What users earn for completing</p>
              </div>
            </div>
          </div>

          {/* Submit */}
          <button
            type="submit"
            disabled={!previewIPFSHash || !location.latitude || !location.longitude}
            className="w-full bg-purple-600 hover:bg-purple-700 disabled:bg-gray-700 disabled:cursor-not-allowed px-6 py-4 rounded-lg font-bold text-lg"
          >
            Create Experience
          </button>
        </form>
      </div>
    </div>
  );
}

const ExperienceNFTABI = [
  {
    inputs: [
      { name: 'title', type: 'string' },
      { name: 'previewDescription', type: 'string' },
      { name: 'country', type: 'string' },
      { name: 'city', type: 'string' },
      { name: 'experienceType', type: 'uint8' },
      { name: 'price', type: 'uint256' },
      { name: 'completionReward', type: 'uint256' },
      { name: 'previewImageHash', type: 'string' },
      { name: 'latitude', type: 'int256' },
      { name: 'longitude', type: 'int256' },
      { name: 'locationName', type: 'string' },
      { name: 'fullDescription', type: 'string' },
      { name: 'proximityRadius', type: 'uint256' },
    ],
    name: 'createExperience',
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'nonpayable',
    type: 'function',
  },
] as const;
