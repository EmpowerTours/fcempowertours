/**
 * Pinata IPFS Upload Utilities
 * Handles image and metadata uploads to IPFS via Pinata
 */

const PINATA_JWT = process.env.PINATA_JWT;
const PINATA_GATEWAY = process.env.PINATA_GATEWAY || 'harlequin-used-hare-224.mypinata.cloud';

/**
 * Upload a file to Pinata IPFS
 * @param file File to upload
 * @param name Optional file name
 * @returns IPFS hash (CID)
 */
export async function uploadToPinata(file: File, name?: string): Promise<string> {
  if (!PINATA_JWT) {
    throw new Error('PINATA_JWT environment variable not set');
  }

  const formData = new FormData();
  formData.append('file', file);

  if (name) {
    const metadata = JSON.stringify({ name });
    formData.append('pinataMetadata', metadata);
  }

  const res = await fetch('https://api.pinata.cloud/pinning/pinFileToIPFS', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${PINATA_JWT}`,
    },
    body: formData,
  });

  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(`Pinata upload failed: ${res.status} - ${errorText}`);
  }

  const data = await res.json();
  return data.IpfsHash;
}

/**
 * Upload JSON metadata to Pinata
 * @param metadata JSON object to upload
 * @param name Optional metadata name
 * @returns IPFS hash (CID)
 */
export async function uploadJSONToPinata(
  metadata: object,
  name?: string
): Promise<string> {
  if (!PINATA_JWT) {
    throw new Error('PINATA_JWT environment variable not set');
  }

  const body: any = {
    pinataContent: metadata,
  };

  if (name) {
    body.pinataMetadata = { name };
  }

  const res = await fetch('https://api.pinata.cloud/pinning/pinJSONToIPFS', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${PINATA_JWT}`,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(`Pinata JSON upload failed: ${res.status} - ${errorText}`);
  }

  const data = await res.json();
  return data.IpfsHash;
}

/**
 * Get IPFS URL from hash
 * @param ipfsHash IPFS CID
 * @param useGateway Use Pinata gateway (true) or ipfs:// protocol (false)
 * @returns Full IPFS URL
 */
export function getIPFSUrl(ipfsHash: string, useGateway = true): string {
  if (useGateway) {
    return `https://${PINATA_GATEWAY}/ipfs/${ipfsHash}`;
  }
  return `ipfs://${ipfsHash}`;
}

/**
 * Client-side upload helper (for use in browser)
 * This version can be used directly from React components
 */
export async function uploadImageToIPFS(file: File): Promise<{
  ipfsHash: string;
  gatewayUrl: string;
}> {
  // Call the API endpoint instead of direct Pinata upload
  // This keeps API keys secure on the server
  const formData = new FormData();
  formData.append('file', file);

  const res = await fetch('/api/upload-to-ipfs', {
    method: 'POST',
    body: formData,
  });

  if (!res.ok) {
    const error = await res.json();
    throw new Error(error.error || 'Upload failed');
  }

  const data = await res.json();
  return {
    ipfsHash: data.ipfsHash,
    gatewayUrl: data.url,
  };
}

/**
 * Validate file size and type for image uploads
 * @param file File to validate
 * @param maxSizeMB Maximum file size in MB
 * @returns Validation result
 */
export function validateImageFile(
  file: File,
  maxSizeMB = 10
): { valid: boolean; error?: string } {
  // Check file type
  const validTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
  if (!validTypes.includes(file.type)) {
    return {
      valid: false,
      error: 'Invalid file type. Please upload a JPEG, PNG, GIF, or WebP image.',
    };
  }

  // Check file size
  const maxBytes = maxSizeMB * 1024 * 1024;
  if (file.size > maxBytes) {
    return {
      valid: false,
      error: `File too large. Maximum size is ${maxSizeMB}MB.`,
    };
  }

  return { valid: true };
}
