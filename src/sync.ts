import { decrypt, encrypt } from './crypto';
import { formatCode, isRecipe, validCode, type Book, type Recipe } from './model';
import { acknowledgeEntry, getCachedBook, getEntries, getEntry, mergeRemote, setBook } from './storage';

export type SyncStatus = 'local' | 'syncing' | 'synced' | 'offline' | 'error';
type RemoteRecipe = { id: string; revision: number; sequence: number; deleted: boolean; payload?: string };
export class ApiError extends Error { constructor(public status: number, message: string) { super(message); } }
async function request<T>(path: string, code?: string, body?: unknown): Promise<T> {
  const response = await fetch(`/api/${path}`, {
    method: body === undefined ? 'GET' : path === 'book' ? 'POST' : 'PUT',
    headers: { ...(code ? { Authorization: `Bearer ${code}` } : {}), ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    cache: 'no-store', signal: AbortSignal.timeout(20000),
  });
  let data: { error?: string };
  try { data = await response.json(); }
  catch { throw new ApiError(response.status || 502, 'El servidor de sincronización no responde correctamente. Tus recetas siguen guardadas en este dispositivo.'); }
  if (!response.ok) throw new ApiError(response.status, data.error ?? 'No se ha podido sincronizar el libro.');
  return data as T;
}
export async function cloudConfigured(): Promise<boolean> {
  return (await request<{ configured: boolean }>('health')).configured;
}
export async function openCloudBook(rawCode: string): Promise<Book> {
  if (!validCode(rawCode)) throw new Error('La clave tiene cuatro grupos de seis caracteres.');
  const code = formatCode(rawCode);
  const cached = await getCachedBook(code);
  if (cached) { await setBook(cached); return cached; }
  const response = await request<{ payload: string }>('book', code);
  const info = await decrypt<{ name: string; createdAt: string }>(response.payload, code, 'book');
  if (typeof info.name !== 'string' || typeof info.createdAt !== 'string') throw new Error('El libro no es válido.');
  const book = { ...info, code };
  await setBook(book);
  return book;
}
export async function syncBook(book: Book): Promise<{ conflicts: number }> {
  await request('book', book.code, { payload: await encrypt({ name: book.name, createdAt: book.createdAt }, book.code, 'book') });
  let after = 0;
  let conflicts = 0;
  // Each pass scans metadata again so commits arriving out of sequence are picked up on the next pass.
  for (;;) {
    const page = await request<RemoteRecipe[]>(`recipes?after=${after}`, book.code);
    for (const metadata of page) {
      after = Math.max(after, metadata.sequence);
      const local = await getEntry(book.code, metadata.id);
      if (local?.revision === metadata.revision) continue;
      const remote = await request<RemoteRecipe>(`recipes?id=${metadata.id}`, book.code);
      const recipe = remote.deleted ? undefined : await decrypt<Recipe>(remote.payload!, book.code, remote.id);
      if (recipe && (!isRecipe(recipe) || recipe.id !== remote.id)) throw new Error('Una receta del libro no es válida.');
      conflicts += await mergeRemote(book.code, remote.id, remote.revision, remote.deleted, recipe);
    }
    if (page.length < 100) break;
  }
  for (const entry of (await getEntries(book.code)).filter(e => e.pending)) {
    const body = { id: entry.recipe.id, revision: entry.revision, deleted: entry.deleted,
      payload: entry.deleted ? null : await encrypt(entry.recipe, book.code, entry.recipe.id) };
    try {
      const result = await request<{ revision: number }>('recipes', book.code, body);
      await acknowledgeEntry(entry, result.revision);
    } catch (error) {
      if (error instanceof ApiError && error.status === 409) throw new Error('Otro dispositivo acaba de editar una receta. Vuelve a sincronizar para conservar ambas versiones.');
      throw error;
    }
  }
  return { conflicts };
}
