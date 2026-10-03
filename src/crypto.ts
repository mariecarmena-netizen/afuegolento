import { normalizeCode } from './model';

const encoder = new TextEncoder();
async function encryptionKey(code: string) {
  const hash = await crypto.subtle.digest('SHA-256', encoder.encode(`afuegolento:encryption:v1:${normalizeCode(code)}`));
  return crypto.subtle.importKey('raw', hash, 'AES-GCM', false, ['encrypt', 'decrypt']);
}
function base64(bytes: Uint8Array): string {
  let result = '';
  for (let i = 0; i < bytes.length; i += 8192) result += String.fromCharCode(...bytes.subarray(i, i + 8192));
  return btoa(result);
}
export async function encrypt(value: unknown, code: string, context: string): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: encoder.encode(context) }, await encryptionKey(code), encoder.encode(JSON.stringify(value)));
  return `${base64(iv)}.${base64(new Uint8Array(ciphertext))}`;
}
export async function decrypt<T>(payload: string, code: string, context: string): Promise<T> {
  const [iv, ciphertext] = payload.split('.').map(part => Uint8Array.from(atob(part), c => c.charCodeAt(0)));
  const plaintext = await crypto.subtle.decrypt({ name: 'AES-GCM', iv, additionalData: encoder.encode(context) }, await encryptionKey(code), ciphertext);
  return JSON.parse(new TextDecoder().decode(plaintext)) as T;
}
