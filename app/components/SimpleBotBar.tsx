'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useFarcasterContext } from '@/app/hooks/useFarcasterContext';
import { useGeolocation } from '@/lib/useGeolocation';

// ✅ IMPROVED: Parse response and render with React components instead of innerHTML
interface ParsedResponse {
  parts: Array<{
    type: 'text' | 'txlink';
    content: string;
    url?: string;
    shortHash?: string;
  }>;
}

function parseResponse(text: string): ParsedResponse {
  const parts: ParsedResponse['parts'] = [];
  const lines = text.split('\n');
  
  for (const line of lines) {
    // Check if line contains a transaction hash pattern
    const txMatch = line.match(/TX:\s*(0x[a-fA-F0-9]{64})/i);
    const viewMatch = line.match(/View:\s*(https:\/\/testnet\.monadscan\.com\/tx\/(0x[a-fA-F0-9]{64}))/i);
    
    if (txMatch) {
      const fullHash = txMatch[1];
      const beforeTx = line.substring(0, txMatch.index);
      const afterTx = line.substring(txMatch.index! + txMatch[0].length);
      
      // Add text before TX
      if (beforeTx) {
        parts.push({ type: 'text', content: beforeTx });
      }
      
      // Add clickable TX link
      parts.push({
        type: 'txlink',
        content: `TX: ${fullHash.slice(0, 10)}...${fullHash.slice(-8)}`,
        url: `https://testnet.monadscan.com/tx/${fullHash}`,
        shortHash: `${fullHash.slice(0, 10)}...${fullHash.slice(-8)}`
      });
      
      // Add text after TX
      if (afterTx) {
        parts.push({ type: 'text', content: afterTx });
      }
      
      // Add line break
      parts.push({ type: 'text', content: '\n' });
      
    } else if (viewMatch) {
      const url = viewMatch[1];
      const fullHash = viewMatch[2];
      const beforeView = line.substring(0, viewMatch.index);
      const afterView = line.substring(viewMatch.index! + viewMatch[0].length);
      
      // Add text before View
      if (beforeView) {
        parts.push({ type: 'text', content: beforeView });
      }
      
      // Add clickable View link
      parts.push({
        type: 'txlink',
        content: '🔗 View on Monadscan',
        url: url,
        shortHash: `${fullHash.slice(0, 10)}...${fullHash.slice(-8)}`
      });
      
      // Add text after View
      if (afterView) {
        parts.push({ type: 'text', content: afterView });
      }
      
      // Add line break
      parts.push({ type: 'text', content: '\n' });
      
    } else {
      // Regular text line
      parts.push({ type: 'text', content: line + '\n' });
    }
  }
  
  return { parts };
}

export default function SimpleBotBar() {
  const router = useRouter();
  const { walletAddress } = useFarcasterContext();
  const { location } = useGeolocation();
  
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
          setTimeout(() => {
            setCommand('');
            setResponse('');
          }, 10000);
        } else if (data.action === 'info') {
          setTimeout(() => {
            setCommand('');
            setResponse('');
          }, 15000);
        } else {
          setTimeout(() => {
            setCommand('');
            setResponse('');
          }, 3000);
        }
      } else {
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

  // ✅ Render parsed response with React components
  const renderResponse = () => {
    if (!response) return null;
    
    const parsed = parseResponse(response);
    
    return (
      <div className="p-3 bg-blue-900/50 text-blue-100 rounded-lg border border-blue-700 animate-fade-in">
        <div className="text-xs sm:text-sm font-mono leading-relaxed">
          {parsed.parts.map((part, index) => {
            if (part.type === 'txlink') {
              return (
                <a
                  key={index}
                  href={part.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 px-2 py-1 bg-blue-600 hover:bg-blue-700 rounded text-white text-xs font-medium transition-colors mx-1"
                  title={part.shortHash}
                >
                  {part.content}
                </a>
              );
            } else {
              // Regular text - preserve newlines
              return (
                <span key={index} className="whitespace-pre-wrap">
                  {part.content}
                </span>
              );
            }
          })}
        </div>
      </div>
    );
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
          {renderResponse()}
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
      `}</style>
    </div>
  );
}
