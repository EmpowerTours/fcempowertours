'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { useFarcasterContext } from '@/app/hooks/useFarcasterContext';
import { useBotCommand } from '@/app/hooks/useBotCommand';
import { useGeolocation } from '@/lib/useGeolocation';
import { DotsLoader } from '@/app/components/animations/AnimatedLoader';

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

  // ✅ USE THE HOOK
  const { executeCommand, loading: sending, error: hookError } = useBotCommand();

  const [command, setCommand] = useState('');
  const [response, setResponse] = useState('');
  const [error, setError] = useState('');

  const handleSend = async () => {
    if (!command.trim() || sending) return;

    const userCommand = command.trim();
    setError('');
    setResponse('');

    try {
      console.log('🤖 Sending command with location:', { userCommand, location });

      // ✅ USE THE HOOK INSTEAD OF FETCH
      const data = await executeCommand(userCommand, {
        location: location ? {
          latitude: location.latitude,
          longitude: location.longitude,
        } : undefined
      });

      console.log('🤖 Bot response:', data);

      if (data.success) {
        const message = String(data.message || 'Command processed!');
        setResponse(message);

        // Handle navigation
        // ✅ FIXED: Capture path in variable to maintain type safety
        if (data.action === 'navigate' && data.path) {
          const navigationPath = data.path;  // ✅ Capture path here
          console.log('🧭 Navigating to:', navigationPath);
          setTimeout(() => {
            router.push(navigationPath);  // ✅ Use captured variable - always defined
            setCommand('');
            setResponse('');
          }, 1000);
        } else if (data.action === 'redirect' && data.url) {
          // ✅ Handle redirect action (e.g., for send MON page)
          // Extract path from full URL if it's our app URL
          let redirectPath = data.url;
          if (data.url.startsWith('http')) {
            try {
              const urlObj = new URL(data.url);
              redirectPath = urlObj.pathname + urlObj.search; // Get /path?params
            } catch (e) {
              console.error('Failed to parse redirect URL:', e);
            }
          }
          console.log('🔗 Redirecting to:', redirectPath);
          setTimeout(() => {
            router.push(redirectPath);  // Navigate inside mini-app
            setCommand('');
            setResponse('');
          }, 1500);
        } else if (data.action === 'open_url' && data.url) {
          // ✅ Handle open_url action (e.g., for approve gasless page)
          // Extract path from full URL if it's our app URL
          let urlPath = data.url;
          if (data.url.startsWith('http')) {
            try {
              const urlObj = new URL(data.url);
              urlPath = urlObj.pathname + urlObj.search; // Get /path?params
            } catch (e) {
              console.error('Failed to parse open_url URL:', e);
            }
          }
          console.log('🔗 Opening URL:', urlPath);
          setTimeout(() => {
            router.push(urlPath);  // Navigate inside mini-app
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
        const errorMessage = String(data.error || data.message || '❌ Command not recognized. Try "help"');
        setError(errorMessage);
        setTimeout(() => {
          setError('');
        }, 5000);
      }
    } catch (err: any) {
      console.error('❌ Bot error:', err);
      const errorMessage = String(err.message || '❌ Failed to process command. Try again.');
      setError(errorMessage);
      setTimeout(() => {
        setError('');
      }, 3000);
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
      <motion.div
        initial={{ opacity: 0, y: -10, scale: 0.95 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 10, scale: 0.95 }}
        transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
        className="p-3 bg-gradient-to-r from-blue-900/50 to-purple-900/50 text-blue-100 rounded-lg border border-blue-700 shadow-lg backdrop-blur-sm"
      >
        <motion.div
          className="text-xs sm:text-sm font-mono leading-relaxed"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.1 }}
        >
          {parsed.parts.map((part, index) => {
            if (part.type === 'txlink') {
              return (
                <motion.a
                  key={index}
                  href={part.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 px-2 py-1 bg-blue-600 hover:bg-blue-700 rounded text-white text-xs font-medium transition-colors mx-1"
                  title={part.shortHash}
                  whileHover={{ scale: 1.05, y: -2 }}
                  whileTap={{ scale: 0.95 }}
                  initial={{ opacity: 0, scale: 0 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: index * 0.05 }}
                >
                  {part.content}
                </motion.a>
              );
            } else {
              // Regular text - preserve newlines
              return (
                <motion.span
                  key={index}
                  className="whitespace-pre-wrap"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: index * 0.02 }}
                >
                  {part.content}
                </motion.span>
              );
            }
          })}
        </motion.div>
      </motion.div>
    );
  };

  const renderError = () => {
    const errorMsg = error || hookError;
    if (!errorMsg) return null;

    return (
      <motion.div
        initial={{ opacity: 0, y: -10, scale: 0.95 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 10, scale: 0.95 }}
        transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
        className="p-3 bg-gradient-to-r from-red-900/50 to-pink-900/50 text-red-100 rounded-lg border border-red-700 shadow-lg backdrop-blur-sm"
      >
        <motion.div
          className="text-xs sm:text-sm font-mono flex items-center gap-2"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.1 }}
        >
          <motion.span
            animate={{ rotate: [0, 10, -10, 0] }}
            transition={{ duration: 0.5, repeat: 2 }}
          >
            ⚠️
          </motion.span>
          {errorMsg}
        </motion.div>
      </motion.div>
    );
  };

  return (
    <motion.div
      className="w-full bg-gradient-to-r from-gray-900 via-purple-900/20 to-gray-800 p-4 border-t border-gray-700 shadow-2xl backdrop-blur-lg"
      initial={{ y: 100, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.5, delay: 0.2 }}
    >
      <div className="max-w-4xl mx-auto">
        <div className="flex flex-col gap-2">
          {/* Wallet Status */}
          <AnimatePresence>
            {walletAddress && (
              <motion.div
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="text-xs text-green-400 flex items-center gap-2 bg-green-900/20 rounded-full px-3 py-1 w-fit"
              >
                <motion.span
                  className="w-2 h-2 bg-green-400 rounded-full"
                  animate={{
                    scale: [1, 1.2, 1],
                    opacity: [1, 0.7, 1]
                  }}
                  transition={{
                    duration: 2,
                    repeat: Infinity,
                    ease: 'easeInOut'
                  }}
                />
                Connected: {walletAddress.slice(0, 6)}...{walletAddress.slice(-4)}
                {location && (
                  <motion.span
                    className="ml-2 text-blue-400"
                    initial={{ opacity: 0, scale: 0 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ delay: 0.3 }}
                  >
                    📍 {location.countryName}
                  </motion.span>
                )}
              </motion.div>
            )}
          </AnimatePresence>

          {/* Input and Button Row */}
          <div className="flex gap-2">
            <motion.input
              type="text"
              placeholder="🤖 Try: 'swap 0.5 MON', 'mint music', 'help'..."
              value={command}
              onChange={(e) => setCommand(e.target.value)}
              onKeyDown={handleKeyDown}
              className="flex-1 p-3 bg-gray-800/80 text-white rounded-lg border border-gray-600 focus:border-blue-500 focus:outline-none placeholder-gray-400 text-sm sm:text-base backdrop-blur-sm transition-all"
              disabled={sending}
              autoComplete="off"
              spellCheck="false"
              whileFocus={{
                scale: 1.01,
                borderColor: '#3b82f6',
                boxShadow: '0 0 0 3px rgba(59, 130, 246, 0.1)'
              }}
            />
            <motion.button
              onClick={handleSend}
              disabled={sending || !command.trim()}
              className="px-4 sm:px-6 py-3 bg-gradient-to-r from-blue-600 to-purple-600 text-white rounded-lg hover:from-blue-700 hover:to-purple-700 disabled:opacity-50 disabled:cursor-not-allowed font-medium transition-all min-w-[60px] flex items-center justify-center shadow-lg"
              aria-label="Send command"
              whileHover={{ scale: 1.05, y: -2 }}
              whileTap={{ scale: 0.95 }}
            >
              <AnimatePresence mode="wait">
                {sending ? (
                  <motion.div
                    key="loading"
                    initial={{ opacity: 0, scale: 0 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0 }}
                  >
                    <DotsLoader />
                  </motion.div>
                ) : (
                  <motion.span
                    key="send"
                    initial={{ opacity: 0, scale: 0 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0 }}
                  >
                    🚀
                  </motion.span>
                )}
              </AnimatePresence>
            </motion.button>
          </div>

          {/* Error Message */}
          <AnimatePresence>
            {renderError()}
          </AnimatePresence>

          {/* Response Message with Clickable Links */}
          <AnimatePresence>
            {renderResponse()}
          </AnimatePresence>
        </div>
      </div>
    </motion.div>
  );
}
