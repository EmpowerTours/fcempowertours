'use client';
import { useState } from 'react';

export default function ClientBotFrame() {
  const [command, setCommand] = useState('');
  const [sending, setSending] = useState(false);

  const handleSend = async () => {
    if (!command.trim()) return;
    setSending(true);
    try {
      console.log('ClientBotFrame: Sending command', String(command));
      const res = await fetch('/api/bot-command', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ command }),
      });
      if (!res.ok) throw new Error('Failed to send command');
      const { response } = await res.json();
      alert(String(response || 'Command sent!'));
      setCommand('');
    } catch (err) {
      console.error('ClientBotFrame: Bot error:', String(err));
      alert('Failed to send command. Try again.');
    } finally {
      setSending(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') handleSend();
  };

  console.log('ClientBotFrame: Rendering bot frame', { command: String(command), sending });
  return (
    <div className="w-full bg-black/50 p-4 border-t border-gray-800">
      <div className="flex gap-2">
        <input
          type="text"
          placeholder="Ask the AI bot or send Farcaster command..."
          value={String(command)}
          onChange={(e) => setCommand(e.target.value)}
          onKeyDown={handleKeyDown}
          className="flex-1 p-2 bg-gray-800 text-white rounded"
          disabled={sending}
        />
        <button
          onClick={handleSend}
          disabled={sending || !command.trim()}
          className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
        >
          {sending ? 'Sending...' : 'Send'}
        </button>
      </div>
    </div>
  );
}
