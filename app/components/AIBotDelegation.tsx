'use client';

import { useState, useRef } from 'react';
import { usePrivy } from '@privy-io/react-auth';
import { setupMusicMintingDelegation } from '@/lib/pimlico/delegation';
import { createUserSmartAccount } from '@/lib/pimlico/smartAccount';

export default function AIBotDelegation() {
  const { user } = usePrivy();
  const [isOpen, setIsOpen] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [command, setCommand] = useState('');
  const [processing, setProcessing] = useState(false);
  const [delegationStatus, setDelegationStatus] = useState<any>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const videoChunksRef = useRef<Blob[]>([]);

  const handleCommand = async () => {
    if (!command.trim()) return;
    
    setProcessing(true);
    try {
      // Process command with AI
      const response = await fetch('/api/ai-bot-command', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          command,
          userId: user?.id,
          fid: user?.farcaster?.fid
        })
      });

      const result = await response.json();
      
      if (result.action === 'SETUP_DELEGATION') {
        // Create smart account and setup delegation
        const privateKey = localStorage.getItem('userPrivateKey'); // Or from your wallet
        if (privateKey) {
          const { smartAccountClient } = await createUserSmartAccount(privateKey as `0x${string}`);
          
          const delegation = await setupMusicMintingDelegation(
            smartAccountClient,
            user?.wallet?.address as `0x${string}`,
            result.params
          );
          
          setDelegationStatus({
            active: true,
            ...result.params
          });
          
          alert('✅ Delegation setup complete! You can now mint automatically.');
        }
      }
      
      setCommand('');
    } catch (error) {
      console.error('Command processing error:', error);
      alert('Failed to process command');
    } finally {
      setProcessing(false);
    }
  };

  const startVideoRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ 
        video: true, 
        audio: true 
      });
      
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      videoChunksRef.current = [];
      
      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          videoChunksRef.current.push(event.data);
        }
      };
      
      mediaRecorder.onstop = async () => {
        const videoBlob = new Blob(videoChunksRef.current, { 
          type: 'video/webm' 
        });
        
        // Process video command
        const formData = new FormData();
        formData.append('video', videoBlob);
        formData.append('userId', user?.id || '');
        
        // Upload and process
        await fetch('/api/process-video-command', {
          method: 'POST',
          body: formData
        });
        
        stream.getTracks().forEach(track => track.stop());
      };
      
      mediaRecorder.start();
      setIsRecording(true);
    } catch (error) {
      console.error('Failed to start recording:', error);
    }
  };

  const stopVideoRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }
  };

  return (
    <>
      {/* Toggle Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="fixed bottom-24 right-4 z-50 p-4 bg-purple-600 rounded-full shadow-lg hover:bg-purple-700 transition-all"
      >
        🤖 AI Delegate
      </button>

      {/* Command Interface */}
      {isOpen && (
        <div className="fixed bottom-40 right-4 z-50 bg-gray-900 border border-purple-500 rounded-lg p-6 w-96 shadow-2xl">
          <h3 className="text-white font-bold mb-4">AI Delegation Assistant</h3>
          
          {delegationStatus && (
            <div className="mb-4 p-3 bg-green-900/50 rounded-lg border border-green-500">
              <p className="text-green-300 text-sm">
                ✅ Active Delegation
              </p>
              <p className="text-gray-300 text-xs mt-1">
                Limit: {delegationStatus.spendingLimit} ETH | 
                Mints: {delegationStatus.maxMints} | 
                Duration: {delegationStatus.durationHours}h
              </p>
            </div>
          )}

          <div className="space-y-3">
            <input
              type="text"
              value={command}
              onChange={(e) => setCommand(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleCommand()}
              placeholder="e.g. 'set 0.5 eth limit for 10 mints'"
              className="w-full p-3 bg-gray-800 text-white rounded-lg border border-gray-700 focus:border-purple-500 focus:outline-none"
              disabled={processing}
            />
            
            <div className="flex gap-2">
              <button
                onClick={handleCommand}
                disabled={processing}
                className="flex-1 p-3 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50"
              >
                {processing ? '⏳ Processing...' : '🚀 Execute'}
              </button>
              
              <button
                onClick={isRecording ? stopVideoRecording : startVideoRecording}
                className={`p-3 rounded-lg ${
                  isRecording 
                    ? 'bg-red-500 hover:bg-red-600' 
                    : 'bg-blue-600 hover:bg-blue-700'
                } text-white`}
              >
                {isRecording ? '⏹️' : '🎥'}
              </button>
            </div>
          </div>

          <div className="mt-4 text-gray-400 text-xs">
            <p>Commands:</p>
            <ul className="mt-1 space-y-1">
              <li>• "set spending limit 1 eth"</li>
              <li>• "delegate 0.5 eth for 5 mints"</li>
              <li>• "enable auto minting"</li>
              <li>• "share this moment"</li>
            </ul>
          </div>
        </div>
      )}
    </>
  );
}
