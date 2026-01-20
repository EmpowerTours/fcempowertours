'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { RotateCw, ArrowDown, ArrowLeft, ArrowRight, RefreshCw, X } from 'lucide-react';

interface TetrisProps {
  onClose?: () => void;
}

const ROWS = 20;
const COLS = 10;
const SHAPES = [
  [[1, 1, 1, 1]], // I
  [[1, 1], [1, 1]], // O
  [[0, 1, 0], [1, 1, 1]], // T
  [[1, 0, 0], [1, 1, 1]], // L
  [[0, 0, 1], [1, 1, 1]], // J
  [[0, 1, 1], [1, 1, 0]], // S
  [[1, 1, 0], [0, 1, 1]]  // Z
];
const COLORS = ['#00f0ff', '#f0ff00', '#b026ff', '#ffaa00', '#0044ff', '#00ff44', '#ff0044'];

interface Piece {
  shape: number[][];
  x: number;
  y: number;
  colorIdx: number;
}

export const Tetris: React.FC<TetrisProps> = ({ onClose }) => {
  const [board, setBoard] = useState<number[][]>(Array.from({ length: ROWS }, () => Array(COLS).fill(0)));
  const [currentPiece, setCurrentPiece] = useState<Piece | null>(null);
  const [score, setScore] = useState(0);
  const [gameOver, setGameOver] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const checkCollision = useCallback((piece: Piece, board: number[][], offsetX = 0, offsetY = 0) => {
    for (let y = 0; y < piece.shape.length; y++) {
      for (let x = 0; x < piece.shape[y].length; x++) {
        if (piece.shape[y][x] !== 0) {
          const newY = piece.y + y + offsetY;
          const newX = piece.x + x + offsetX;
          if (newX < 0 || newX >= COLS || newY >= ROWS || (newY >= 0 && board[newY][newX] !== 0)) {
            return true;
          }
        }
      }
    }
    return false;
  }, []);

  const spawnPiece = useCallback(() => {
    const idx = Math.floor(Math.random() * SHAPES.length);
    const shape = SHAPES[idx];
    const newPiece: Piece = {
      shape,
      x: Math.floor(COLS / 2) - Math.floor(shape[0].length / 2),
      y: 0,
      colorIdx: idx
    };
    if (checkCollision(newPiece, board)) {
      setGameOver(true);
      return;
    }
    setCurrentPiece(newPiece);
  }, [board, checkCollision]);

  const mergePiece = useCallback(() => {
    if (!currentPiece) return;
    const newBoard = board.map(row => [...row]);
    let gameOverFlag = false;

    currentPiece.shape.forEach((row, y) => {
      row.forEach((val, x) => {
        if (val !== 0) {
          const boardY = currentPiece.y + y;
          const boardX = currentPiece.x + x;
          if (boardY >= 0 && boardY < ROWS) {
            newBoard[boardY][boardX] = currentPiece.colorIdx + 1;
          } else {
            gameOverFlag = true;
          }
        }
      });
    });

    if (gameOverFlag) {
      setGameOver(true);
      return;
    }

    // Clear full lines
    let linesCleared = 0;
    const clearedBoard = newBoard.filter(row => {
      const full = row.every(cell => cell !== 0);
      if (full) linesCleared++;
      return !full;
    });

    while (clearedBoard.length < ROWS) {
      clearedBoard.unshift(Array(COLS).fill(0));
    }

    setBoard(clearedBoard);
    setScore(prev => prev + (linesCleared * 100));
    spawnPiece();
  }, [currentPiece, board, spawnPiece]);

  const movePiece = useCallback((dx: number, dy: number) => {
    if (!currentPiece || gameOver) return;
    if (!checkCollision(currentPiece, board, dx, dy)) {
      setCurrentPiece(prev => prev ? ({ ...prev, x: prev.x + dx, y: prev.y + dy }) : null);
    } else if (dy > 0) {
      mergePiece();
    }
  }, [currentPiece, board, gameOver, checkCollision, mergePiece]);

  const rotatePiece = useCallback(() => {
    if (!currentPiece || gameOver) return;
    const rotatedShape = currentPiece.shape[0].map((_, idx) =>
      currentPiece.shape.map(row => row[idx]).reverse()
    );
    const tempPiece = { ...currentPiece, shape: rotatedShape };
    if (!checkCollision(tempPiece, board)) {
      setCurrentPiece(tempPiece);
    }
  }, [currentPiece, board, gameOver, checkCollision]);

  // Keyboard controls
  useEffect(() => {
    if (gameOver) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') movePiece(-1, 0);
      else if (e.key === 'ArrowRight') movePiece(1, 0);
      else if (e.key === 'ArrowDown') movePiece(0, 1);
      else if (e.key === 'ArrowUp' || e.key === ' ') rotatePiece();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [movePiece, rotatePiece, gameOver]);

  // Auto-drop piece
  useEffect(() => {
    if (gameOver) return;
    if (!currentPiece) spawnPiece();

    intervalRef.current = setInterval(() => {
      movePiece(0, 1);
    }, 800);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [currentPiece, movePiece, spawnPiece, gameOver]);

  const resetGame = () => {
    setBoard(Array.from({ length: ROWS }, () => Array(COLS).fill(0)));
    setScore(0);
    setCurrentPiece(null);
    setGameOver(false);
  };

  // Render board with current piece overlay
  const renderBoard = () => {
    const displayBoard = board.map(row => [...row]);

    // Draw current piece on display board
    if (currentPiece && !gameOver) {
      currentPiece.shape.forEach((row, y) => {
        row.forEach((val, x) => {
          if (val !== 0) {
            const boardY = currentPiece.y + y;
            const boardX = currentPiece.x + x;
            if (boardY >= 0 && boardY < ROWS && boardX >= 0 && boardX < COLS) {
              displayBoard[boardY][boardX] = currentPiece.colorIdx + 1;
            }
          }
        });
      });
    }

    return displayBoard;
  };

  const displayBoard = renderBoard();

  return (
    <div className="w-full flex flex-col items-center justify-center min-h-[500px] select-none relative" style={{ touchAction: 'manipulation' }}>
      {onClose && (
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-gray-500 hover:text-white transition-colors z-10"
        >
          <X className="w-5 h-5" />
        </button>
      )}

      <div className="mb-4 text-center">
        <h3 className="text-2xl font-bold text-cyan-400 mb-2">TETRIS</h3>
        <div className="flex justify-between items-center gap-8 font-mono text-sm">
          <span className="text-gray-400">SCORE: <span className="text-cyan-400 font-bold">{score}</span></span>
          <span className="text-gray-500 text-xs">Use arrow keys or buttons</span>
        </div>
      </div>

      {/* Game Over Overlay */}
      {gameOver && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-black z-20 rounded-lg">
          <h3 className="text-3xl text-red-500 font-bold mb-2">GAME OVER</h3>
          <p className="text-gray-400 text-lg mb-1">Final Score: {score}</p>
          <button
            onClick={resetGame}
            className="mt-6 px-6 py-3 bg-cyan-500 hover:bg-cyan-400 text-black font-bold rounded-lg flex items-center gap-2"
          >
            <RefreshCw className="w-4 h-4" /> PLAY AGAIN
          </button>
        </div>
      )}

      {/* Game Board */}
      <div className="grid gap-[1px] bg-gray-900 border-2 border-cyan-500/30 p-2 rounded-lg mb-6" style={{ gridTemplateColumns: `repeat(${COLS}, 1fr)` }}>
        {displayBoard.map((row, y) =>
          row.map((cell, x) => {
            const color = cell ? COLORS[cell - 1] : '#111';
            return (
              <div
                key={`${y}-${x}`}
                className="w-4 h-4 sm:w-5 sm:h-5 rounded-sm transition-colors"
                style={{ backgroundColor: color }}
              />
            );
          })
        )}
      </div>

      {/* Mobile Controls - Game Boy Style */}
      <div className="flex w-full max-w-md justify-between items-end px-4 gap-4">
        {/* D-Pad (Left Hand) */}
        <div className="relative w-32 h-32">
          <button
            onClick={() => movePiece(-1, 0)}
            className="absolute left-0 top-1/2 -translate-y-1/2 w-10 h-10 bg-gray-800 hover:bg-cyan-500/50 active:bg-cyan-500 rounded-full flex items-center justify-center border border-gray-600 touch-manipulation"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <button
            onClick={() => movePiece(1, 0)}
            className="absolute right-0 top-1/2 -translate-y-1/2 w-10 h-10 bg-gray-800 hover:bg-cyan-500/50 active:bg-cyan-500 rounded-full flex items-center justify-center border border-gray-600 touch-manipulation"
          >
            <ArrowRight className="w-5 h-5" />
          </button>
          <button
            onClick={() => movePiece(0, 1)}
            className="absolute left-1/2 -translate-x-1/2 bottom-0 w-10 h-10 bg-gray-800 hover:bg-cyan-500/50 active:bg-cyan-500 rounded-full flex items-center justify-center border border-gray-600 touch-manipulation"
          >
            <ArrowDown className="w-5 h-5" />
          </button>
          <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-3 h-3 bg-gray-700 rounded-full" />
        </div>

        {/* Action Buttons (Right Hand) */}
        <div className="flex flex-col gap-2">
          <button
            onClick={rotatePiece}
            className="w-16 h-16 bg-cyan-500/20 hover:bg-cyan-500/40 active:bg-cyan-500 rounded-full flex items-center justify-center border-2 border-cyan-500 touch-manipulation shadow-[0_0_15px_rgba(0,240,255,0.3)]"
          >
            <RotateCw className="w-7 h-7 text-white" />
          </button>
          <span className="text-xs text-gray-500 text-center font-mono">ROTATE</span>
        </div>
      </div>
    </div>
  );
};
