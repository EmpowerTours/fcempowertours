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

export async function getItem(key: string): Promise<unknown> {
  return localforage.getItem(key);
}

export async function setItem(key: string, data: unknown): Promise<void> {
  await localforage.setItem(key, data);
}

export async function saveItineraryDraft(draft: unknown): Promise<void> {
  const key = await generateKey();
  const draftStr = JSON.stringify(draft);
  const { encrypted, iv } = await encryptData(draftStr, key);
  // Note: CryptoKey can't be stored directly; serialize/export if needed (e.g., to JSON via subtle.exportKey)
  const exportedKey = await crypto.subtle.exportKey('raw', key);
  await setItem('itinerary-draft', {
    encrypted: Array.from(new Uint8Array(encrypted as ArrayBuffer)),
    iv: Array.from(new Uint8Array(iv as ArrayBuffer)),
    key: Array.from(new Uint8Array(exportedKey as ArrayBuffer))
  });
}
