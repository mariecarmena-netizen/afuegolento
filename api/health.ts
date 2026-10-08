import { checkDatabase, configured } from '../server/database.js';
import { fail, json, type Request, type Response } from '../server/http.js';

export default async function handler(req: Request, res: Response): Promise<void> {
  if (req.method !== 'GET') { json(res, 405, { error: 'Método no permitido.' }); return; }
  try {
    if (configured()) await checkDatabase();
    json(res, 200, { configured: configured() });
  } catch (error) { fail(res, error); }
}
