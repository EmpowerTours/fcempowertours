'use client';

import React, { useState, useEffect } from 'react';
import { RefreshCw, X } from 'lucide-react';

interface TicTacToeProps {
  onClose?: () => void;
}

export const TicTacToe: React.FC<TicTacToeProps> = ({ onClose }) => {
  const [board, setBoard] = useState<(string | null)[]>(Array(9).fill(null));
  const [turn, setTurn] = useState<'PLAYER' | 'ORACLE'>('PLAYER');
  const [gameStatus, setGameStatus] = useState<'PLAYING' | 'VICTORY' | 'DEFEAT' | 'DRAW'>('PLAYING');

  const checkWinner = (board: (string | null)[]) => {
    const lines = [
      [0, 1, 2], [3, 4, 5], [6, 7, 8],
      [0, 3, 6], [1, 4, 7], [2, 5, 8],
      [0, 4, 8], [2, 4, 6]
    ];
    for (let i = 0; i < lines.length; i++) {
      const [a, b, c] = lines[i];
      if (board[a] && board[a] === board[b] && board[a] === board[c]) return board[a];
    }
    return board.includes(null) ? null : 'DRAW';
  };

  const handleClick = (index: number) => {
    if (board[index] || turn !== 'PLAYER' || gameStatus !== 'PLAYING') return;
    const newBoard = [...board];
    newBoard[index] = 'X';
    setBoard(newBoard);
    const winner = checkWinner(newBoard);
    if (winner === 'X') setGameStatus('VICTORY');
    else if (winner === 'DRAW') setGameStatus('DRAW');
    else setTurn('ORACLE');
  };

  // Oracle AI move
  useEffect(() => {
    if (turn === 'ORACLE' && gameStatus === 'PLAYING') {
      const timer = setTimeout(() => {
        const emptyIndices = board.map((val, idx) => val === null ? idx : null).filter(val => val !== null) as number[];
        if (emptyIndices.length > 0) {
          const randomIdx = emptyIndices[Math.floor(Math.random() * emptyIndices.length)];
          const newBoard = [...board];
          newBoard[randomIdx] = 'O';
          setBoard(newBoard);
          const winner = checkWinner(newBoard);
          if (winner === 'O') setGameStatus('DEFEAT');
          else if (winner === 'DRAW') setGameStatus('DRAW');
          else setTurn('PLAYER');
        }
      }, 800);
      return () => clearTimeout(timer);
    }
  }, [turn, board, gameStatus]);

  const resetGame = () => {
    setBoard(Array(9).fill(null));
    setTurn('PLAYER');
    setGameStatus('PLAYING');
  };

  return (
    <div className="w-full flex flex-col items-center justify-center min-h-[400px]" style={{ touchAction: 'manipulation' }}>
      {onClose && (
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-gray-500 hover:text-white transition-colors"
        >
          <X className="w-5 h-5" />
        </button>
      )}

      <div className="mb-6 text-center">
        <h3 className="text-2xl font-bold text-cyan-400 mb-2">TIC TAC TOE</h3>
        <p className="text-xs text-gray-400 font-mono">Challenge the Oracle AI</p>
      </div>

      <div className="grid grid-cols-3 gap-2 bg-gray-900 p-3 rounded-lg border border-cyan-500/30 mb-4">
        {board.map((cell, idx) => (
          <button
            key={idx}
            onClick={() => handleClick(idx)}
            disabled={!!cell || turn === 'ORACLE' || gameStatus !== 'PLAYING'}
            className={`w-16 h-16 sm:w-20 sm:h-20 flex items-center justify-center text-4xl font-bold rounded-lg transition-all touch-manipulation ${
              cell === 'X'
                ? 'text-cyan-400 bg-cyan-900/30 border border-cyan-500'
                : cell === 'O'
                ? 'text-purple-400 bg-purple-900/30 border border-purple-500'
                : 'bg-black hover:bg-white/5 border border-gray-700 active:scale-95'
            }`}
          >
            {cell}
          </button>
        ))}
      </div>

      <div className="font-mono text-sm text-center min-h-[60px]">
        {gameStatus === 'VICTORY' && (
          <div className="text-cyan-400 text-xl font-bold animate-pulse">🎉 YOU WIN!</div>
        )}
        {gameStatus === 'DEFEAT' && (
          <div className="text-purple-400 text-xl font-bold">🤖 ORACLE WINS</div>
        )}
        {gameStatus === 'DRAW' && (
          <div className="text-gray-400 text-xl font-bold">🤝 DRAW</div>
        )}
        {gameStatus === 'PLAYING' && (
          <div className="text-gray-400">
            {turn === 'PLAYER' ? (
              <span className="text-cyan-400">Your turn (X)</span>
            ) : (
              <span className="text-purple-400 animate-pulse">Oracle thinking...</span>
            )}
          </div>
        )}
      </div>

      {gameStatus !== 'PLAYING' && (
        <button
          onClick={resetGame}
          className="mt-4 flex items-center gap-2 px-6 py-3 bg-cyan-500 hover:bg-cyan-400 text-black font-bold rounded-lg transition-all"
        >
          <RefreshCw className="w-4 h-4" /> PLAY AGAIN
        </button>
      )}
    </div>
  );
};
