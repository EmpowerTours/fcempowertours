import { getCountryByCode, getFlagEmoji } from '@/lib/passport/countries';

interface PassportSVGProps {
  countryCode: string;
  tokenId: number | string;
  className?: string;
}

export function PassportSVG({ countryCode, tokenId, className = '' }: PassportSVGProps) {
  const country = getCountryByCode(countryCode);
  const flag = getFlagEmoji(countryCode);
  const countryName = country?.name || 'Unknown';
  const region = country?.region || 'Unknown Region';
  const tokenIdStr = String(tokenId);

  // Build SVG safely using template literals with proper escaping
  const svg = `
<svg width="400" height="600" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 600" style="width: 100%; height: 100%;">
  <defs>
    <linearGradient id="bgGradient-${tokenIdStr}" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:#1e3a8a;stop-opacity:1" />
      <stop offset="100%" style="stop-color:#3b82f6;stop-opacity:1" />
    </linearGradient>
  </defs>
  <rect width="400" height="600" fill="url(#bgGradient-${tokenIdStr})"/>
  <rect x="10" y="10" width="380" height="580" fill="none" stroke="#60a5fa" stroke-width="4" rx="10"/>
  <rect x="20" y="20" width="360" height="100" fill="#3b82f6" rx="8" opacity="0.8"/>
  <text x="200" y="60" font-family="Arial, sans-serif" font-size="28" font-weight="bold" fill="white" text-anchor="middle">
    EMPOWER TOURS
  </text>
  <text x="200" y="95" font-family="Arial, sans-serif" font-size="18" fill="#e0f2fe" text-anchor="middle">
    Digital Passport
  </text>
  <rect x="20" y="140" width="360" height="280" fill="#1e40af" rx="8" opacity="0.3"/>
  <text x="200" y="240" font-size="120" text-anchor="middle" dominant-baseline="middle">
    ${flag}
  </text>
  <text x="200" y="330" font-family="Arial, sans-serif" font-size="${countryName.length > 15 ? '28' : '32'}" font-weight="bold" fill="white" text-anchor="middle">
    ${countryName.toUpperCase()}
  </text>
  <text x="200" y="365" font-family="Arial, sans-serif" font-size="18" fill="#93c5fd" text-anchor="middle">
    ${countryCode}
  </text>
  <text x="200" y="390" font-family="Arial, sans-serif" font-size="12" fill="#60a5fa" text-anchor="middle">
    ${region}
  </text>
  <circle cx="320" cy="180" r="40" fill="none" stroke="#ef4444" stroke-width="4" opacity="0.8"/>
  <text x="320" y="175" font-family="Arial, sans-serif" font-size="14" font-weight="bold" fill="#ef4444" text-anchor="middle">
    PASSPORT
  </text>
  <text x="320" y="195" font-family="Arial, sans-serif" font-size="12" fill="#ef4444" text-anchor="middle">
    #${tokenIdStr}
  </text>
  <rect x="20" y="440" width="360" height="140" fill="#1e40af" rx="8" opacity="0.3"/>
  <text x="200" y="475" font-family="Arial, sans-serif" font-size="14" fill="#93c5fd" text-anchor="middle">
    Token ID: ${tokenIdStr}
  </text>
  <text x="200" y="525" font-family="Arial, sans-serif" font-size="12" fill="#3b82f6" text-anchor="middle">
    Monad
  </text>
  <text x="200" y="550" font-family="Arial, sans-serif" font-size="11" fill="#3b82f6" text-anchor="middle">
    Minted via EmpowerTours
  </text>
  <line x1="40" y1="430" x2="360" y2="430" stroke="#3b82f6" stroke-width="2" opacity="0.5"/>
</svg>
  `.trim();

  return (
    <div
      className={`w-full h-full flex items-center justify-center ${className}`}
      style={{ aspectRatio: '2 / 3' }}
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}
