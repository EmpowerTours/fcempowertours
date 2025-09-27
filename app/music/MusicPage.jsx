import { createHeliaHTTP } from '@helia/http';
import { unixfs } from '@helia/unixfs';
// ... other imports

const uploadToPinata = async (file) => {
  if (!file) return null;
  const formData = new FormData();
  formData.append('file', file);
  const response = await fetch('https://api.pinata.cloud/pinning/pinFileToIPFS', {
    method: 'POST',
    headers: {
      pinata_api_key: process.env.NEXT_PUBLIC_PINATA_API_KEY,
      pinata_secret_api_key: process.env.NEXT_PUBLIC_PINATA_API_SECRET,
    },
    body: formData,
  });
  const data = await response.json();
  if (data.IpfsHash) {
    return `https://gateway.pinata.cloud/ipfs/${data.IpfsHash}`;
  } else {
    throw new Error('Upload failed');
  }
};
// Rest of file unchanged (Helia not directly needed for Pinata API; keeps compatibility)
