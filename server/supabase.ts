import { HttpError } from './http';

export function configured(): boolean { return !!(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY); }
export async function database<T>(path: string, init: RequestInit = {}): Promise<T> {
  if (!configured()) throw new HttpError(503, 'La sincronización todavía no está configurada. Tu libro sigue guardado en este dispositivo.');
  const response = await fetch(`${process.env.SUPABASE_URL!.replace(/\/$/, '')}/rest/v1/${path}`, {
    ...init,
    headers: { apikey: process.env.SUPABASE_SERVICE_ROLE_KEY!, Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY!}`,
      'Content-Type': 'application/json', ...init.headers },
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) throw new HttpError(502, 'No se ha podido sincronizar. Comprueba la configuración de Supabase.');
  const text = await response.text();
  return text ? JSON.parse(text) as T : undefined as T;
}
export async function ensureBook(id: string): Promise<void> {
  const rows = await database<{ id: string }[]>(`recipe_books?id=eq.${id}&select=id`);
  if (!rows.length) throw new HttpError(404, 'No existe un libro con esa clave. Revisa la clave o sincroniza el dispositivo original.');
}
