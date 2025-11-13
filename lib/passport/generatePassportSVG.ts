import { getCountryByCode, getFlagEmoji } from './countries';

// Generate SVG passport image with country info
export function generatePassportSVG(countryCode: string, countryName: string, tokenId: number): string {
  // Get flag from complete database
  const flag = getFlagEmoji(countryCode);
  
  // Get full country info
  const country = getCountryByCode(countryCode);
  const region = country?.region || 'Unknown Region';
  const continent = country?.continent || 'Unknown';

  // Generate SVG with embedded styles
  const svg = `<svg width="400" height="600" xmlns="http://www.w3.org/2000/svg">
  <!-- Background gradient -->
  <defs>
    <linearGradient id="bgGradient" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:#1e3a8a;stop-opacity:1" />
      <stop offset="100%" style="stop-color:#3b82f6;stop-opacity:1" />
    </linearGradient>
  </defs>
  
  <!-- Background -->
  <rect width="400" height="600" fill="url(#bgGradient)"/>
  
  <!-- Border -->
  <rect x="10" y="10" width="380" height="580" fill="none" stroke="#60a5fa" stroke-width="4" rx="10"/>
  
  <!-- Header -->
  <rect x="20" y="20" width="360" height="100" fill="#3b82f6" rx="8" opacity="0.8"/>
  <text x="200" y="60" font-family="Arial, sans-serif" font-size="28" font-weight="bold" fill="white" text-anchor="middle">
    EMPOWER TOURS
  </text>
  <text x="200" y="95" font-family="Arial, sans-serif" font-size="18" fill="#e0f2fe" text-anchor="middle">
    Digital Passport
  </text>
  
  <!-- Country Section -->
  <rect x="20" y="140" width="360" height="280" fill="#1e40af" rx="8" opacity="0.3"/>
  
  <!-- Flag/Emoji -->
  <text x="200" y="240" font-size="120" text-anchor="middle">
    ${flag}
  </text>
  
  <!-- Country Name -->
  <text x="200" y="330" font-family="Arial, sans-serif" font-size="${countryName.length > 15 ? '28' : '32'}" font-weight="bold" fill="white" text-anchor="middle">
    ${countryName.toUpperCase()}
  </text>
  
  <!-- Country Code & Region -->
  <text x="200" y="365" font-family="Arial, sans-serif" font-size="18" fill="#93c5fd" text-anchor="middle">
    ${countryCode}
  </text>
  <text x="200" y="390" font-family="Arial, sans-serif" font-size="12" fill="#60a5fa" text-anchor="middle">
    ${region}
  </text>
  
  <!-- Stamp Circle -->
  <circle cx="320" cy="180" r="40" fill="none" stroke="#ef4444" stroke-width="4" opacity="0.8"/>
  <text x="320" y="175" font-family="Arial, sans-serif" font-size="14" font-weight="bold" fill="#ef4444" text-anchor="middle">
    PASSPORT
  </text>
  <text x="320" y="195" font-family="Arial, sans-serif" font-size="12" fill="#ef4444" text-anchor="middle">
    #${tokenId}
  </text>

  <!-- Staking Badge -->
  <rect x="60" y="160" width="100" height="50" fill="#10b981" rx="8" opacity="0.9"/>
  <text x="110" y="180" font-family="Arial, sans-serif" font-size="12" font-weight="bold" fill="white" text-anchor="middle">
    ⚡ STAKEABLE
  </text>
  <text x="110" y="200" font-family="Arial, sans-serif" font-size="9" fill="#d1fae5" text-anchor="middle">
    Earn Rewards
  </text>

  <!-- Bottom Info -->
  <rect x="20" y="440" width="360" height="140" fill="#1e40af" rx="8" opacity="0.3"/>
  <text x="200" y="470" font-family="Arial, sans-serif" font-size="14" fill="#93c5fd" text-anchor="middle">
    Token ID: ${tokenId}
  </text>
  <text x="200" y="492" font-family="Arial, sans-serif" font-size="12" fill="#60a5fa" text-anchor="middle">
    ${continent} • Stakeable NFT
  </text>
  <text x="200" y="515" font-family="Arial, sans-serif" font-size="11" fill="#10b981" text-anchor="middle">
    💎 Collect Stamps • Build Credit Score
  </text>
  <text x="200" y="540" font-family="Arial, sans-serif" font-size="11" fill="#3b82f6" text-anchor="middle">
    Monad Testnet
  </text>
  <text x="200" y="560" font-family="Arial, sans-serif" font-size="10" fill="#93c5fd" text-anchor="middle">
    ${new Date().toLocaleDateString()}
  </text>
  
  <!-- Decorative Line -->
  <line x1="40" y1="430" x2="360" y2="430" stroke="#3b82f6" stroke-width="2" opacity="0.5"/>
</svg>`;

  return svg.trim();
}

// Convert SVG to base64 data URI (for embedding in JSON)
export function svgToDataURI(svg: string): string {
  const base64 = Buffer.from(svg).toString('base64');
  return `data:image/svg+xml;base64,${base64}`;
}

// Generate complete NFT metadata with image
export function generatePassportMetadata(
  countryCode: string,
  countryName: string,
  tokenId: number
): object {
  const svg = generatePassportSVG(countryCode, countryName, tokenId);
  const imageDataURI = svgToDataURI(svg);
  const country = getCountryByCode(countryCode);

  return {
    name: `EmpowerTours Passport - ${countryName}`,
    description: `Stakeable digital passport NFT for ${countryName}. Stake your passport to earn rewards and build your credit score. Collect venue stamps as you explore events. Unlock DeFi features and exclusive benefits. Part of a collection representing all 195 countries on Monad Testnet.`,
    image: imageDataURI, // SVG embedded as base64
    external_url: `https://fcempowertours-production-6551.up.railway.app/passport/${tokenId}`,
    attributes: [
      {
        trait_type: 'Country',
        value: countryName,
      },
      {
        trait_type: 'Country Code',
        value: countryCode,
      },
      {
        trait_type: 'Continent',
        value: country?.continent || 'Unknown',
      },
      {
        trait_type: 'Region',
        value: country?.region || 'Unknown',
      },
      {
        trait_type: 'Type',
        value: 'Stakeable NFT',
      },
      {
        trait_type: 'Features',
        value: 'Staking, Credit Score, Venue Stamps',
      },
      {
        trait_type: 'Token ID',
        value: tokenId.toString(),
      },
      {
        trait_type: 'Mint Date',
        value: new Date().toISOString().split('T')[0],
      },
      {
        trait_type: 'Network',
        value: 'Monad Testnet',
      },
      {
        trait_type: 'Collection',
        value: '195 Countries',
      },
    ],
  };
}

// Validate country code
export function isValidCountryCode(code: string): boolean {
  return getCountryByCode(code) !== undefined;
}
