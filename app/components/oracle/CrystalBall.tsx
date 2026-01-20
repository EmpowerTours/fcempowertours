// CORE VISUAL COMPONENT: Renders 3D Earth, Orbiting Planes & Clickable NFTs
import React, { useEffect, useRef, useState } from 'react';

export enum OracleState {
  IDLE = 'IDLE',
  PROCESSING = 'PROCESSING',
  SPEAKING = 'SPEAKING',
  GAMING = 'GAMING'
}

interface NFTObject {
  id: string;
  type: 'ART' | 'MUSIC' | 'EXPERIENCE';
  tokenId: string;
  name: string;
  imageUrl: string;
  price: string;
  contractAddress: string;
}

interface CrystalBallProps {
  state: OracleState;
  onNFTClick?: (nft: NFTObject) => void;
  isDarkMode?: boolean;
}

export const CrystalBall: React.FC<CrystalBallProps> = ({ state, onNFTClick, isDarkMode = true }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const hoveredNFTRef = useRef<NFTObject | null>(null);
  const [hoveredNFTDisplay, setHoveredNFTDisplay] = useState<NFTObject | null>(null);
  const [nftObjects, setNFTObjects] = useState<NFTObject[]>([]);

  // Fetch NFTs from Envio indexer
  useEffect(() => {
    const fetchNFTs = async () => {
      try {
        const response = await fetch('/api/envio/get-nfts');
        const data = await response.json();
        if (data.success) {
          setNFTObjects(data.nfts);
        }
      } catch (error) {
        console.error('Failed to fetch NFTs:', error);
      }
    };

    fetchNFTs();
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const earthTexture = new Image();
    earthTexture.src = 'https://upload.wikimedia.org/wikipedia/commons/thumb/2/23/Blue_Marble_2002.png/1024px-Blue_Marble_2002.png';
    let textureLoaded = false;
    earthTexture.onload = () => { textureLoaded = true; };

    // ORBITING PLANES CONFIGURATION (adjusted for larger earth)
    const planes = Array.from({ length: 12 }).map((_, i) => ({
      orbitRadius: 140 + Math.random() * 45, // Increased from 105+35 to 140+45
      speed: (Math.random() * 0.02 + 0.005) * (i % 2 === 0 ? 1 : -1),
      angle: Math.random() * Math.PI * 2,
      altitude: Math.random() * 60 - 30, // Slightly increased altitude range
      tiltOffset: Math.random() * Math.PI
    }));

    // NFT OBJECTS CONFIGURATION (orbit with planes, adjusted for larger earth)
    const nftOrbits = nftObjects.map((nft, i) => ({
      nft,
      orbitRadius: 145 + Math.random() * 50, // Increased from 110+40 to 145+50
      speed: (Math.random() * 0.01 + 0.003) * (i % 2 === 0 ? 1 : -1), // Slower for easier clicking
      angle: Math.random() * Math.PI * 2,
      altitude: Math.random() * 70 - 35, // Increased altitude range
      size: 24, // Increased from 16 to 24 for better visibility and clicking
      image: new Image(),
    }));

    // Load NFT images
    nftOrbits.forEach((orbit) => {
      orbit.image.src = orbit.nft.imageUrl;
      orbit.image.crossOrigin = 'anonymous';
    });

    let animationFrameId: number;
    let time = 0;

    // Mouse tracking for hover detection
    let mouseX = 0;
    let mouseY = 0;
    const handleMouseMove = (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      // Scale mouse coordinates to match canvas internal coordinates
      // Canvas is 440x440 but may be displayed at different sizes
      const scaleX = canvas.width / rect.width;
      const scaleY = canvas.height / rect.height;
      mouseX = (e.clientX - rect.left) * scaleX;
      mouseY = (e.clientY - rect.top) * scaleY;
    };

    const handleClick = (e: MouseEvent) => {
      const currentHovered = hoveredNFTRef.current;
      console.log('[CrystalBall] Canvas clicked, hoveredNFT:', currentHovered);
      if (currentHovered && onNFTClick) {
        console.log('[CrystalBall] Calling onNFTClick with:', currentHovered);
        onNFTClick(currentHovered);
      } else if (!currentHovered) {
        console.log('[CrystalBall] No NFT is hovered');
      } else if (!onNFTClick) {
        console.log('[CrystalBall] onNFTClick handler is missing');
      }
    };

    // Touch event handlers for mobile
    const updateTouchPosition = (touch: Touch) => {
      const rect = canvas.getBoundingClientRect();
      const scaleX = canvas.width / rect.width;
      const scaleY = canvas.height / rect.height;
      mouseX = (touch.clientX - rect.left) * scaleX;
      mouseY = (touch.clientY - rect.top) * scaleY;
    };

    const handleTouchStart = (e: TouchEvent) => {
      if (e.touches.length > 0) {
        updateTouchPosition(e.touches[0]);
        console.log('[CrystalBall] Touch start at:', mouseX, mouseY);
      }
    };

    const handleTouchMove = (e: TouchEvent) => {
      if (e.touches.length > 0) {
        updateTouchPosition(e.touches[0]);
      }
    };

    const handleTouchEnd = (e: TouchEvent) => {
      // Small delay to allow the render loop to update hoveredNFTRef
      setTimeout(() => {
        const currentHovered = hoveredNFTRef.current;
        console.log('[CrystalBall] Touch ended, hoveredNFT:', currentHovered);
        if (currentHovered && onNFTClick) {
          console.log('[CrystalBall] Calling onNFTClick from touch with:', currentHovered.type, currentHovered.name);
          onNFTClick(currentHovered);
        }
      }, 50);
    };

    canvas.addEventListener('mousemove', handleMouseMove);
    canvas.addEventListener('click', handleClick);
    canvas.addEventListener('touchstart', handleTouchStart, { passive: true });
    canvas.addEventListener('touchmove', handleTouchMove, { passive: true });
    canvas.addEventListener('touchend', handleTouchEnd, { passive: true });

    const render = () => {
      time += 0.005;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      const cx = canvas.width / 2;
      const cy = canvas.height / 2;
      const earthRadius = 160; // Increased from 120 to 160 (33% larger)

      // 1. Atmosphere Glow
      const glow = ctx.createRadialGradient(cx, cy, earthRadius, cx, cy, earthRadius * 1.4);
      glow.addColorStop(0, 'rgba(0, 240, 255, 0.4)');
      glow.addColorStop(1, 'rgba(0, 0, 0, 0)');
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(cx, cy, earthRadius * 1.4, 0, Math.PI * 2);
      ctx.fill();

      // 2. Earth Sphere Mask
      ctx.save();
      ctx.beginPath();
      ctx.arc(cx, cy, earthRadius, 0, Math.PI * 2);
      ctx.clip();
      ctx.fillStyle = '#050510';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      if (textureLoaded) {
        const scaleHeight = earthRadius * 2.2;
        const scaleWidth = (earthTexture.width / earthTexture.height) * scaleHeight;
        const speed = state === OracleState.PROCESSING ? 1.5 : 0.5;
        const offsetX = (time * 50 * speed) % scaleWidth;

        ctx.filter = 'contrast(1.3) brightness(1.2) hue-rotate(160deg) saturate(1.5)';
        const drawY = cy - scaleHeight / 2;
        ctx.drawImage(earthTexture, -offsetX, drawY, scaleWidth, scaleHeight);
        ctx.drawImage(earthTexture, -offsetX + scaleWidth, drawY, scaleWidth, scaleHeight);
        ctx.filter = 'none';
      }

      // Inner Shadow (3D Effect)
      const sphereGrad = ctx.createRadialGradient(cx - 30, cy - 30, 10, cx, cy, earthRadius);
      sphereGrad.addColorStop(0, 'rgba(0,0,0,0)');
      sphereGrad.addColorStop(1, 'rgba(0,0,0,0.9)');
      ctx.fillStyle = sphereGrad;
      ctx.beginPath();
      ctx.arc(cx, cy, earthRadius, 0, Math.PI * 2);
      ctx.fill();

      // Tech Grid
      ctx.strokeStyle = 'rgba(0, 240, 255, 0.1)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(cx, cy, earthRadius, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();

      // 3. Render Orbiting Planes (3D Projection)
      planes.forEach((p) => {
        p.angle += p.speed * (state === OracleState.PROCESSING ? 3 : 1);
        const tilt = 0.3;
        const cosA = Math.cos(p.angle);
        const sinA = Math.sin(p.angle);

        const x3d = p.orbitRadius * cosA;
        const z3d = p.orbitRadius * sinA;
        const y3d = p.altitude + (z3d * Math.sin(tilt));

        // Z-Sorting/Culling
        const perspective = 300 / (300 - z3d);
        const x2d = cx + x3d * perspective;
        const y2d = cy + y3d * perspective;
        const distFromCenter = Math.sqrt(x3d*x3d + y3d*y3d);
        const isBehind = z3d < -10 && distFromCenter < earthRadius * 0.95;

        if (!isBehind) {
          ctx.save();
          ctx.translate(x2d, y2d);
          const heading = p.angle + (p.speed > 0 ? Math.PI/2 : -Math.PI/2);
          ctx.rotate(heading);
          const scale = perspective * 0.8;
          ctx.scale(scale, scale);

          // Draw Jet
          ctx.fillStyle = state !== OracleState.IDLE ? '#ffffff' : '#00f0ff';
          ctx.shadowColor = '#00f0ff';
          ctx.shadowBlur = 5;
          ctx.beginPath();
          ctx.moveTo(0, -8);
          ctx.lineTo(8, 3);
          ctx.lineTo(0, 7);
          ctx.lineTo(-8, 3);
          ctx.fill();
          ctx.restore();
        }
      });

      // 4. Render NFT Objects (clickable)
      let currentHovered: NFTObject | null = null;

      nftOrbits.forEach((orbit) => {
        orbit.angle += orbit.speed * (state === OracleState.PROCESSING ? 2 : 1);
        const tilt = 0.25;
        const cosA = Math.cos(orbit.angle);
        const sinA = Math.sin(orbit.angle);

        const x3d = orbit.orbitRadius * cosA;
        const z3d = orbit.orbitRadius * sinA;
        const y3d = orbit.altitude + (z3d * Math.sin(tilt));

        const perspective = 300 / (300 - z3d);
        const x2d = cx + x3d * perspective;
        const y2d = cy + y3d * perspective;
        const distFromCenter = Math.sqrt(x3d*x3d + y3d*y3d);
        const isBehind = z3d < -10 && distFromCenter < earthRadius * 0.95;

        if (!isBehind) {
          const size = orbit.size * perspective;

          // Check hover with larger hit box (3x visual size for easier clicking)
          const dist = Math.sqrt((mouseX - x2d) ** 2 + (mouseY - y2d) ** 2);
          const hitBoxSize = size * 3; // 3x larger hit box
          const isHovered = dist < hitBoxSize;

          if (isHovered) {
            currentHovered = orbit.nft;
          }

          ctx.save();
          ctx.translate(x2d, y2d);

          // Draw NFT icon based on type
          if (orbit.image.complete && orbit.image.naturalWidth > 0) {
            // Draw image thumbnail
            ctx.save();
            ctx.beginPath();
            ctx.arc(0, 0, size, 0, Math.PI * 2);
            ctx.clip();
            ctx.drawImage(orbit.image, -size, -size, size * 2, size * 2);
            ctx.restore();

            // Border
            ctx.strokeStyle = isHovered ? '#ffd700' : getColorForType(orbit.nft.type);
            ctx.lineWidth = isHovered ? 3 : 2;
            ctx.beginPath();
            ctx.arc(0, 0, size, 0, Math.PI * 2);
            ctx.stroke();
          } else {
            // Fallback: colored circle with icon
            ctx.fillStyle = getColorForType(orbit.nft.type);
            ctx.shadowColor = getColorForType(orbit.nft.type);
            ctx.shadowBlur = isHovered ? 15 : 8;
            ctx.beginPath();
            ctx.arc(0, 0, size, 0, Math.PI * 2);
            ctx.fill();

            // Type indicator
            ctx.fillStyle = '#ffffff';
            ctx.font = `${size}px sans-serif`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(getEmojiForType(orbit.nft.type), 0, 0);
          }

          // Large hover indicator (shows clickable area)
          if (isHovered) {
            // Outer glow circle showing hit box
            ctx.strokeStyle = 'rgba(255, 215, 0, 0.3)';
            ctx.lineWidth = 3;
            ctx.beginPath();
            ctx.arc(0, 0, hitBoxSize, 0, Math.PI * 2);
            ctx.stroke();

            // Inner animated ring
            ctx.strokeStyle = '#ffd700';
            ctx.lineWidth = 3;
            ctx.shadowColor = '#ffd700';
            ctx.shadowBlur = 10;
            ctx.setLineDash([4, 4]);
            ctx.beginPath();
            ctx.arc(0, 0, size + 6, 0, Math.PI * 2);
            ctx.stroke();
            ctx.setLineDash([]);
            ctx.shadowBlur = 0;
          }

          ctx.restore();
        }
      });

      // Only update display state if hover changed (prevents constant re-renders)
      const prevHovered = hoveredNFTRef.current;
      const currentId = (currentHovered as NFTObject | null)?.id ?? null;
      const prevId = prevHovered?.id ?? null;

      if (currentId !== prevId) {
        setHoveredNFTDisplay(currentHovered as NFTObject | null);
        // Update cursor
        canvas.style.cursor = currentHovered ? 'pointer' : 'default';
      }

      // Update ref after comparison for click handling
      hoveredNFTRef.current = currentHovered as NFTObject | null;

      animationFrameId = requestAnimationFrame(render);
    };

    render();

    return () => {
      cancelAnimationFrame(animationFrameId);
      canvas.removeEventListener('mousemove', handleMouseMove);
      canvas.removeEventListener('click', handleClick);
      canvas.removeEventListener('touchstart', handleTouchStart);
      canvas.removeEventListener('touchmove', handleTouchMove);
      canvas.removeEventListener('touchend', handleTouchEnd);
    };
  }, [state, nftObjects, onNFTClick]);

  const borderClass = state === OracleState.PROCESSING ? 'border-fuchsia-500/30' : 'border-syndicate-cyan/30';

  return (
    <div className="relative flex items-center justify-center w-[320px] h-[320px] xs:w-[380px] xs:h-[380px] sm:w-[440px] sm:h-[440px]">
      <div className={`absolute inset-0 rounded-full border border-dashed border-opacity-30 animate-[spin_60s_linear_infinite] ${borderClass}`}></div>
      <div className="relative w-72 h-72 xs:w-80 xs:h-80 sm:w-96 sm:h-96 rounded-full overflow-hidden" style={{ background: '#000', boxShadow: '0 0 80px rgba(0, 100, 255, 0.2)' }}>
        <canvas
          ref={canvasRef}
          width={440}
          height={440}
          className="w-full h-full"
        />
        <div className="absolute top-0 left-0 w-full h-full bg-gradient-to-br from-white/10 via-transparent to-transparent rounded-full pointer-events-none mix-blend-overlay"></div>
      </div>

      {/* NFT Tooltip on Hover */}
      {hoveredNFTDisplay && (
        <div className={`absolute -bottom-16 left-1/2 -translate-x-1/2 backdrop-blur-md border rounded-lg px-4 py-2 text-sm pointer-events-none z-50 ${isDarkMode ? 'bg-black/90 border-cyan-500/30' : 'bg-white/95 border-gray-300 shadow-lg'}`}>
          <div className="text-cyan-500 font-bold">{hoveredNFTDisplay.name}</div>
          <div className={`text-xs ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>{hoveredNFTDisplay.type} • {hoveredNFTDisplay.price} WMON</div>
          <div className={`text-xs ${isDarkMode ? 'text-gray-500' : 'text-gray-500'}`}>Click to view</div>
        </div>
      )}
    </div>
  );
};

// Helper functions
function getColorForType(type: string): string {
  switch (type) {
    case 'ART':
      return '#ff6b6b';
    case 'MUSIC':
      return '#00f0ff';
    case 'EXPERIENCE':
      return '#ffd700';
    default:
      return '#ffffff';
  }
}

function getEmojiForType(type: string): string {
  switch (type) {
    case 'ART':
      return '🎨';
    case 'MUSIC':
      return '🎵';
    case 'EXPERIENCE':
      return '✈️';
    default:
      return '⭐';
  }
}
