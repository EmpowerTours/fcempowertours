import { ItineraryDraft } from '@/types';

export async function generateKey(): Promise<CryptoKey> {
  return crypto.subtle.generateKey(
    { name: 'AES-GCM', length: 256 },
    true,
    ['encrypt', 'decrypt']
  );
}

export async function encryptData(data: ItineraryDraft['data'], key: CryptoKey): Promise<{ iv: string; encrypted: string }> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const enc = new TextEncoder();
  const encrypted = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    enc.encode(JSON.stringify(data))
  );
  return {
    iv: Buffer.from(iv).toString('hex'),
    encrypted: Buffer.from(encrypted).toString('hex'),
  };
}

export async function decryptData(encryptedData: ArrayBuffer, key: CryptoKey, iv: Uint8Array): Promise<ItineraryDraft['data']> {
  const dec = new TextDecoder();
  const decrypted = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv },
    key,
    encryptedData
  );
  return JSON.parse(dec.decode(decrypted));
}

export function saveItineraryDraft(id: string, data: ItineraryDraft): void {
  localStorage.setItem(`itinerary-${id}`, JSON.stringify(data));
}

export function getItineraryDraft(id: string): ItineraryDraft | null {
  const data = localStorage.getItem(`itinerary-${id}`);
  return data ? JSON.parse(data) : null;
}
