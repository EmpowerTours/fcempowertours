/**
 * Upload file to IPFS via Pinata
 * Returns IPFS hash
 */
export async function uploadToIPFS(file: File): Promise<string> {
  const formData = new FormData();
  formData.append('file', file);

  const response = await fetch('/api/upload-pinata', {
    method: 'POST',
    body: formData,
  });

  if (!response.ok) {
    throw new Error('Failed to upload to IPFS');
  }

  const data = await response.json();
  return data.ipfsHash;
}

/**
 * Upload JSON metadata to IPFS
 */
export async function uploadJSONToIPFS(metadata: any): Promise<string> {
  const blob = new Blob([JSON.stringify(metadata)], { type: 'application/json' });
  const file = new File([blob], 'metadata.json');
  return uploadToIPFS(file);
}
