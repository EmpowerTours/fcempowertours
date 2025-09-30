export async function encrypt(data: string, key: CryptoKey): Promise<{ encrypted: ArrayBuffer; iv: BufferSource }> {
  const encoder = new TextEncoder();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: iv.buffer },
    key,
    encoder.encode(data)
  );
  return { encrypted, iv: iv.buffer };
}
