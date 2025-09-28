export async function generateKey() {
  return crypto.subtle.generateKey(
    { name: 'AES-GCM', length: 256 },
    true,
    ['encrypt', 'decrypt']
  );
}

export async function encryptData(data, key) {
  const enc = new TextEncoder();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    enc.encode(JSON.stringify(data))
  );
  return { iv, encrypted };
}

export async function decryptData(encryptedData, key, iv) {
  const dec = new TextDecoder();
  const decrypted = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv },
    key,
    encryptedData
  );
  return JSON.parse(dec.decode(decrypted));
}

export function saveItineraryDraft(id, data) {
  localStorage.setItem(`itinerary-${id}`, JSON.stringify(data));
}

export function getItineraryDraft(id) {
  const data = localStorage.getItem(`itinerary-${id}`);
  return data ? JSON.parse(data) : null;
}
