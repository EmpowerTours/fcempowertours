'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useFarcasterContext } from '@/app/hooks/useFarcasterContext';
import { useGeolocation } from '@/lib/useGeolocation';

// ✅ NEW: Function to convert transaction hashes to clickable links
function formatResponseWithLinks(text: string): string {
  // Pattern 1: Find "TX: 0x..." or "Tx: 0x..." and make clickable
  let formatted = text.replace(
    /TX:\s*(0x[a-fA-F0-9]{10,66})/gi,
    (match, hash) => `TX: <a href="https://testnet.monadscan.com/tx/${hash}" target="_blank" rel="noopener noreferrer" class="underline hover:text-blue-300 transition-colors">${hash.slice(0, 10)}...</a>`
  );

  // Pattern 2: Find "View: https://testnet.monadscan.com/tx/..." and make clickable
  formatted = formatted.replace(
    /View:\s*(https:\/\/testnet\.monadscan\.com\/tx\/0x[a-fA-F0-9]{64})/gi,
    (match, url) => {
      const hash = url.split('/tx/')[1];
      return `<a href="${url}" target="_blank" rel="noopener noreferrer" class="inline-flex items-center gap-1 px-2 py-1 bg-blue-600 hover:bg-blue-700 rounded text-white text-xs font-medium transition-colors">
        <span>🔗 View TX</span>
      </a>`;
    }
  );

  // Pattern 3: Find standalone transaction hashes (0x + 64 hex chars) and make clickable
  formatted = formatted.replace(
    /\b(0x[a-fA-F0-9]{64})\b/g,
    (hash) => `<a href="https://testnet.monadscan.com/tx/${hash}" target="_blank" rel="noopener noreferrer" class="underline hover:text-blue-300 transition-colors" title="View on Monadscan">${hash.slice(0, 10)}...${hash.slice(-8)}</a>`
  );

  // Convert newlines to <br> for proper HTML rendering
  formatted = formatted.replace(/\n/g, '<br>');

  return formatted;
}

export default function SimpleBotBar() {
  const router = useRouter();
  const { walletAddress } = useFarcasterContext();
  const { location } = useGeolocation(); // Get user's geolocation
  
  const [command, setCommand] = useState('');
  const [sending, setSending] = useState(false);
  const [response, setResponse] = useState('');

  const handleSend = async () => {
    if (!command.trim() || sending) return;

    const userCommand = command.trim();
    setSending(true);
    setResponse('');

    try {
      console.log('🤖 Sending command with location:', { userCommand, location });
      
      const res = await fetch('/api/bot-command', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          command: userCommand,
          userAddress: walletAddress || null,
          location: location ? {
            country: location.country,
            countryName: location.countryName,
            latitude: location.latitude,
            longitude: location.longitude,
          } : null,
        }),
      });

      if (!res.ok) {
        throw new Error(`API returned ${res.status}`);
      }

      const data = await res.json();
      console.log('🤖 Bot response:', data);

      if (data.success) {
        const message = String(data.message || 'Command processed!');
        setResponse(message);

        // Handle navigation
        if (data.action === 'navigate' && data.path) {
          console.log('🧭 Navigating to:', data.path);
          setTimeout(() => {
            router.push(data.path);
            setCommand('');
            setResponse('');
          }, 1000);
        } else if (data.action === 'transaction') {
          // Keep transaction messages visible longer
          setTimeout(() => {
            setCommand('');
            setResponse('');
          }, 10000);
        } else if (data.action === 'info') {
          // Keep help message visible longer
          setTimeout(() => {
            setCommand('');
            setResponse('');
          }, 15000);
        } else {
          // Clear after 3 seconds for other actions
          setTimeout(() => {
            setCommand('');
            setResponse('');
          }, 3000);
        }
      } else {
        // Error response from API
        const errorMessage = String(data.message || '❌ Command not recognized. Try "help"');
        setResponse(errorMessage);
        setTimeout(() => {
          setResponse('');
        }, 5000);
      }
    } catch (err: any) {
      console.error('❌ Bot error:', err);
      const errorMessage = String(err.message || '❌ Failed to process command. Try again.');
      setResponse(errorMessage);
      setTimeout(() => {
        setResponse('');
      }, 3000);
    } finally {
      setSending(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      handleSend();
    }
  };

  return (
    <div className="w-full bg-gradient-to-r from-gray-900 to-gray-800 p-4 border-t border-gray-700 shadow-lg">
      <div className="max-w-4xl mx-auto">
        <div className="flex flex-col gap-2">
          {/* Wallet Status */}
          {walletAddress && (
            <div className="text-xs text-green-400 flex items-center gap-2">
              <span className="w-2 h-2 bg-green-400 rounded-full animate-pulse"></span>
              Connected: {walletAddress.slice(0, 6)}...{walletAddress.slice(-4)}
              {location && (
                <span className="ml-2 text-blue-400">
                  📍 {location.countryName}
                </span>
              )}
            </div>
          )}
          
          {/* Input and Button Row */}
          <div className="flex gap-2">
            <input
              type="text"
              placeholder="🤖 Try: 'swap 0.5 MON', 'mint music', 'help'..."
              value={command}
              onChange={(e) => setCommand(e.target.value)}
              onKeyDown={handleKeyDown}
              className="flex-1 p-3 bg-gray-800 text-white rounded-lg border border-gray-600 focus:border-blue-500 focus:outline-none placeholder-gray-400 text-sm sm:text-base"
              disabled={sending}
              autoComplete="off"
              spellCheck="false"
            />
            <button
              onClick={handleSend}
              disabled={sending || !command.trim()}
              className="px-4 sm:px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed font-medium transition-colors min-w-[60px] flex items-center justify-center"
              aria-label="Send command"
            >
              {sending ? (
                <span className="animate-spin">⏳</span>
              ) : (
                <span>🚀</span>
              )}
            </button>
          </div>

          {/* Response Message with Clickable Links */}
          {response && (
            <div className="p-3 bg-blue-900/50 text-blue-100 rounded-lg border border-blue-700 animate-fade-in">
              <div 
                className="text-xs sm:text-sm font-mono whitespace-pre-wrap leading-relaxed bot-response"
                dangerouslySetInnerHTML={{ 
                  __html: formatResponseWithLinks(response) 
                }}
              />
            </div>
          )}
        </div>
      </div>

      <style jsx>{`
        @keyframes fade-in {
          from {
            opacity: 0;
            transform: translateY(-10px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
        .animate-fade-in {
          animation: fade-in 0.3s ease-out;
        }
        
        /* ✅ NEW: Styles for clickable links in bot responses */
        :global(.bot-response a) {
          color: #60a5fa;
          text-decoration: underline;
          cursor: pointer;
        }
        :global(.bot-response a:hover) {
          color: #93c5fd;
        }
        :global(.bot-response a:active) {
          transform: scale(0.98);
        }
      `}</style>
    </div>
  );
}
