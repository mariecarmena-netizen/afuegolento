import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const db = new PGlite();
const bookId = 'a'.repeat(64);
beforeAll(async () => {
  await db.exec('create role anon; create role authenticated; create role service_role;');
  await db.exec(await readFile(new URL('../supabase/schema.sql', import.meta.url), 'utf8'));
  await db.query('insert into recipe_books(id, payload) values ($1, $2)', [bookId, 'encrypted-book']);
}, 30000);
afterAll(async () => { await db.close(); });
async function save(id: string, revision: number, payload: string | null, deleted = false) {
  const result = await db.query<{ result: { conflict: boolean; revision?: number } }>('select save_recipe($1, $2, $3, $4, $5) as result', [bookId, id, payload, revision, deleted]);
  return result.rows[0].result;
}
describe('Esquema PostgreSQL de Supabase', () => {
  it('guarda una receta y rechaza una actualización con una versión antigua', async () => {
    expect(await save('recipe-1', 0, 'first')).toEqual({ conflict: false, revision: 1 });
    expect(await save('recipe-1', 1, 'second')).toEqual({ conflict: false, revision: 2 });
    expect(await save('recipe-1', 1, 'stale')).toEqual({ conflict: true });
    expect((await db.query<{ payload: string }>('select payload from recipes where id = $1', ['recipe-1'])).rows[0].payload).toBe('second');
  });
  it('marca una eliminación y no permite recrear la receta con la versión cero', async () => {
    await save('recipe-2', 0, 'first');
    expect(await save('recipe-2', 1, null, true)).toEqual({ conflict: false, revision: 2 });
    expect(await save('recipe-2', 0, 'resurrected')).toEqual({ conflict: true });
    expect((await db.query<{ deleted: boolean }>('select deleted from recipes where id = $1', ['recipe-2'])).rows[0].deleted).toBe(true);
  });
  it('impide leer tablas y ejecutar la función con el rol público', async () => {
    await db.exec('set role anon');
    try {
      await expect(db.query('select * from recipe_books')).rejects.toThrow('permission denied');
      await expect(db.query('select * from recipes')).rejects.toThrow('permission denied');
      await expect(save('unauthorized', 0, 'no')).rejects.toThrow('permission denied');
    } finally { await db.exec('reset role'); }
  });
});
