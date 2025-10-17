'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function ClientBotFrame() {
  const [command, setCommand] = useState('');
  const [sending, setSending] = useState(false);
  const [response, setResponse] = useState('');
  const router = useRouter();

  const handleSend = async () => {
    if (!command.trim()) return;

    setSending(true);
    setResponse('');

    try {
      console.log('🤖 Sending command:', command);
      const res = await fetch('/api/bot-command', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ command }),
      });

      if (!res.ok) {
        throw new Error(`API returned ${res.status}`);
      }

      const data = await res.json();
      console.log('🤖 Bot response:', data);

      if (data.success) {
        const message = String(data.message || 'Command processed!');
        setResponse(message);

        if (data.action === 'navigate' && data.path) {
          console.log('🧭 Navigating to:', data.path);
          setTimeout(() => {
            router.push(data.path);
            setCommand('');
            setResponse('');
          }, 1000);
        } else if (data.action === 'info') {
          setTimeout(() => {
            setResponse('');
          }, 8000);
        } else {
          setTimeout(() => {
            setCommand('');
            setResponse('');
          }, 3000);
        }
      } else {
        const errorMessage = String(data.message || 'Command not recognized');
        setResponse(errorMessage);
        setTimeout(() => {
          setResponse('');
        }, 5000);
      }
    } catch (err: any) {
      console.error('❌ Bot error:', err);
      const errorMessage = String(err.message || 'Failed to send command. Try again.');
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
          <div className="flex gap-2">
            <input
              type="text"
              placeholder="🤖 Ask AI: 'mint passport', 'swap tokens', 'help'..."
              value={command}
              onChange={(e) => setCommand(e.target.value)}
              onKeyDown={handleKeyDown}
              className="flex-1 p-3 bg-gray-800 text-white rounded-lg border border-gray-600 focus:border-blue-500 focus:outline-none placeholder-gray-400"
              disabled={sending}
            />
            <button
              onClick={handleSend}
              disabled={sending || !command.trim()}
              className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed font-medium transition-colors"
            >
              {sending ? '⏳' : '🚀'}
            </button>
          </div>

          {response && (
            <div className="p-3 bg-blue-900/50 text-blue-100 rounded-lg border border-blue-700 animate-fade-in">
              <p className="text-sm font-mono">{response}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
