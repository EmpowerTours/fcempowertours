'use client';

import { useEffect, useState } from 'react';
import { useAccount, useReadContract } from 'wagmi';
import { Address } from 'viem';
import Link from 'next/link';

const EXPERIENCE_NFT_ADDRESS = process.env.NEXT_PUBLIC_EXPERIENCE_NFT as Address;

interface Experience {
  experienceId: number;
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

const EXPERIENCE_TYPES = [
  'Food', 'Attraction', 'Cultural', 'Nature',
  'Entertainment', 'Accommodation', 'Shopping', 'Adventure', 'Other'
];

export default function ExperiencesPage() {
  const { address } = useAccount();
  const [experiences, setExperiences] = useState<Experience[]>([]);
  const [selectedCountry, setSelectedCountry] = useState<string>('All');
  const [selectedType, setSelectedType] = useState<string>('All');

  // Fetch experiences from Envio indexer
  useEffect(() => {
    fetchExperiences();
  }, []);

  const fetchExperiences = async () => {
    try {
      const query = `
        query GetExperiences {
          ExperienceNFT(
            where: { active: { _eq: true } },
            order_by: { createdAt: desc },
            limit: 50
          ) {
            experienceId
            title
            previewDescription
            country
            city
            experienceType
            price
            completionReward
            previewImageHash
            totalPurchased
            totalCompleted
            active
          }
        }
      `;

      const response = await fetch(process.env.NEXT_PUBLIC_ENVIO_ENDPOINT || '', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query }),
      });

      const data = await response.json();
      setExperiences(data.data?.ExperienceNFT || []);
    } catch (error) {
      console.error('Failed to fetch experiences:', error);
    }
  };

  const filteredExperiences = experiences.filter(exp => {
    const countryMatch = selectedCountry === 'All' || exp.country === selectedCountry;
    const typeMatch = selectedType === 'All' || EXPERIENCE_TYPES[exp.experienceType] === selectedType;
    return countryMatch && typeMatch;
  });

  const countries = ['All', ...new Set(experiences.map(e => e.country))];
  const types = ['All', ...EXPERIENCE_TYPES];

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-900 to-black text-white p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-4xl font-bold mb-2">Discover Experiences</h1>
          <p className="text-gray-400">
            GPS-revealed travel adventures. Purchase to unlock exact location.
          </p>
        </div>

        {/* Filters */}
        <div className="flex gap-4 mb-8 flex-wrap">
          <select
            value={selectedCountry}
            onChange={(e) => setSelectedCountry(e.target.value)}
            className="bg-gray-800 border border-gray-700 rounded-lg px-4 py-2 text-white"
          >
            {countries.map(country => (
              <option key={country} value={country}>{country}</option>
            ))}
          </select>

          <select
            value={selectedType}
            onChange={(e) => setSelectedType(e.target.value)}
            className="bg-gray-800 border border-gray-700 rounded-lg px-4 py-2 text-white"
          >
            {types.map(type => (
              <option key={type} value={type}>{type}</option>
            ))}
          </select>

          <Link
            href="/experiences/create"
            className="ml-auto bg-purple-600 hover:bg-purple-700 px-6 py-2 rounded-lg font-semibold"
          >
            + Create Experience
          </Link>
        </div>

        {/* Experience Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredExperiences.map((exp) => (
            <ExperienceCard key={exp.experienceId} experience={exp} />
          ))}
        </div>

        {filteredExperiences.length === 0 && (
          <div className="text-center py-20 text-gray-500">
            No experiences found. Be the first to create one!
          </div>
        )}
      </div>
    </div>
  );
}

function ExperienceCard({ experience }: { experience: Experience }) {
  const priceInMON = Number(experience.price) / 1e18;
  const rewardInMON = Number(experience.completionReward) / 1e18;

  return (
    <Link href={`/experiences/${experience.experienceId}`}>
      <div className="bg-gray-800 rounded-xl overflow-hidden hover:ring-2 ring-purple-500 transition-all cursor-pointer">
        {/* Image */}
        <div className="relative h-48 bg-gray-700">
          {experience.previewImageHash ? (
            <img
              src={`https://ipfs.io/ipfs/${experience.previewImageHash}`}
              alt={experience.title}
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-gray-500">
              No preview
            </div>
          )}
          <div className="absolute top-2 right-2 bg-black/70 px-3 py-1 rounded-full text-sm">
            {EXPERIENCE_TYPES[experience.experienceType]}
          </div>
        </div>

        {/* Content */}
        <div className="p-4">
          <h3 className="text-xl font-bold mb-2">{experience.title}</h3>

          <div className="flex items-center gap-2 text-sm text-gray-400 mb-3">
            <span>📍 {experience.city}, {experience.country}</span>
          </div>

          <p className="text-gray-300 text-sm mb-4 line-clamp-2">
            {experience.previewDescription}
          </p>

          <div className="flex items-center justify-between border-t border-gray-700 pt-3">
            <div>
              <div className="text-2xl font-bold text-purple-400">{priceInMON} MON</div>
              <div className="text-xs text-gray-500">+ {rewardInMON} MON reward</div>
            </div>
            <div className="text-right text-xs text-gray-500">
              <div>{experience.totalPurchased} purchased</div>
              <div>{experience.totalCompleted} completed</div>
            </div>
          </div>
        </div>
      </div>
    </Link>
  );
}
