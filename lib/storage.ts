import localforage from 'localforage';

export async function generateKey(): Promise<CryptoKey> {
  return crypto.subtle.generateKey(
    {
      name: 'AES-GCM',
      length: 256,
    },
    true,
    ['encrypt', 'decrypt']
  );
}

export async function encryptData(data: string, key: CryptoKey): Promise<{ encrypted: ArrayBuffer; iv: BufferSource }> {
  const encoder = new TextEncoder();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: iv.buffer },
    key,
    encoder.encode(data)
  );
  return { encrypted, iv: iv.buffer };
}

export async function saveItineraryDraft(data: any): Promise<void> {
  await localforage.setItem('itinerary-draft', data);
}
