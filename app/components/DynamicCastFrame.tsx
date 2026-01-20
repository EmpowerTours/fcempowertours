'use client';
import { useState, useEffect } from 'react';

interface Cast {
  id: string;
  text: string;
  author: {
    username: string;
    pfp_url?: string;
  };
  timestamp: number;
  category?: string;
}

export default function DynamicCastFrame() {
  const [casts, setCasts] = useState<Cast[]>([]);
  const [activeCategories, setActiveCategories] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Fetch casts
  useEffect(() => {
    const fetchCasts = async () => {
      try {
        setIsLoading(true);
        setError(null);
        
        // ✅ Remove # from categories for search
        const cleanCategories = activeCategories.map(cat => cat.replace('#', ''));
        const params = cleanCategories.length > 0 ? `?categories=${cleanCategories.join(',')}` : '';
        const res = await fetch(`/api/dynamic-casts${params}`);
        
        if (!res.ok) {
          throw new Error(`Failed to fetch: ${res.status}`);
        }
        
        const data = await res.json();
        
        console.log('📊 Fetched casts:', {
          count: data.casts?.length || 0,
          hasFilters: activeCategories.length > 0,
          categories: activeCategories
        });
        
        // When filtering, replace casts. When not filtering, append.
        if (activeCategories.length > 0) {
          setCasts(data.casts || []);
        } else {
          setCasts((prevCasts) => {
            const newCasts = (data.casts || []).filter(
              (cast: Cast) => !prevCasts.some((existing) => existing.id === cast.id)
            );
            return [...prevCasts, ...newCasts].slice(-50);
          });
        }
      } catch (error) {
        console.error('❌ Failed to fetch casts:', error);
        setError('Failed to load casts. Retrying...');
      } finally {
        setIsLoading(false);
      }
    };

    fetchCasts();
    const interval = setInterval(fetchCasts, 5000);
    return () => clearInterval(interval);
  }, [activeCategories]);

  const toggleCategory = (cat: string) => {
    setActiveCategories((prev) =>
      prev.includes(cat) ? prev.filter((c) => c !== cat) : [...prev, cat]
    );
  };

  // ✅ Categories without # symbol
  const categories = ['food', 'accommodation', 'travel', 'music', 'art', 'tech'];

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-900 via-blue-900 to-black text-white overflow-hidden relative">
      {/* Animated background gradient */}
      <div className="absolute inset-0 opacity-30">
        <div className="absolute top-0 left-0 w-96 h-96 bg-purple-500 rounded-full mix-blend-multiply filter blur-3xl animate-blob"></div>
        <div className="absolute top-0 right-0 w-96 h-96 bg-blue-500 rounded-full mix-blend-multiply filter blur-3xl animate-blob animation-delay-2000"></div>
        <div className="absolute bottom-0 left-1/2 w-96 h-96 bg-pink-500 rounded-full mix-blend-multiply filter blur-3xl animate-blob animation-delay-4000"></div>
      </div>

      {/* Header */}
      <div className="relative z-10 p-8">
        <div className="text-center mb-8">
          <h1 className="text-6xl font-bold mb-4 bg-clip-text text-transparent bg-gradient-to-r from-purple-400 via-pink-400 to-blue-400 animate-gradient">
            🎵 EmpowerTours Live
          </h1>
          <p className="text-xl text-purple-300">Real-time Farcaster vibes</p>
        </div>

        {/* Category filters - Display with # but search without */}
        <div className="flex flex-wrap justify-center gap-3 mb-8">
          {categories.map((cat) => (
            <button
              key={cat}
              onClick={() => toggleCategory(cat)}
              className={`px-6 py-2 rounded-full font-medium transition-all transform hover:scale-105 ${
                activeCategories.includes(cat)
                  ? 'bg-gradient-to-r from-purple-600 to-blue-600 text-white shadow-lg shadow-purple-500/50'
                  : 'bg-white/10 backdrop-blur-sm text-purple-300 hover:bg-white/20'
              }`}
            >
              #{cat}
            </button>
          ))}
        </div>

        {/* Active filter count */}
        {activeCategories.length > 0 && (
          <div className="text-center mb-4">
            <span className="px-4 py-2 bg-purple-500/20 backdrop-blur-sm rounded-full text-sm">
              ✨ {activeCategories.length} filter{activeCategories.length > 1 ? 's' : ''} active
            </span>
          </div>
        )}

        {/* Error message */}
        {error && (
          <div className="text-center mb-4">
            <span className="px-4 py-2 bg-red-500/20 backdrop-blur-sm rounded-full text-sm text-red-300">
              ⚠️ {error}
            </span>
          </div>
        )}
      </div>

      {/* Cast feed */}
      <div className="relative z-10 px-8 pb-8">
        <div className="max-w-4xl mx-auto space-y-4">
          {isLoading && casts.length === 0 ? (
            <div className="text-center py-20">
              <div className="text-6xl mb-4 animate-pulse">⏳</div>
              <p className="text-xl text-purple-300">Loading trending casts...</p>
            </div>
          ) : casts.length === 0 ? (
            <div className="text-center py-20">
              <div className="text-6xl mb-4">🔍</div>
              <p className="text-xl text-purple-300 mb-4">
                {activeCategories.length > 0 
                  ? 'No casts found for selected categories'
                  : 'No casts available'
                }
              </p>
              {activeCategories.length > 0 && (
                <button
                  onClick={() => setActiveCategories([])}
                  className="px-6 py-2 bg-purple-600 text-white rounded-full hover:bg-purple-700 transition-all"
                >
                  Clear Filters
                </button>
              )}
            </div>
          ) : (
            casts.slice(-20).reverse().map((cast, index) => (
              <div
                key={cast.id}
                className="bg-white/5 backdrop-blur-md rounded-2xl p-6 border border-white/10 hover:border-purple-400/50 transition-all transform hover:scale-102 hover:shadow-xl hover:shadow-purple-500/20 animate-slide-in"
                style={{ animationDelay: `${index * 0.05}s` }}
              >
                {/* Author */}
                <div className="flex items-center gap-2 mb-3">
                  {cast.author.pfp_url ? (
                    <img
                      src={cast.author.pfp_url}
                      alt={cast.author.username}
                      className="rounded-full"
                      style={{
                        width: '24px',
                        height: '24px',
                        minWidth: '24px',
                        minHeight: '24px',
                        maxWidth: '24px',
                        maxHeight: '24px',
                        objectFit: 'cover',
                      }}
                    />
                  ) : (
                    <div className="w-6 h-6 rounded-full bg-gradient-to-br from-purple-500 to-blue-500 flex items-center justify-center text-[10px] font-bold">
                      {cast.author.username.charAt(0).toUpperCase()}
                    </div>
                  )}
                  <div>
                    <p className="font-bold text-purple-300">@{cast.author.username}</p>
                    <p className="text-xs text-purple-400/60">
                      {new Date(cast.timestamp).toLocaleTimeString()}
                    </p>
                  </div>
                  {cast.category && (
                    <span className="ml-auto px-3 py-1 bg-purple-600/30 rounded-full text-xs text-purple-300">
                      {cast.category}
                    </span>
                  )}
                </div>
                {/* Cast text */}
                <p className="text-white/90 leading-relaxed">{cast.text}</p>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Floating text borders */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden z-0">
        <div className="absolute top-0 left-0 right-0 h-20 bg-gradient-to-b from-black/50 to-transparent"></div>
        <div className="absolute bottom-0 left-0 right-0 h-20 bg-gradient-to-t from-black/50 to-transparent"></div>
      </div>

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
        @keyframes slide-in {
          from {
            opacity: 0;
            transform: translateY(20px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
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
        .animate-slide-in {
          animation: slide-in 0.5s ease-out forwards;
        }
        .hover\\:scale-102:hover {
          transform: scale(1.02);
        }
      `}</style>
    </div>
  );
}
