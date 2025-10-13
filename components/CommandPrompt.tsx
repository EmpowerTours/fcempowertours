'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { sdk } from '@farcaster/miniapp-sdk';
import { useAccount } from 'wagmi';
import { GoogleGenerativeAI } from '@google/generative-ai';

export default function CommandPrompt() {
  const router = useRouter();
  const { address, isConnected } = useAccount();
  const [prompt, setPrompt] = useState('');
  const [processingPrompt, setProcessingPrompt] = useState(false);
  const [frameUrl, setFrameUrl] = useState<string | null>(null);

  const handlePromptSubmit = async () => {
    if (!prompt.trim()) return;
    setProcessingPrompt(true);
    try {
      const lowerPrompt = prompt.toLowerCase();
      if (lowerPrompt.includes('nft') || lowerPrompt.includes('music')) {
        router.push('/music');
        return;
      } else if (lowerPrompt.includes('passport')) {
        router.push('/passport');
        return;
      } else if (lowerPrompt.includes('market') || lowerPrompt.includes('itinerary')) {
        router.push('/market');
        return;
      } else if (lowerPrompt.includes('profile')) {
        router.push('/profile');
        return;
      } else if (lowerPrompt.includes('admin')) {
        router.push('/admin');
        return;
      } else if (lowerPrompt.includes('pay') || lowerPrompt.includes('buy') || lowerPrompt.includes('transaction')) {
        if (!address || !isConnected) {
          alert('Please connect your wallet to create a transaction.');
          return;
        }
        const frameRes = await fetch('/api/farcaster/create-frame', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            prompt,
            address,
            fid: (await sdk.context)?.user?.fid?.toString() || '1',
          }),
        });
        if (!frameRes.ok) throw new Error(`Failed to create transaction Frame: ${frameRes.statusText}`);
        const { frameUrl: createdFrameUrl } = await frameRes.json();
        setFrameUrl(createdFrameUrl);
        alert(`Transaction Frame created! Cast it on Warpcast: ${String(createdFrameUrl)}`);
        return;
      } else if (lowerPrompt.includes('swap') || lowerPrompt.includes('buy') || lowerPrompt.includes('mint')) {
        if (!address || !isConnected) {
          alert('Connect wallet for transactions.');
          return;
        }
        const context = await sdk.context;
        const fid = context?.user?.fid || 1;
        const mockCast = { fid, text: prompt, hash: 'mock-' + Date.now(), replies: { to_fid: Number(process.env.BOT_FID) } };
        const botRes = await fetch('/api/webhooks/farcaster', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ data: mockCast }),
        });
        if (botRes.ok) {
          const { txHash } = await botRes.json();
          alert(`Bot executed: ${prompt}! Tx: ${String(txHash)} (Cast posted)`);
        } else {
          alert('Bot error; fallback to manual.');
        }
        return;
      }
      if (!process.env.GEMINI_API_KEY) {
        console.error('Gemini API key is not defined');
        alert('Command processing unavailable. Try basic commands like "take me to nft" or "go to profile".');
        return;
      }
      const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
      const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });
      const aiPrompt = `
        Analyze this user command for an EmpowerTours app: "${prompt}".
        Output JSON ONLY, no extra text:
        {
          "actions": [{ "type": "navigate", "path": "/music" | "/passport" | "/market" | "/profile" | "none" }],
          "reason": "Brief explanation"
        }
      `;
      const result = await model.generateContent({
        contents: [{ role: 'user', parts: [{ text: aiPrompt }] }],
        generationConfig: { maxOutputTokens: 256 },
      });
      let actions: { type: string; path: string }[] = [];
      try {
        const rawText = result.response.text().trim();
        const jsonMatch = rawText.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          const responseJson = JSON.parse(jsonMatch[0]);
          actions = responseJson.actions || [];
        }
      } catch (err) {
        console.warn('Failed to parse Gemini response as JSON:', err);
      }
      if (actions.length > 0 && actions[0].path !== 'none') {
        actions.forEach((action) => {
          if (action.type === 'navigate') router.push(action.path);
        });
      } else {
        alert('Sorry, I didn\'t understand. Try "take me to nft", "go to passport", or "go to profile".');
      }
    } catch (error) {
      console.error('Prompt processing failed:', error);
      alert(`Error processing command: ${String((error as Error).message)}. Try basic commands like "take me to nft".`);
    } finally {
      setProcessingPrompt(false);
      setPrompt('');
    }
  };

  return (
    <div className="w-full max-w-2xl p-4">
      <div className="flex space-x-2">
        <input
          type="text"
          placeholder="Type command e.g., 'take me to nft' or 'take me to profile'"
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handlePromptSubmit()}
          className="w-full p-2 border rounded"
          disabled={processingPrompt}
        />
        <button
          onClick={handlePromptSubmit}
          disabled={processingPrompt}
          className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
        >
          {processingPrompt ? 'Processing...' : 'Send'}
        </button>
      </div>
      {frameUrl && (
        <p className="mt-2">
          Transaction Frame: <a href={frameUrl} target="_blank" rel="noopener noreferrer">{String(frameUrl)}</a>
        </p>
      )}
    </div>
  );
}
