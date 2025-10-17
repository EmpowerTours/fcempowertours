import { ImageResponse } from 'next/og';

export const runtime = 'edge';
export const alt = 'EmpowerTours - Travel and Music NFTs';
export const size = {
  width: 1200,
  height: 630,
};
export const contentType = 'image/png';

export default async function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          height: '100%',
          width: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: '#353B48',
          backgroundImage: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
        }}
      >
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '20px',
          }}
        >
          <div
            style={{
              fontSize: 80,
              fontWeight: 'bold',
              color: 'white',
              textAlign: 'center',
            }}
          >
            🌍 EmpowerTours
          </div>
          <div
            style={{
              fontSize: 40,
              color: '#e0e0e0',
              textAlign: 'center',
              maxWidth: '900px',
            }}
          >
            Mint Travel Passports & Music NFTs
          </div>
          <div
            style={{
              fontSize: 30,
              color: '#c0c0c0',
              textAlign: 'center',
            }}
          >
            Powered by Monad & Farcaster
          </div>
        </div>
      </div>
    ),
    {
      ...size,
    }
  );
}
