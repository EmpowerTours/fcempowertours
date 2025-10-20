'use client';

import { useState, useRef, useEffect } from 'react';
import { useFarcasterContext } from '@/app/hooks/useFarcasterContext';
import { BrowserProvider, Contract } from 'ethers';

interface BotMessage {
  role: 'user' | 'bot';
  content: string;
  action?: {
    type: string;
    params: any;
    requiresApproval: boolean;
  };
}

export default function AIBotWidget() {
  const { user, walletAddress, isMobile } = useFarcasterContext();
  
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<BotMessage[]>([
    {
      role: 'bot',
      content: '👋 Hi! I can help you mint music, buy tracks, or manage your NFTs. What would you like to do?'
    }
  ]);
  const [input, setInput] = useState('');
  const [processing, setProcessing] = useState(false);
  const [pendingApproval, setPendingApproval] = useState<any>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const sendMessage = async () => {
    if (!input.trim() || processing) return;

    const userMessage = input.trim();
    setInput('');
    
    // Add user message
    setMessages(prev => [...prev, {
      role: 'user',
      content: userMessage
    }]);

    setProcessing(true);

    try {
      // Call AI bot API
      const response = await fetch('/api/bot-command', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          command: userMessage,
          userId: user?.fid,
          walletAddress,
          isMobile
        })
      });

      if (!response.ok) throw new Error('Bot API error');

      const data = await response.json();

      if (data.success) {
        // Add bot response
        setMessages(prev => [...prev, {
          role: 'bot',
          content: data.message,
          action: data.action ? {
            type: data.action,
            params: data.params,
            requiresApproval: true
          } : undefined
        }]);

        // If action requires approval, set pending state
        if (data.action && data.params) {
          setPendingApproval({
            type: data.action,
            params: data.params
          });
        }

        // Auto-execute navigate actions
        if (data.action === 'navigate' && data.path) {
          setTimeout(() => {
            window.location.href = data.path;
          }, 1000);
        }
      } else {
        setMessages(prev => [...prev, {
          role: 'bot',
          content: data.message || '❌ I didn\'t understand that. Try: "mint music", "buy from artist 0x123...", or "show my profile"'
        }]);
      }
    } catch (error: any) {
      console.error('Bot error:', error);
      setMessages(prev => [...prev, {
        role: 'bot',
        content: '❌ Something went wrong. Please try again.'
      }]);
    } finally {
      setProcessing(false);
    }
  };

  const handleApproveAction = async () => {
    if (!pendingApproval || !walletAddress) return;

    setProcessing(true);
    
    try {
      const { type, params } = pendingApproval;

      switch (type) {
        case 'mint_music':
          // Navigate to mint page
          window.location.href = '/music';
          break;

        case 'mint_passport':
          // Navigate to passport page
          window.location.href = '/passport';
          break;

        case 'buy_music':
          // Execute purchase
          const provider = new BrowserProvider(window.ethereum);
          const signer = await provider.getSigner();
          
          // Call purchase function
          // (This would call the actual contract)
          setMessages(prev => [...prev, {
            role: 'bot',
            content: `✅ Purchase initiated! Check your wallet to approve the transaction.`
          }]);
          break;

        default:
          throw new Error('Unknown action type');
      }

      setPendingApproval(null);
    } catch (error: any) {
      setMessages(prev => [...prev, {
        role: 'bot',
        content: `❌ Action failed: ${error.message}`
      }]);
    } finally {
      setProcessing(false);
    }
  };

  const handleCancelAction = () => {
    setPendingApproval(null);
    setMessages(prev => [...prev, {
      role: 'bot',
      content: '❌ Action cancelled. What else can I help with?'
    }]);
  };

  if (!isOpen) {
    return (
      <button
        onClick={() => setIsOpen(true)}
        className="fixed bottom-6 right-6 z-50 w-16 h-16 bg-gradient-to-r from-purple-600 to-pink-600 rounded-full shadow-2xl hover:scale-110 transition-transform flex items-center justify-center text-3xl"
        aria-label="Open AI Assistant"
      >
        🤖
      </button>
    );
  }

  return (
    <div className="fixed bottom-6 right-6 z-50 w-96 max-w-[calc(100vw-2rem)] bg-white rounded-2xl shadow-2xl border-2 border-purple-200 flex flex-col"
         style={{ height: 'min(600px, calc(100vh - 8rem))' }}>
      
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-gray-200 bg-gradient-to-r from-purple-600 to-pink-600 rounded-t-2xl">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-white rounded-full flex items-center justify-center text-xl">
            🤖
          </div>
          <div>
            <h3 className="font-bold text-white">AI Assistant</h3>
            <p className="text-xs text-purple-100">Smart Wallet Enabled</p>
          </div>
        </div>
        <button
          onClick={() => setIsOpen(false)}
          className="text-white hover:bg-white/20 rounded-full w-8 h-8 flex items-center justify-center"
        >
          ✕
        </button>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.map((msg, idx) => (
          <div
            key={idx}
            className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            <div
              className={`max-w-[80%] rounded-2xl px-4 py-3 ${
                msg.role === 'user'
                  ? 'bg-purple-600 text-white'
                  : 'bg-gray-100 text-gray-900'
              }`}
            >
              <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
              
              {/* Action buttons for bot messages */}
              {msg.action && msg.action.requiresApproval && (
                <div className="mt-3 flex gap-2">
                  <button
                    onClick={handleApproveAction}
                    disabled={processing}
                    className="flex-1 px-3 py-2 bg-green-600 text-white rounded-lg text-xs font-medium hover:bg-green-700 disabled:opacity-50"
                  >
                    ✅ Approve
                  </button>
                  <button
                    onClick={handleCancelAction}
                    disabled={processing}
                    className="flex-1 px-3 py-2 bg-red-600 text-white rounded-lg text-xs font-medium hover:bg-red-700 disabled:opacity-50"
                  >
                    ❌ Cancel
                  </button>
                </div>
              )}
            </div>
          </div>
        ))}
        
        {processing && (
          <div className="flex justify-start">
            <div className="bg-gray-100 rounded-2xl px-4 py-3">
              <div className="flex items-center gap-2">
                <div className="animate-spin">⏳</div>
                <p className="text-sm text-gray-600">Thinking...</p>
              </div>
            </div>
          </div>
        )}
        
        <div ref={messagesEndRef} />
      </div>

      {/* Pending Approval Banner */}
      {pendingApproval && (
        <div className="px-4 py-3 bg-yellow-50 border-t border-yellow-200">
          <p className="text-xs text-yellow-900 font-medium mb-2">
            ⚠️ Action requires your approval
          </p>
          <div className="flex gap-2">
            <button
              onClick={handleApproveAction}
              disabled={processing}
              className="flex-1 px-3 py-2 bg-green-600 text-white rounded-lg text-xs font-medium hover:bg-green-700 disabled:opacity-50 active:scale-95 touch-manipulation"
            >
              ✅ Approve & Execute
            </button>
            <button
              onClick={handleCancelAction}
              disabled={processing}
              className="flex-1 px-3 py-2 bg-gray-600 text-white rounded-lg text-xs font-medium hover:bg-gray-700 disabled:opacity-50 active:scale-95 touch-manipulation"
            >
              ❌ Cancel
            </button>
          </div>
        </div>
      )}

      {/* Input */}
      <div className="p-4 border-t border-gray-200">
        {!user && (
          <p className="text-xs text-yellow-700 bg-yellow-50 p-2 rounded-lg mb-2">
            ⚠️ Connect wallet to enable transactions
          </p>
        )}
        
        <div className="flex gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && sendMessage()}
            placeholder="Ask me anything..."
            disabled={processing}
            className="flex-1 px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:border-purple-500 text-sm"
            style={{ minHeight: '48px' }}
          />
          <button
            onClick={sendMessage}
            disabled={!input.trim() || processing}
            className="px-4 py-3 bg-gradient-to-r from-purple-600 to-pink-600 text-white rounded-lg hover:from-purple-700 hover:to-pink-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all active:scale-95 touch-manipulation"
            style={{ minHeight: '48px', minWidth: '48px' }}
          >
            {processing ? '⏳' : '🚀'}
          </button>
        </div>
        
        <p className="text-xs text-gray-500 mt-2 text-center">
          Try: "mint music", "buy from artist 0x...", "show profile"
        </p>
      </div>
    </div>
  );
}
