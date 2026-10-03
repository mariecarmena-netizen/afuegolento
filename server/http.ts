import { createHash } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';

export type Request = IncomingMessage & { body?: unknown };
export type Response = ServerResponse;
export function json(res: Response, status: number, body: unknown): void {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(body));
}
export function bookId(req: Request): string {
  const code = req.headers.authorization?.replace(/^Bearer /, '').toUpperCase().replace(/[\s-]/g, '') ?? '';
  if (!/^[A-HJ-NP-Z2-9]{24}$/.test(code)) throw new HttpError(401, 'La clave del libro no es válida.');
  return createHash('sha256').update(`afuegolento:book:v1:${code}`).digest('hex');
}
export class HttpError extends Error { constructor(public status: number, message: string) { super(message); } }
export async function readBody(req: Request): Promise<Record<string, unknown>> {
  let body = req.body;
  if (body === undefined) {
    let text = '';
    for await (const chunk of req) {
      text += chunk.toString();
      if (Buffer.byteLength(text) > 3500000) throw new HttpError(413, 'La receta contiene demasiadas fotos.');
    }
    try { body = JSON.parse(text); } catch { throw new HttpError(400, 'Los datos no son válidos.'); }
  }
  if (typeof body === 'string') {
    if (Buffer.byteLength(body) > 3500000) throw new HttpError(413, 'La receta contiene demasiadas fotos.');
    try { body = JSON.parse(body); } catch { throw new HttpError(400, 'Los datos no son válidos.'); }
  }
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new HttpError(400, 'Los datos no son válidos.');
  return body as Record<string, unknown>;
}
export function fail(res: Response, error: unknown): void {
  const status = error instanceof HttpError ? error.status : 500;
  json(res, status, { error: error instanceof HttpError ? error.message : 'No se ha podido conectar con el libro. Inténtalo de nuevo.' });
}
