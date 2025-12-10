// MUST load env BEFORE importing redis-dependent modules
import { config } from 'dotenv';
config({ path: '.env.local' });

// Now import after env is loaded
import { createShortUrl, getFullUrl } from '../lib/url-shortener';

async function test() {
  console.log('🧪 Testing URL Shortener...\n');

  // Test with a long OG URL (similar to what fails in production)
  const longUrl = 'https://fcempowertours-production-6551.up.railway.app/api/og/music?tokenId=7&imageUrl=https%3A%2F%2Fharlequin-used-hare-224.mypinata.cloud%2Fipfs%2FQmWBnWTiiXzKQnxqPQg9iwBnJNwXqfad9wWSNa427H6wxo&title=MARINA&artist=0x33ffccb1802e13a7eead232bcd4706a2269582b0&price=1000';

  console.log('📏 Original URL length:', longUrl.length, 'bytes');
  console.log('📏 Exceeds 256 byte limit:', longUrl.length > 256, '\n');

  // Create short URL
  console.log('🔗 Creating short URL...');
  const shortId = await createShortUrl(longUrl);

  if (!shortId) {
    console.error('❌ Failed to create short URL');
    process.exit(1);
  }

  const shortUrl = `https://fcempowertours-production-6551.up.railway.app/api/s/${shortId}`;
  console.log('✅ Short URL:', shortUrl);
  console.log('📏 Short URL length:', shortUrl.length, 'bytes');
  console.log('📏 Under 256 byte limit:', shortUrl.length <= 256, '\n');

  // Retrieve and verify
  console.log('🔍 Retrieving full URL from short ID...');
  const retrieved = await getFullUrl(shortId);

  if (retrieved === longUrl) {
    console.log('✅ URL retrieval successful - matches original!');
  } else {
    console.error('❌ URL mismatch!');
    console.error('Expected:', longUrl);
    console.error('Got:', retrieved);
    process.exit(1);
  }

  console.log('\n✅ All tests passed!');
}

test().catch(console.error);
