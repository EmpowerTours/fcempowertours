'use client';

import { TandaPoolManager } from '@/app/components/mini-apps/TandaPoolManager';
import PassportGate from '@/app/components/PassportGate';

export default function TandaPage() {
  return (
    <PassportGate>
      <div className="min-h-screen bg-gradient-to-br from-purple-900 via-indigo-900 to-blue-900 py-12 px-4">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-8">
            <h1 className="text-5xl font-bold text-white mb-4">🤝 Tanda Pool</h1>
            <p className="text-blue-200 text-lg max-w-2xl mx-auto">
              Join rotating savings and credit pools to access community lending and build financial resilience
            </p>
          </div>

          <TandaPoolManager />

          {/* Info Section */}
          <div className="mt-12 bg-white/5 backdrop-blur-lg rounded-2xl p-8 border border-white/10">
            <h2 className="text-2xl font-bold text-white mb-6">What is a Tanda Pool?</h2>
            <div className="grid md:grid-cols-3 gap-6 text-center">
              <div>
                <div className="text-4xl mb-3">💰</div>
                <h3 className="text-white font-semibold mb-2">Pool Your Funds</h3>
                <p className="text-blue-200 text-sm">
                  Members contribute regularly to create a shared savings pool
                </p>
              </div>
              <div>
                <div className="text-4xl mb-3">🔄</div>
                <h3 className="text-white font-semibold mb-2">Rotating Payouts</h3>
                <p className="text-blue-200 text-sm">
                  Each round, one member receives the entire pool
                </p>
              </div>
              <div>
                <div className="text-4xl mb-3">🤝</div>
                <h3 className="text-white font-semibold mb-2">Build Trust</h3>
                <p className="text-blue-200 text-sm">
                  Strengthen community bonds and financial security together
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </PassportGate>
  );
}
