import { neon } from '@neondatabase/serverless';
import { database as supabase, configured as supabaseConfigured } from './supabase.js';
import { HttpError } from './http.js';

export type RemoteRecipe = { id: string; revision: number; deleted: boolean; sequence: number; payload?: string | null };
export type SaveRecipe = { id: string; revision: number; deleted: boolean; payload: string | null };
export type SaveResult = { conflict: boolean; revision?: number };

export function connectionString(): string | undefined {
  return process.env.DATABASE_URL || process.env.POSTGRES_URL || process.env.POSTGRES_PRISMA_URL;
}
export function configured(): boolean { return !!connectionString() || supabaseConfigured(); }

async function query<T>(sql: string, parameters: unknown[] = []): Promise<T[]> {
  const url = connectionString();
  if (!url) throw new HttpError(503, 'La sincronización todavía no está configurada. Tu libro sigue guardado en este dispositivo.');
  try {
    return await neon(url).query(sql, parameters, { fetchOptions: { signal: AbortSignal.timeout(15000) } }) as T[];
  } catch (error) {
    if ((error as { code?: string })?.code === '42P01' || (error as { code?: string })?.code === '42883') {
      throw new HttpError(503, 'Falta preparar la base de datos de Neon. Ejecuta neon/schema.sql y vuelve a sincronizar.');
    }
    throw new HttpError(502, 'No se ha podido conectar con Neon. Revisa la conexión de la base de datos en el servidor.');
  }
}

export async function checkDatabase(): Promise<void> {
  if (connectionString()) {
    await query('select id from public.recipe_books limit 0');
    await query('select id from public.recipes limit 0');
    const [schema] = await query<{ ready: boolean }>("select to_regprocedure('public.save_recipe(text,text,text,bigint,boolean)') is not null as ready");
    if (!schema.ready) throw new HttpError(503, 'Falta preparar la base de datos de Neon. Ejecuta neon/schema.sql y vuelve a sincronizar.');
  } else {
    await supabase('recipe_books?select=id&limit=1');
  }
}
export async function getBook(id: string): Promise<{ payload: string } | undefined> {
  const rows = connectionString()
    ? await query<{ payload: string }>('select payload from public.recipe_books where id = $1', [id])
    : await supabase<{ payload: string }[]>(`recipe_books?id=eq.${id}&select=payload`);
  return rows[0];
}
export async function createBook(id: string, payload: string): Promise<void> {
  if (connectionString()) {
    await query('insert into public.recipe_books(id, payload) values ($1, $2) on conflict (id) do nothing', [id, payload]);
  } else {
    await supabase('recipe_books?on_conflict=id', { method: 'POST', headers: { Prefer: 'resolution=ignore-duplicates' }, body: JSON.stringify({ id, payload }) });
  }
}
export async function ensureBook(id: string): Promise<void> {
  if (!await getBook(id)) throw new HttpError(404, 'No existe un libro con esa clave. Revisa la clave o sincroniza el dispositivo original.');
}
function normalizeRecipe(row: RemoteRecipe): RemoteRecipe {
  const revision = Number(row.revision);
  const sequence = Number(row.sequence);
  if (!Number.isSafeInteger(revision) || !Number.isSafeInteger(sequence)) throw new HttpError(502, 'La versión de una receta no es válida.');
  return { ...row, revision, sequence };
}
export async function getRecipe(book: string, id: string): Promise<RemoteRecipe | undefined> {
  const rows = connectionString()
    ? await query<RemoteRecipe>('select id, payload, revision, deleted, sequence from public.recipes where book_id = $1 and id = $2', [book, id])
    : await supabase<RemoteRecipe[]>(`recipes?book_id=eq.${book}&id=eq.${id}&select=id,payload,revision,deleted,sequence`);
  return rows[0] && normalizeRecipe(rows[0]);
}
export async function listRecipes(book: string, after: number): Promise<RemoteRecipe[]> {
  const rows = connectionString()
    ? await query<RemoteRecipe>('select id, revision, deleted, sequence from public.recipes where book_id = $1 and sequence > $2 order by sequence asc limit 100', [book, after])
    : await supabase<RemoteRecipe[]>(`recipes?book_id=eq.${book}&sequence=gt.${after}&select=id,revision,deleted,sequence&order=sequence.asc&limit=100`);
  return rows.map(normalizeRecipe);
}
export async function saveRecipe(book: string, recipe: SaveRecipe): Promise<SaveResult> {
  const parameters = { p_book_id: book, p_id: recipe.id, p_payload: recipe.payload, p_expected_revision: recipe.revision, p_deleted: recipe.deleted };
  const result = connectionString()
    ? (await query<{ result: SaveResult }>('select public.save_recipe($1, $2, $3, $4, $5) as result', Object.values(parameters)))[0].result
    : await supabase<SaveResult>('rpc/save_recipe', { method: 'POST', body: JSON.stringify(parameters) });
  return result.revision === undefined ? result : { ...result, revision: Number(result.revision) };
}
