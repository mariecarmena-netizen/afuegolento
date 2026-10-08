import { ensureBook, getRecipe, listRecipes, saveRecipe } from '../server/database.js';
import { bookId, fail, HttpError, json, readBody, type Request, type Response } from '../server/http.js';

export default async function handler(req: Request, res: Response): Promise<void> {
  try {
    const book = bookId(req);
    await ensureBook(book);
    if (req.method === 'GET') {
      const url = new URL(req.url ?? '/', 'https://afuegolento.local');
      const recipeId = url.searchParams.get('id');
      if (recipeId) {
        if (!/^[a-zA-Z0-9-]{1,100}$/.test(recipeId)) throw new HttpError(400, 'La receta no es válida.');
        const recipe = await getRecipe(book, recipeId);
        if (!recipe) throw new HttpError(404, 'La receta no existe.');
        json(res, 200, recipe);
        return;
      }
      const after = url.searchParams.get('after') ?? '0';
      if (!/^\d{1,16}$/.test(after) || !Number.isSafeInteger(Number(after))) throw new HttpError(400, 'El cursor no es válido.');
      const rows = await listRecipes(book, Number(after));
      json(res, 200, rows);
    } else if (req.method === 'PUT') {
      const body = await readBody(req);
      if (typeof body.id !== 'string' || !/^[a-zA-Z0-9-]{1,100}$/.test(body.id) || typeof body.deleted !== 'boolean'
        || !Number.isSafeInteger(body.revision) || Number(body.revision) < 0
        || (!body.deleted && (typeof body.payload !== 'string' || body.payload.length > 3300000))) throw new HttpError(400, 'La receta no es válida.');
      const result = await saveRecipe(book, { id: body.id, payload: body.deleted ? null : body.payload as string,
        revision: body.revision as number, deleted: body.deleted });
      json(res, result.conflict ? 409 : 200, result);
    } else throw new HttpError(405, 'Método no permitido.');
  } catch (error) { fail(res, error); }
}
