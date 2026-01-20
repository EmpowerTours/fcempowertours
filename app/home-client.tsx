'use client';

import DynamicCastFrame from './components/DynamicCastFrame';

export default function HomeClient() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-900 via-blue-900 to-black text-white">
      {/* Hero Section */}
      <div className="relative overflow-hidden">
        {/* Animated background */}
        <div className="absolute inset-0 opacity-20">
          <div className="absolute top-0 left-0 w-96 h-96 bg-purple-500 rounded-full mix-blend-multiply filter blur-3xl animate-blob"></div>
          <div className="absolute top-0 right-0 w-96 h-96 bg-blue-500 rounded-full mix-blend-multiply filter blur-3xl animate-blob animation-delay-2000"></div>
          <div className="absolute bottom-0 left-1/2 w-96 h-96 bg-pink-500 rounded-full mix-blend-multiply filter blur-3xl animate-blob animation-delay-4000"></div>
        </div>

        {/* Content */}
        <div className="relative z-10 max-w-7xl mx-auto px-4 py-20">
          <div className="text-center">
            <h1 className="text-7xl font-bold mb-6 bg-clip-text text-transparent bg-gradient-to-r from-purple-400 via-pink-400 to-blue-400 animate-gradient">
              🎵 EmpowerTours
            </h1>

            <p className="text-2xl text-purple-300 mb-8 max-w-2xl mx-auto">
              Travel the world, mint memories, and share music on Monad
            </p>

            {/* Feature Pills */}
            <div className="flex flex-wrap justify-center gap-4 mb-12">
              <div className="px-6 py-3 bg-white/10 backdrop-blur-sm rounded-full border border-purple-400/50">
                🎫 Digital Passports
              </div>
              <div className="px-6 py-3 bg-white/10 backdrop-blur-sm rounded-full border border-blue-400/50">
                🎵 Music NFTs
              </div>
              <div className="px-6 py-3 bg-white/10 backdrop-blur-sm rounded-full border border-yellow-400/50">
                👁️ Monad Sync
              </div>
              <div className="px-6 py-3 bg-white/10 backdrop-blur-sm rounded-full border border-pink-400/50">
                ⚡ Gasless Minting
              </div>
              <div className="px-6 py-3 bg-white/10 backdrop-blur-sm rounded-full border border-green-400/50">
                🚀 Powered by Monad
              </div>
            </div>

            {/* CTA Buttons */}
            <div className="flex flex-col sm:flex-row gap-4 justify-center items-center">
              <a
                href="/monad-sync"
                className="px-8 py-4 bg-gradient-to-r from-yellow-600 via-orange-600 to-red-600 text-white rounded-lg font-bold text-lg hover:from-yellow-700 hover:via-orange-700 hover:to-red-700 transition-all transform hover:scale-105 shadow-lg shadow-orange-500/50"
              >
                👁️ Sync Your Monad
              </a>

              <a
                href="/passport"
                className="px-8 py-4 bg-gradient-to-r from-purple-600 to-pink-600 text-white rounded-lg font-bold text-lg hover:from-purple-700 hover:to-pink-700 transition-all transform hover:scale-105 shadow-lg shadow-purple-500/50"
              >
                🎫 Get Your Passport
              </a>

              <a
                href="/nft"
                className="px-8 py-4 bg-gradient-to-r from-blue-600 to-cyan-600 text-white rounded-lg font-bold text-lg hover:from-blue-700 hover:to-cyan-700 transition-all transform hover:scale-105 shadow-lg shadow-blue-500/50"
              >
                🎵 Mint Music
              </a>

              <a
                href="/dashboard"
                className="px-8 py-4 bg-white/10 backdrop-blur-sm text-white rounded-lg font-bold text-lg hover:bg-white/20 transition-all border border-white/30"
              >
                📊 Dashboard
              </a>
            </div>
          </div>
        </div>
      </div>

      {/* 🔴 LIVE CASTS FROM FARCASTER - REPLACES STATIC CONTENT */}
      <div className="max-w-7xl mx-auto px-4 py-20">
        <h2 className="text-4xl font-bold text-center mb-12">
          🔴 Live from Farcaster
        </h2>
        <DynamicCastFrame />
      </div>

      {/* Stats Section */}
      <div className="bg-gradient-to-r from-purple-900/50 to-blue-900/50 py-16">
        <div className="max-w-7xl mx-auto px-4">
          <div className="grid md:grid-cols-4 gap-8 text-center">
            <div>
              <div className="text-4xl font-bold text-purple-400 mb-2">Live</div>
              <div className="text-purple-300">On Testnet</div>
            </div>
            <div>
              <div className="text-4xl font-bold text-blue-400 mb-2">195</div>
              <div className="text-blue-300">Countries</div>
            </div>
            <div>
              <div className="text-4xl font-bold text-pink-400 mb-2">100%</div>
              <div className="text-pink-300">Gasless</div>
            </div>
            <div>
              <div className="text-4xl font-bold text-green-400 mb-2">Envio</div>
              <div className="text-green-300">Powered</div>
            </div>
          </div>
        </div>
      </div>

      {/* Footer */}
      <footer className="py-12 border-t border-white/10">
        <div className="max-w-7xl mx-auto px-4 text-center">
          <p className="text-purple-300 mb-4">
            Built with ❤️ for Monad & Farcaster
          </p>
          <div className="flex justify-center gap-6 text-sm text-purple-400">
            <a href="/monad-sync" className="hover:text-yellow-300">👁️ Monad Sync</a>
            <a href="/profile" className="hover:text-purple-300">Profile</a>
            <a href="/market" className="hover:text-purple-300">Market</a>
            <a href="/dashboard" className="hover:text-purple-300">Dashboard</a>
          </div>
        </div>
      </footer>

      {/* Animations */}
      <style jsx>{`
        @keyframes blob {
          0%, 100% { transform: translate(0, 0) scale(1); }
          33% { transform: translate(30px, -50px) scale(1.1); }
          66% { transform: translate(-20px, 20px) scale(0.9); }
        }
        @keyframes gradient {
          0%, 100% { background-position: 0% 50%; }
          50% { background-position: 100% 50%; }
        }
        .animate-blob {
          animation: blob 7s infinite;
        }
        .animation-delay-2000 {
          animation-delay: 2s;
        }
        .animation-delay-4000 {
          animation-delay: 4s;
        }
        .animate-gradient {
          background-size: 200% 200%;
          animation: gradient 3s ease infinite;
        }
      `}</style>
    </div>
  );
}
