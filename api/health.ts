import { configured } from '../server/supabase';
import { json, type Request, type Response } from '../server/http';

export default function handler(req: Request, res: Response): void {
  if (req.method !== 'GET') { json(res, 405, { error: 'Método no permitido.' }); return; }
  json(res, 200, { configured: configured() });
}
