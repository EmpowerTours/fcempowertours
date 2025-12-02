'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useFarcasterContext } from '@/app/hooks/useFarcasterContext';
import PageTransition from '@/app/components/animations/PageTransition';
import { parseEther, formatEther } from 'viem';

// Quiz questions with exact scoring from spec
const QUIZ_QUESTIONS = [
  {
    id: 1,
    question: "You open Farcaster first thing in the morning. What hits you first?",
    answers: [
      { text: "Overwhelming noise, need coffee", score: -8 },
      { text: "Vibes and aesthetics", score: 4 },
      { text: "Patterns and signal immediately", score: 12 }
    ]
  },
  {
    id: 2,
    question: "When someone ratio'd you, you secretly feel:",
    answers: [
      { text: "Crushed for days", score: -10 },
      { text: "Annoyed but laugh", score: 6 },
      { text: "Instantly analyze why and improve", score: 14 }
    ]
  },
  {
    id: 3,
    question: "Your dreams are usually:",
    answers: [
      { text: "I don't remember them", score: -12 },
      { text: "Wild and emotional", score: 5 },
      { text: "Lucid or philosophical", score: 15 }
    ]
  },
  {
    id: 4,
    question: "You see a 100-reply thread. You:",
    answers: [
      { text: "Scroll memes only", score: -6 },
      { text: "Read the funny parts", score: 3 },
      { text: "Read every reply to extract truth", score: 13 }
    ]
  },
  {
    id: 5,
    question: "Your posting style is mostly:",
    answers: [
      { text: "Shitposts & reactions", score: -5 },
      { text: "Aesthetic vibes & art", score: 7 },
      { text: "Long threads & systems thinking", score: 16 }
    ]
  },
  {
    id: 6,
    question: "How often do you change your mind after an argument?",
    answers: [
      { text: "Never, I double down", score: -15 },
      { text: "Rarely, but possible", score: 8 },
      { text: "Frequently if new evidence", score: 18 }
    ]
  },
  {
    id: 7,
    question: "You feel most alive when:",
    answers: [
      { text: "Partying with frens", score: 2 },
      { text: "Creating something beautiful", score: 10 },
      { text: "Understanding a deep truth", score: 20 }
    ]
  },
  {
    id: 8,
    question: "The universe feels:",
    answers: [
      { text: "Chaotic and random", score: -20 },
      { text: "Beautiful but mysterious", score: 10 },
      { text: "A perfectly synchronized harmony", score: 25 }
    ]
  }
];

const PRICES = {
  takeQuiz: 5,
  revealMonadMirrorNFT: 10,
  dailyPerceptionSpin: 2,
  harmonySyncWithSomeone: 3,
  ascendClarityBoost7d: 25,
  enterDivinePairsLottery: 50
};

interface MonadTier {
  name: string;
  emoji: string;
  color: string;
  description: string;
}

const MONAD_TIERS: Record<string, MonadTier> = {
  'Dominant Monad': {
    name: 'Dominant Monad',
    emoji: '👑',
    color: 'from-yellow-400 via-orange-500 to-red-600',
    description: 'Top 0.5% - The universe bends to your perception'
  },
  'Rational Monad': {
    name: 'Rational Monad',
    emoji: '🧠',
    color: 'from-blue-400 via-purple-500 to-pink-600',
    description: 'Top 20% - Systems thinker, pattern recognizer'
  },
  'Sensitive Monad': {
    name: 'Sensitive Monad',
    emoji: '🌸',
    color: 'from-pink-300 via-rose-400 to-red-400',
    description: '70% - Emotional, vibes-based, human'
  },
  'Bare Monad': {
    name: 'Bare Monad',
    emoji: '🌑',
    color: 'from-gray-600 via-gray-700 to-gray-900',
    description: '9.5% - Pure chaos, unrefined perception'
  }
};

export default function MonadSyncPage() {
  const { user, walletAddress, isLoading: contextLoading } = useFarcasterContext();

  const [currentQuestion, setCurrentQuestion] = useState(0);
  const [answers, setAnswers] = useState<number[]>([]);
  const [clarityScore, setClarityScore] = useState<number | null>(null);
  const [monadTier, setMonadTier] = useState<string | null>(null);
  const [isCalculating, setIsCalculating] = useState(false);
  const [hasRevealedNFT, setHasRevealedNFT] = useState(false);
  const [nftTokenId, setNftTokenId] = useState<string | null>(null);
  const [quizStarted, setQuizStarted] = useState(false);

  useEffect(() => {
    // Load existing monad data if user has taken quiz before
    if (user?.fid) {
      loadUserMonadData();
    }
  }, [user]);

  const loadUserMonadData = async () => {
    if (!user?.fid) return;

    try {
      const response = await fetch(`/api/monad-sync/get-user-monad?fid=${user.fid}`);
      if (response.ok) {
        const data = await response.json();
        if (data.monad) {
          setClarityScore(data.monad.clarityScore);
          setMonadTier(data.monad.tier);
          setHasRevealedNFT(data.monad.hasNFT);
          setNftTokenId(data.monad.nftTokenId);
        }
      }
    } catch (error) {
      console.error('Failed to load monad data:', error);
    }
  };

  const handleAnswerSelect = (answerIndex: number) => {
    const newAnswers = [...answers, answerIndex];
    setAnswers(newAnswers);

    if (currentQuestion < QUIZ_QUESTIONS.length - 1) {
      setCurrentQuestion(currentQuestion + 1);
    } else {
      calculateClarityScore(newAnswers);
    }
  };

  const calculateClarityScore = async (quizAnswers: number[]) => {
    setIsCalculating(true);

    try {
      // Calculate base score from quiz answers
      let baseClarity = 100;
      quizAnswers.forEach((answerIndex, questionIndex) => {
        const question = QUIZ_QUESTIONS[questionIndex];
        const answer = question.answers[answerIndex];
        baseClarity += answer.score;
      });

      // Get onchain multipliers from Neynar
      const response = await fetch('/api/monad-sync/calculate-clarity', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fid: user?.fid,
          baseClarity,
          walletAddress
        })
      });

      const data = await response.json();

      if (data.success) {
        setClarityScore(data.clarityScore);
        setMonadTier(data.tier);
      } else {
        throw new Error(data.error || 'Failed to calculate clarity');
      }
    } catch (error) {
      console.error('Clarity calculation failed:', error);
      // Fallback to base score only
      let baseClarity = 100;
      quizAnswers.forEach((answerIndex, questionIndex) => {
        const question = QUIZ_QUESTIONS[questionIndex];
        const answer = question.answers[answerIndex];
        baseClarity += answer.score;
      });

      const finalClarity = Math.max(0, Math.min(99.9, baseClarity / 2));
      setClarityScore(finalClarity);

      // Determine tier
      let tier = 'Bare Monad';
      if (finalClarity >= 98.5) tier = 'Dominant Monad';
      else if (finalClarity >= 85) tier = 'Rational Monad';
      else if (finalClarity >= 40) tier = 'Sensitive Monad';
      setMonadTier(tier);
    }

    setIsCalculating(false);
  };

  const handleRevealNFT = async () => {
    if (!walletAddress || !clarityScore || !monadTier) return;

    try {
      const response = await fetch('/api/monad-sync/mint-mirror', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userAddress: walletAddress,
          fid: user?.fid,
          clarityScore,
          tier: monadTier
        })
      });

      const data = await response.json();

      if (data.success) {
        setHasRevealedNFT(true);
        setNftTokenId(data.tokenId);
      } else {
        alert(`Failed to mint NFT: ${data.error}`);
      }
    } catch (error) {
      console.error('Mint failed:', error);
      alert('Failed to mint Monad Mirror NFT');
    }
  };

  const handleShareCast = () => {
    if (!clarityScore || !monadTier) return;

    const tierInfo = MONAD_TIERS[monadTier];
    const text = `Just synced my monad on Monad Blockchain.\n\nI'm a ${monadTier} ${tierInfo.emoji} — ${clarityScore.toFixed(1)}% clarity\n\nOnly true Rational/Dominant souls can sync with me.\n\nTap below to see if we're pre-harmonized:\nhttps://fcempowertours.xyz/monad-sync`;

    window.open(`https://warpcast.com/~/compose?text=${encodeURIComponent(text)}`, '_blank');
  };

  const resetQuiz = () => {
    setCurrentQuestion(0);
    setAnswers([]);
    setClarityScore(null);
    setMonadTier(null);
    setQuizStarted(true);
  };

  if (contextLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-purple-900 via-black to-blue-900">
        <div className="text-center">
          <div className="animate-spin text-4xl mb-4">⭕</div>
          <p className="text-white">Loading your monad...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-purple-900 via-black to-blue-900">
        <div className="text-center p-8 bg-black/60 backdrop-blur-lg rounded-3xl border border-purple-500/30 max-w-md">
          <div className="text-6xl mb-4">⭕</div>
          <h1 className="text-3xl font-bold text-white mb-4">Monad Sync</h1>
          <p className="text-gray-300 mb-6">
            Discover your eternal monad signature on Farcaster × Monad Blockchain.
          </p>
          <p className="text-sm text-gray-400">
            This Mini App must be opened in Warpcast.
          </p>
        </div>
      </div>
    );
  }

  // Results screen
  if (clarityScore !== null && monadTier) {
    const tierInfo = MONAD_TIERS[monadTier];

    return (
      <PageTransition className="min-h-screen bg-gradient-to-br from-purple-900 via-black to-blue-900 py-12 px-4">
        <div className="max-w-2xl mx-auto">
          <motion.div
            className="bg-black/60 backdrop-blur-lg rounded-3xl p-8 border border-purple-500/30"
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
          >
            <div className="text-center mb-8">
              <motion.div
                className="text-8xl mb-4"
                animate={{ rotate: [0, 10, -10, 0] }}
                transition={{ duration: 2, repeat: Infinity }}
              >
                {tierInfo.emoji}
              </motion.div>

              <h2 className="text-4xl font-bold text-white mb-2">{monadTier}</h2>
              <p className="text-gray-300 mb-4">{tierInfo.description}</p>

              <div className={`inline-block bg-gradient-to-r ${tierInfo.color} text-white px-8 py-4 rounded-2xl text-6xl font-bold mb-4`}>
                {clarityScore.toFixed(1)}%
              </div>

              <p className="text-sm text-gray-400">Perception Clarity</p>
            </div>

            {!hasRevealedNFT && (
              <motion.button
                onClick={handleRevealNFT}
                className="w-full py-4 bg-gradient-to-r from-purple-600 to-pink-600 text-white rounded-xl font-bold text-lg mb-4 hover:from-purple-700 hover:to-pink-700 transition-all"
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
              >
                🔮 Reveal Monad Mirror NFT (10 TOURS)
              </motion.button>
            )}

            {hasRevealedNFT && nftTokenId && (
              <div className="mb-4 p-4 bg-green-500/20 border border-green-500/50 rounded-xl text-center">
                <p className="text-green-300 font-bold">✅ Monad Mirror NFT Minted!</p>
                <p className="text-sm text-gray-400 mt-1">Token #{nftTokenId}</p>
              </div>
            )}

            <motion.button
              onClick={handleShareCast}
              className="w-full py-4 bg-gradient-to-r from-blue-600 to-purple-600 text-white rounded-xl font-bold text-lg mb-4 hover:from-blue-700 hover:to-purple-700 transition-all"
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
            >
              📢 Share My Monad on Farcaster
            </motion.button>

            <button
              onClick={resetQuiz}
              className="w-full py-4 bg-gray-800 text-white rounded-xl font-bold hover:bg-gray-700 transition-all"
            >
              🔄 Retake Quiz (5 TOURS)
            </button>
          </motion.div>
        </div>
      </PageTransition>
    );
  }

  // Quiz in progress
  if (quizStarted && currentQuestion < QUIZ_QUESTIONS.length) {
    const question = QUIZ_QUESTIONS[currentQuestion];

    return (
      <PageTransition className="min-h-screen bg-gradient-to-br from-purple-900 via-black to-blue-900 py-12 px-4">
        <div className="max-w-2xl mx-auto">
          <div className="mb-8 text-center">
            <p className="text-purple-300 text-sm mb-2">
              Question {currentQuestion + 1} of {QUIZ_QUESTIONS.length}
            </p>
            <div className="w-full bg-gray-800 rounded-full h-2">
              <motion.div
                className="bg-gradient-to-r from-purple-500 to-pink-500 h-2 rounded-full"
                initial={{ width: 0 }}
                animate={{ width: `${((currentQuestion + 1) / QUIZ_QUESTIONS.length) * 100}%` }}
              />
            </div>
          </div>

          <motion.div
            key={currentQuestion}
            className="bg-black/60 backdrop-blur-lg rounded-3xl p-8 border border-purple-500/30"
            initial={{ opacity: 0, x: 100 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -100 }}
          >
            <h2 className="text-2xl font-bold text-white mb-8 text-center">
              {question.question}
            </h2>

            <div className="space-y-4">
              {question.answers.map((answer, index) => (
                <motion.button
                  key={index}
                  onClick={() => handleAnswerSelect(index)}
                  className="w-full p-6 bg-purple-900/30 hover:bg-purple-800/50 border border-purple-500/30 rounded-xl text-white text-lg text-left transition-all"
                  whileHover={{ scale: 1.02, x: 10 }}
                  whileTap={{ scale: 0.98 }}
                >
                  {answer.text}
                </motion.button>
              ))}
            </div>
          </motion.div>
        </div>
      </PageTransition>
    );
  }

  // Loading/calculating screen
  if (isCalculating) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-purple-900 via-black to-blue-900">
        <div className="text-center">
          <motion.div
            className="text-8xl mb-4"
            animate={{ rotate: 360, scale: [1, 1.2, 1] }}
            transition={{ duration: 2, repeat: Infinity }}
          >
            ⭕
          </motion.div>
          <p className="text-white text-xl">Calculating your clarity...</p>
          <p className="text-gray-400 text-sm mt-2">Syncing with the Monad Blockchain</p>
        </div>
      </div>
    );
  }

  // Welcome screen
  return (
    <PageTransition className="min-h-screen bg-gradient-to-br from-purple-900 via-black to-blue-900 py-12 px-4">
      <div className="max-w-2xl mx-auto">
        <motion.div
          className="bg-black/60 backdrop-blur-lg rounded-3xl p-8 border border-purple-500/30 text-center"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <motion.div
            className="text-8xl mb-6"
            animate={{ scale: [1, 1.1, 1] }}
            transition={{ duration: 2, repeat: Infinity }}
          >
            ⭕
          </motion.div>

          <h1 className="text-5xl font-bold text-white mb-4">Monad Sync</h1>
          <p className="text-xl text-gray-300 mb-8">
            Discover your eternal monad signature on Farcaster × Monad Blockchain
          </p>

          <div className="grid grid-cols-2 gap-4 mb-8 text-left">
            {Object.values(MONAD_TIERS).map((tier, index) => (
              <div key={index} className={`p-4 bg-gradient-to-br ${tier.color} rounded-xl`}>
                <div className="text-3xl mb-2">{tier.emoji}</div>
                <h3 className="text-white font-bold text-sm mb-1">{tier.name}</h3>
                <p className="text-white/80 text-xs">{tier.description}</p>
              </div>
            ))}
          </div>

          <motion.button
            onClick={() => setQuizStarted(true)}
            className="w-full py-6 bg-gradient-to-r from-purple-600 to-pink-600 text-white rounded-xl font-bold text-2xl hover:from-purple-700 hover:to-pink-700 transition-all"
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
          >
            Begin Monad Sync 👁️
          </motion.button>

          <p className="text-gray-400 text-sm mt-4">
            First sync free • Retakes: 5 TOURS
          </p>
        </motion.div>
      </div>
    </PageTransition>
  );
}
