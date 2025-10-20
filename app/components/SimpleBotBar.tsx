'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function SimpleBotBar() {
  const router = useRouter();
  const [command, setCommand] = useState('');
  const [sending, setSending] = useState(false);
  const [response, setResponse] = useState('');

  const handleSend = async () => {
    if (!command.trim() || sending) return;

    const userCommand = command.trim();
    setSending(true);
    setResponse('');

    try {
      console.log('🤖 Sending command:', userCommand);
      
      const res = await fetch('/api/bot-command', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ command: userCommand }),
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
        } else if (data.action === 'info') {
          // Keep help message visible longer
          setTimeout(() => {
            setCommand('');
            setResponse('');
          }, 10000);
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
          {/* Input and Button Row */}
          <div className="flex gap-2">
            <input
              type="text"
              placeholder="🤖 Ask AI: 'passport', 'music', 'market', 'help'..."
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

          {/* Response Message */}
          {response && (
            <div className="p-3 bg-blue-900/50 text-blue-100 rounded-lg border border-blue-700 animate-fade-in">
              <p className="text-xs sm:text-sm font-mono whitespace-pre-wrap leading-relaxed">
                {response}
              </p>
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
        @keyframes spin {
          from {
            transform: rotate(0deg);
          }
          to {
            transform: rotate(360deg);
          }
        }
        .animate-spin {
          display: inline-block;
          animation: spin 1s linear infinite;
        }
      `}</style>
    </div>
  );
}
