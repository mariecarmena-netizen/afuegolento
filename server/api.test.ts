import { afterEach, describe, expect, it, vi } from 'vitest';
import bookHandler from '../api/book';
import recipeHandler from '../api/recipes';
import healthHandler from '../api/health';
import { createBookCode } from '../src/model';
import type { Request, Response } from './http';

afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });
async function call(handler: typeof bookHandler | typeof healthHandler, method: string, body?: unknown, code?: string, url = '/') {
  let data: unknown;
  const req = { method, body, headers: { ...(code ? { authorization: `Bearer ${code}` } : {}) }, url } as Request;
  const res = { statusCode: 200, setHeader: vi.fn(), end: (value: string) => { data = JSON.parse(value); } } as unknown as Response;
  await handler(req, res);
  return { status: res.statusCode, data };
}
describe('API de Vercel', () => {
  it('rechaza una petición sin clave antes de contactar con la base de datos', async () => {
    const fetchMock = vi.fn(); vi.stubGlobal('fetch', fetchMock);
    expect((await call(bookHandler, 'GET')).status).toBe(401);
    expect((await call(recipeHandler, 'GET')).status).toBe(401);
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it('informa de configuración pendiente sin revelar variables del servidor', async () => {
    vi.stubEnv('DATABASE_URL', ''); vi.stubEnv('POSTGRES_URL', ''); vi.stubEnv('POSTGRES_PRISMA_URL', '');
    vi.stubEnv('SUPABASE_URL', ''); vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', '');
    expect(await call(healthHandler, 'GET')).toEqual({ status: 200, data: { configured: false } });
    expect((await call(bookHandler, 'GET', undefined, createBookCode())).status).toBe(503);
  });
  it('solo expone un hash del libro a Supabase y controla conflictos al guardar', async () => {
    vi.stubEnv('DATABASE_URL', ''); vi.stubEnv('POSTGRES_URL', ''); vi.stubEnv('POSTGRES_PRISMA_URL', '');
    const code = createBookCode(); vi.stubEnv('SUPABASE_URL', 'https://database.test'); vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'test-server-secret');
    const fetchMock = vi.fn(async (url: string) => Response.json(url.includes('rpc/save_recipe') ? { conflict: true } : [{ id: 'book' }]));
    vi.stubGlobal('fetch', fetchMock);
    expect((await call(recipeHandler, 'PUT', { id: 'recipe-1', revision: 1, payload: 'encrypted', deleted: false }, code)).status).toBe(409);
    expect(fetchMock.mock.calls[0][0]).not.toContain(code);
    expect(fetchMock.mock.calls[0][0]).toMatch(/id=eq\.[a-f0-9]{64}/);
  });
});
