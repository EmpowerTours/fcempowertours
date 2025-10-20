'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useFarcasterContext } from '@/app/hooks/useFarcasterContext';

export default function SmartAIAgent() {
  const router = useRouter();
  const { user, walletAddress } = useFarcasterContext();
  const [command, setCommand] = useState('');
  const [sending, setSending] = useState(false);
  const [response, setResponse] = useState('');
  const [delegationActive, setDelegationActive] = useState(false);

  useEffect(() => {
    if (walletAddress) {
      checkDelegation();
    }
  }, [walletAddress]);

  const checkDelegation = async () => {
    try {
      const res = await fetch(`/api/store-delegation?address=${walletAddress}`);
      if (res.ok) {
        const { delegation } = await res.json();
        if (delegation) {
          const config = JSON.parse(delegation as string);
          if (config.expiresAt && config.expiresAt > Date.now()) {
            setDelegationActive(true);
          }
        }
      }
    } catch (error) {
      console.error('Error checking delegation:', error);
    }
  };

  const handleSend = async () => {
    if (!command.trim()) return;

    setSending(true);
    setResponse('');

    try {
      console.log('🤖 Sending command to Gemini AI:', command);
      
      // Call /api/agent which uses GEMINI_API_KEY
      const res = await fetch('/api/agent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ command }),
      });

      if (!res.ok) {
        throw new Error(`API returned ${res.status}`);
      }

      const data = await res.json();
      console.log('🤖 Gemini AI response:', data);

      if (data.results && data.results.length > 0) {
        const result = data.results[0];
        setResponse(data.reason || 'Command processed!');

        // Handle different action types
        if (result.type === 'navigate' && result.path) {
          console.log('🧭 Navigating to:', result.path);
          setTimeout(() => {
            router.push(result.path);
            setCommand('');
            setResponse('');
          }, 1000);
        } else if (result.type === 'mint_passport' && delegationActive) {
          setResponse(`⚡ Auto-minting passport via delegation...`);
          // Execute autonomous mint
          await autonomousMint(result);
        } else if (result.type === 'setup_delegation') {
          setResponse('🔐 Setting up delegation...');
          await setupDelegation();
        } else {
          setTimeout(() => {
            setCommand('');
            setResponse('');
          }, 3000);
        }
      } else {
        setResponse('Command not recognized. Try: "mint passport", "go to profile", or "help"');
        setTimeout(() => setResponse(''), 5000);
      }
    } catch (err: any) {
      console.error('❌ AI Agent error:', err);
      setResponse(`Error: ${err.message || 'Failed to process command'}`);
      setTimeout(() => setResponse(''), 3000);
    } finally {
      setSending(false);
    }
  };

  const autonomousMint = async (result: any) => {
    try {
      const endpoint = '/api/mint-passport';
      const mintRes = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          recipient: walletAddress,
          fid: user?.fid,
          userAddress: walletAddress,
          ...result.params,
          delegated: true,
        }),
      });

      if (!mintRes.ok) throw new Error('Mint failed');

      const { txHash, tokenId } = await mintRes.json();
      setResponse(`✅ Passport #${tokenId} minted autonomously! TX: ${txHash.slice(0, 10)}...`);
      
      setTimeout(() => {
        setCommand('');
        setResponse('');
      }, 5000);
    } catch (error: any) {
      setResponse(`❌ Autonomous mint failed: ${error.message}`);
      setTimeout(() => setResponse(''), 3000);
    }
  };

  const setupDelegation = async () => {
    try {
      const config = {
        spendingLimit: '1.0',
        maxMints: 10,
        durationHours: 24,
        autoMintEnabled: true,
        createdAt: Date.now(),
        expiresAt: Date.now() + (24 * 60 * 60 * 1000),
      };

      const res = await fetch('/api/store-delegation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userAddress: walletAddress,
          delegation: config,
          config,
        }),
      });

      if (!res.ok) throw new Error('Delegation setup failed');

      setDelegationActive(true);
      setResponse('✅ Delegation active! Try: "mint passport for France"');
      
      setTimeout(() => {
        setCommand('');
        setResponse('');
      }, 5000);
    } catch (error: any) {
      setResponse(`❌ Delegation failed: ${error.message}`);
      setTimeout(() => setResponse(''), 3000);
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
              placeholder={
                delegationActive 
                  ? '🤖 AI Agent Active - Try: "mint passport for France", "go to profile"'
                  : '🤖 AI Agent - Try: "enable delegation", "mint passport", "help"'
              }
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
              {sending ? '⏳' : delegationActive ? '⚡' : '🚀'}
            </button>
            {delegationActive && (
              <div className="flex items-center px-4 py-3 bg-green-500/20 border border-green-500 rounded-lg">
                <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse mr-2"></div>
                <span className="text-green-400 text-sm font-medium">AI Active</span>
              </div>
            )}
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
