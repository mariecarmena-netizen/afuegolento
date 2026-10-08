import 'fake-indexeddb/auto';
import { readFile } from 'node:fs/promises';
import { openDB } from 'idb';
import { PGlite } from '@electric-sql/pglite';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import bookHandler from '../api/book';
import recipeHandler from '../api/recipes';
import healthHandler from '../api/health';
import { createBookCode, newRecipe } from '../src/model';
import { cloudConfigured, openCloudBook, syncBook } from '../src/sync';
import { getEntries, getEntry, saveLocal } from '../src/storage';
import { encrypt } from '../src/crypto';
import type { Request, Response as ServerResponse } from './http';

const transport = vi.hoisted(() => ({ query: vi.fn() }));
vi.mock('@neondatabase/serverless', () => ({ neon: () => ({ query: transport.query }) }));
const db = new PGlite();
beforeAll(async () => {
  await db.exec(await readFile(new URL('../neon/schema.sql', import.meta.url), 'utf8'));
}, 30000);
afterAll(async () => { await db.close(); });
beforeEach(() => {
  vi.stubEnv('DATABASE_URL', 'postgresql://owner:test-secret@database.neon.tech/neondb');
  transport.query.mockReset().mockImplementation(async (sql: string, parameters: unknown[]) => (await db.query(sql, parameters)).rows);
});
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

async function call(handler: typeof bookHandler, method: string, body?: unknown, code?: string, url = '/') {
  let data: unknown;
  const req = { method, body, headers: { ...(code ? { authorization: `Bearer ${code}` } : {}) }, url } as Request;
  const res = { statusCode: 200, setHeader: vi.fn(), end: (value: string) => { data = JSON.parse(value); } } as unknown as ServerResponse;
  await handler(req, res);
  return { status: res.statusCode, data };
}
function useAppAPI() {
  vi.stubGlobal('fetch', vi.fn(async (path: string, init?: RequestInit) => {
    const url = new URL(path, 'https://recetario.test');
    const handler = url.pathname === '/api/book' ? bookHandler : url.pathname === '/api/recipes' ? recipeHandler : healthHandler;
    const code = new Headers(init?.headers).get('Authorization')?.replace('Bearer ', '');
    const result = await call(handler, init?.method ?? 'GET', init?.body, code, `${url.pathname}${url.search}`);
    return Response.json(result.data, { status: result.status });
  }));
}

describe('Sincronización con PostgreSQL de Neon', () => {
  it('sube un libro local y permite abrir sus recetas y fotos desde un dispositivo sin caché', async () => {
    useAppAPI();
    const book = { code: createBookCode(), name: 'Mi recetario', createdAt: new Date().toISOString() };
    const recipe = { ...newRecipe(), title: 'Tortilla', photos: ['data:image/png;base64,aGVsbG8='] };
    await saveLocal(book.code, recipe);
    expect(await cloudConfigured()).toBe(true);
    await syncBook(book);
    expect((await getEntry(book.code, recipe.id))?.pending).toBe(false);
    const stored = (await db.query<{ book_id: string; payload: string }>('select book_id, payload from recipes where id = $1', [recipe.id])).rows[0];
    expect(stored.book_id).toMatch(/^[a-f0-9]{64}$/);
    expect(stored.payload).not.toContain(recipe.title);
    expect(stored.payload).not.toContain(recipe.photos[0]);

    // Un segundo dispositivo empieza sin el libro ni las recetas en IndexedDB.
    const browserDB = await openDB('afuegolento');
    await browserDB.clear('recipes');
    await browserDB.clear('meta');
    browserDB.close();
    const opened = await openCloudBook(book.code.toLowerCase().replaceAll('-', ' '));
    expect(opened).toEqual(book);
    await syncBook(opened);
    expect((await getEntries(opened.code)).map(entry => entry.recipe)).toEqual([recipe]);

    const updated = { ...recipe, title: 'Tortilla editada en el otro dispositivo' };
    await call(recipeHandler, 'PUT', { id: recipe.id, revision: 1, deleted: false, payload: await encrypt(updated, book.code, recipe.id) }, book.code);
    await syncBook(opened);
    expect((await getEntry(book.code, recipe.id))?.recipe.title).toBe(updated.title);
    expect((await call(recipeHandler, 'PUT', { id: recipe.id, revision: 1, deleted: false, payload: 'stale' }, book.code)).status).toBe(409);
    await call(recipeHandler, 'PUT', { id: recipe.id, revision: 2, deleted: true, payload: null }, book.code);
    await syncBook(opened);
    expect((await getEntry(book.code, recipe.id))?.deleted).toBe(true);
  });

  it('aísla los libros y no crea un libro al introducir una clave inexistente', async () => {
    const owner = createBookCode();
    const stranger = createBookCode();
    await call(bookHandler, 'POST', { payload: 'encrypted-book' }, owner);
    await call(recipeHandler, 'PUT', { id: 'private-recipe', revision: 0, deleted: false, payload: 'encrypted-recipe' }, owner);
    expect((await call(bookHandler, 'GET', undefined, stranger)).status).toBe(404);
    await call(bookHandler, 'POST', { payload: 'another-book' }, stranger);
    expect((await call(recipeHandler, 'GET', undefined, stranger, '/api/recipes?id=private-recipe')).status).toBe(404);
    expect((await call(recipeHandler, 'GET', undefined, stranger, '/api/recipes?after=0')).data).toEqual([]);
    expect(transport.query.mock.calls.every(([, parameters]) => !JSON.stringify(parameters).includes(owner))).toBe(true);
  });

  it('normaliza los bigint del controlador para que el cursor y las revisiones sean números', async () => {
    transport.query.mockResolvedValueOnce([{ payload: 'book' }]).mockResolvedValueOnce([{ id: 'recipe', revision: '2', sequence: '123', deleted: false }]);
    expect(await call(recipeHandler, 'GET', undefined, createBookCode(), '/api/recipes?after=0')).toEqual({ status: 200, data: [{ id: 'recipe', revision: 2, sequence: 123, deleted: false }] });
  });

  it('informa si falta el esquema o falla la conexión sin revelar credenciales', async () => {
    transport.query.mockRejectedValueOnce({ code: '42P01' });
    expect(await call(healthHandler, 'GET')).toEqual({ status: 503, data: { error: expect.stringContaining('neon/schema.sql') } });
    transport.query.mockRejectedValueOnce(new Error('postgresql://owner:test-secret@database.neon.tech/neondb'));
    const result = await call(healthHandler, 'GET');
    expect(result.status).toBe(502);
    expect(JSON.stringify(result.data)).not.toContain('test-secret');
  });

  it('acepta las variables de la integración de Vercel y parametriza los datos enviados', async () => {
    vi.stubEnv('DATABASE_URL', '');
    vi.stubEnv('POSTGRES_URL', 'postgresql://owner:test-secret@database.neon.tech/neondb');
    const payload = "cifrado con ' comillas";
    expect((await call(bookHandler, 'POST', { payload }, createBookCode())).status).toBe(200);
    expect(transport.query.mock.calls[0][0]).not.toContain(payload);
    expect(transport.query.mock.calls[0][1][1]).toBe(payload);
  });
});
