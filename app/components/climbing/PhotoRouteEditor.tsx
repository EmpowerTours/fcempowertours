'use client';

import { useRef, useState, useEffect } from 'react';
import { ReactSketchCanvas, ReactSketchCanvasRef } from 'react-sketch-canvas';

interface PhotoRouteEditorProps {
  photo: File;
  onSave: (editedBlob: Blob) => void;
  onCancel: () => void;
}

export function PhotoRouteEditor({ photo, onSave, onCancel }: PhotoRouteEditorProps) {
  const canvasRef = useRef<ReactSketchCanvasRef>(null);
  const [strokeColor, setStrokeColor] = useState('#ff0000'); // Default red
  const [strokeWidth, setStrokeWidth] = useState(4);
  const [isErasing, setIsErasing] = useState(false);
  const [photoUrl, setPhotoUrl] = useState('');

  useEffect(() => {
    const url = URL.createObjectURL(photo);
    setPhotoUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [photo]);

  const handleSave = async () => {
    try {
      const canvas = await canvasRef.current?.exportImage('png');
      if (!canvas) {
        console.error('Failed to export canvas');
        return;
      }

      const blob = await (await fetch(canvas)).blob();
      onSave(blob);
    } catch (error) {
      console.error('Error saving photo:', error);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/95 flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between p-4 bg-gray-900 border-b border-gray-700">
        <button
          onClick={onCancel}
          className="text-white font-medium hover:text-gray-300 transition"
        >
          Cancel
        </button>
        <h3 className="text-white font-bold text-lg">Draw Your Route</h3>
        <button
          onClick={handleSave}
          className="text-orange-400 font-bold hover:text-orange-300 transition"
        >
          Save
        </button>
      </div>

      {/* Canvas */}
      <div className="flex-1 overflow-auto bg-black">
        <ReactSketchCanvas
          ref={canvasRef}
          backgroundImage={photoUrl}
          strokeWidth={strokeWidth}
          strokeColor={strokeColor}
          canvasColor="transparent"
          exportWithBackgroundImage={true}
          style={{ width: '100%', height: '100%' }}
        />
      </div>

      {/* Drawing Tools */}
      <div className="bg-gray-900 p-4 space-y-3 border-t border-gray-700">
        {/* Pen/Eraser Toggle */}
        <div className="flex gap-2">
          <button
            onClick={() => {
              setIsErasing(false);
              canvasRef.current?.eraseMode(false);
            }}
            className={`flex-1 py-2 px-3 rounded font-medium transition ${
              !isErasing
                ? 'bg-orange-500 text-white'
                : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
            }`}
          >
            ✏️ Draw
          </button>
          <button
            onClick={() => {
              setIsErasing(true);
              canvasRef.current?.eraseMode(true);
            }}
            className={`flex-1 py-2 px-3 rounded font-medium transition ${
              isErasing
                ? 'bg-orange-500 text-white'
                : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
            }`}
          >
            🗑️ Erase
          </button>
          <button
            onClick={() => canvasRef.current?.undo()}
            className="px-4 py-2 rounded bg-gray-700 text-white hover:bg-gray-600 transition"
          >
            ↩️
          </button>
          <button
            onClick={() => canvasRef.current?.clearCanvas()}
            className="px-4 py-2 rounded bg-gray-700 text-white hover:bg-gray-600 transition"
          >
            🔄
          </button>
        </div>

        {/* Color Picker */}
        <div className="flex items-center gap-3">
          <span className="text-white text-sm font-medium">Color:</span>
          <div className="flex gap-2 flex-1">
            {['#ff0000', '#00ff00', '#0000ff', '#ffff00', '#ffffff'].map((color) => (
              <button
                key={color}
                onClick={() => setStrokeColor(color)}
                className={`w-8 h-8 rounded-full border-2 transition ${
                  strokeColor === color
                    ? 'border-orange-400 scale-110'
                    : 'border-gray-600 hover:border-gray-500'
                }`}
                style={{ backgroundColor: color }}
                aria-label={`Color ${color}`}
              />
            ))}
            <input
              type="color"
              value={strokeColor}
              onChange={(e) => setStrokeColor(e.target.value)}
              className="w-8 h-8 rounded cursor-pointer border-2 border-gray-600"
            />
          </div>
        </div>

        {/* Stroke Width */}
        <div className="flex items-center gap-3">
          <span className="text-white text-sm font-medium">Width:</span>
          <input
            type="range"
            min="2"
            max="12"
            value={strokeWidth}
            onChange={(e) => setStrokeWidth(Number(e.target.value))}
            className="flex-1 accent-orange-500"
          />
          <span className="text-white text-sm w-8 text-right">{strokeWidth}px</span>
        </div>
      </div>
    </div>
  );
}
