'use client';

import { useEffect, useState } from 'react';

export default function InvestorPage() {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const deckUrl = typeof window !== 'undefined'
    ? `${window.location.origin}/investor-deck/`
    : 'https://fcempowertours-production-6551.up.railway.app/investor-deck/';

  const qrCodeUrl = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(deckUrl)}`;

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 text-white flex flex-col items-center justify-center p-8">
      <div className="max-w-md w-full text-center">
        <h1 className="text-4xl font-bold mb-2 bg-gradient-to-r from-cyan-400 to-purple-500 bg-clip-text text-transparent">
          EmpowerTours
        </h1>
        <p className="text-gray-400 mb-8">Investor Presentation</p>

        <div className="bg-white p-4 rounded-2xl shadow-2xl mb-8 inline-block">
          {mounted && (
            <img
              src={qrCodeUrl}
              alt="QR Code to Investor Deck"
              className="w-64 h-64"
            />
          )}
        </div>

        <p className="text-sm text-gray-500 mb-4">
          Scan to view the full presentation
        </p>

        <a
          href="/investor-deck/"
          className="inline-block px-8 py-3 bg-gradient-to-r from-cyan-500 to-purple-600 rounded-full font-semibold hover:opacity-90 transition-opacity"
        >
          Open Presentation
        </a>

        <div className="mt-12 text-xs text-gray-600">
          <p>Prepared for: Faisal Al Hammadi</p>
          <p>Further Asset Management</p>
          <p className="mt-2">February 2026</p>
        </div>
      </div>
    </div>
  );
}
