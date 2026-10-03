import { database, ensureBook } from '../server/supabase';
import { bookId, fail, HttpError, json, readBody, type Request, type Response } from '../server/http';

export default async function handler(req: Request, res: Response): Promise<void> {
  try {
    const id = bookId(req);
    if (req.method === 'POST') {
      const body = await readBody(req);
      if (typeof body.payload !== 'string' || body.payload.length > 3000) throw new HttpError(400, 'El libro no es válido.');
      await database('recipe_books?on_conflict=id', { method: 'POST', headers: { Prefer: 'resolution=ignore-duplicates' }, body: JSON.stringify({ id, payload: body.payload }) });
    } else if (req.method !== 'GET') throw new HttpError(405, 'Método no permitido.');
    await ensureBook(id);
    const rows = await database<{ payload: string }[]>(`recipe_books?id=eq.${id}&select=payload`);
    json(res, 200, rows[0]);
  } catch (error) { fail(res, error); }
}
