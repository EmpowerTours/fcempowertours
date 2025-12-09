'use client';

import { useEffect, useState } from 'react';
import { useAccount, useReadContract } from 'wagmi';
import { Address } from 'viem';
import Link from 'next/link';

const EXPERIENCE_NFT_ADDRESS = process.env.NEXT_PUBLIC_EXPERIENCE_NFT as Address;

interface Experience {
  experienceId: string;
  creator: string;
  title: string;
  city: string;
  country: string;
  price: bigint;
  active: boolean;
  createdAt: string;
}

export default function ExperiencesPage() {
  const { address } = useAccount();
  const [experiences, setExperiences] = useState<Experience[]>([]);
  const [selectedCountry, setSelectedCountry] = useState<string>('All');

  // Fetch experiences from Envio indexer
  useEffect(() => {
    fetchExperiences();
  }, []);

  const fetchExperiences = async () => {
    try {
      const query = `
        query GetExperiences {
          Experience(
            where: { active: { _eq: true } },
            order_by: { createdAt: desc },
            limit: 50
          ) {
            experienceId
            creator
            title
            city
            country
            price
            active
            createdAt
          }
        }
      `;

      const response = await fetch(process.env.NEXT_PUBLIC_ENVIO_ENDPOINT || '', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query }),
      });

      const data = await response.json();
      setExperiences(data.data?.Experience || []);
    } catch (error) {
      console.error('Failed to fetch experiences:', error);
    }
  };

  const filteredExperiences = experiences.filter(exp => {
    const countryMatch = selectedCountry === 'All' || exp.country === selectedCountry;
    return countryMatch;
  });

  const countries = ['All', ...new Set(experiences.map(e => e.country))];

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

  return (
    <Link href={`/experiences/${experience.experienceId}`}>
      <div className="bg-gray-800 rounded-xl overflow-hidden hover:ring-2 ring-purple-500 transition-all cursor-pointer">
        {/* Image */}
        <div className="relative h-48 bg-gradient-to-br from-purple-900/40 to-blue-900/40">
          <div className="w-full h-full flex items-center justify-center">
            <div className="text-6xl">🗺️</div>
          </div>
        </div>

        {/* Content */}
        <div className="p-4">
          <h3 className="text-xl font-bold mb-2">{experience.title}</h3>

          <div className="flex items-center gap-2 text-sm text-gray-400 mb-3">
            <span>📍 {experience.city}, {experience.country}</span>
          </div>

          <p className="text-gray-300 text-sm mb-4">
            GPS-gated travel experience
          </p>

          <div className="flex items-center justify-between border-t border-gray-700 pt-3">
            <div>
              <div className="text-2xl font-bold text-purple-400">{priceInMON} MON</div>
              <div className="text-xs text-gray-500">Purchase to unlock location</div>
            </div>
          </div>
        </div>
      </div>
    </Link>
  );
}
