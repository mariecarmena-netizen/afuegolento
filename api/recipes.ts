import { database, ensureBook } from '../server/supabase';
import { bookId, fail, HttpError, json, readBody, type Request, type Response } from '../server/http';

export default async function handler(req: Request, res: Response): Promise<void> {
  try {
    const book = bookId(req);
    await ensureBook(book);
    if (req.method === 'GET') {
      const url = new URL(req.url ?? '/', 'https://afuegolento.local');
      const recipeId = url.searchParams.get('id');
      if (recipeId) {
        if (!/^[a-zA-Z0-9-]{1,100}$/.test(recipeId)) throw new HttpError(400, 'La receta no es válida.');
        const rows = await database<unknown[]>(`recipes?book_id=eq.${book}&id=eq.${recipeId}&select=id,payload,revision,deleted,sequence`);
        if (!rows.length) throw new HttpError(404, 'La receta no existe.');
        json(res, 200, rows[0]);
        return;
      }
      const after = url.searchParams.get('after') ?? '0';
      if (!/^\d{1,16}$/.test(after)) throw new HttpError(400, 'El cursor no es válido.');
      const rows = await database(`recipes?book_id=eq.${book}&sequence=gt.${after}&select=id,revision,deleted,sequence&order=sequence.asc&limit=100`);
      json(res, 200, rows);
    } else if (req.method === 'PUT') {
      const body = await readBody(req);
      if (typeof body.id !== 'string' || !/^[a-zA-Z0-9-]{1,100}$/.test(body.id) || typeof body.deleted !== 'boolean'
        || !Number.isSafeInteger(body.revision) || Number(body.revision) < 0
        || (!body.deleted && (typeof body.payload !== 'string' || body.payload.length > 3300000))) throw new HttpError(400, 'La receta no es válida.');
      const result = await database<{ conflict: boolean; revision: number }>('rpc/save_recipe', { method: 'POST', body: JSON.stringify({
        p_book_id: book, p_id: body.id, p_payload: body.deleted ? null : body.payload,
        p_expected_revision: body.revision, p_deleted: body.deleted,
      }) });
      json(res, result.conflict ? 409 : 200, result);
    } else throw new HttpError(405, 'Método no permitido.');
  } catch (error) { fail(res, error); }
}
