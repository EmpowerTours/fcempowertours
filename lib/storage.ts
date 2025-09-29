interface ItineraryDraft {
  prompt?: string;
  itinerary?: string;
  destination?: string;
  interests?: string;
  climbingPhoto?: string | null;
  climbingGrade?: string;
}

export async function generateKey(): Promise<CryptoKey> {
  return crypto.subtle.generateKey(
    { name: 'AES-GCM', length: 256 },
    true,
    ['encrypt', 'decrypt']
  );
}

export async function encryptData(data: ItineraryDraft, key: CryptoKey): Promise<{ iv: Uint8Array; encrypted: ArrayBuffer }> {
  const enc = new TextEncoder();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    enc.encode(JSON.stringify(data))
  );
  return { iv, encrypted };
}

export async function decryptData(encryptedData: ArrayBuffer, key: CryptoKey, iv: Uint8Array): Promise<ItineraryDraft> {
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
