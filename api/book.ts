import { createBook, getBook } from '../server/database.js';
import { bookId, fail, HttpError, json, readBody, type Request, type Response } from '../server/http.js';

export default async function handler(req: Request, res: Response): Promise<void> {
  try {
    const id = bookId(req);
    if (req.method === 'POST') {
      const body = await readBody(req);
      if (typeof body.payload !== 'string' || body.payload.length > 3000) throw new HttpError(400, 'El libro no es válido.');
      await createBook(id, body.payload);
    } else if (req.method !== 'GET') throw new HttpError(405, 'Método no permitido.');
    const book = await getBook(id);
    if (!book) throw new HttpError(404, 'No existe un libro con esa clave. Revisa la clave o sincroniza el dispositivo original.');
    json(res, 200, book);
  } catch (error) { fail(res, error); }
}
