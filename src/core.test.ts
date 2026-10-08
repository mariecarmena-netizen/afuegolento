import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createBookCode, isRecipe, newRecipe, normalizeCode, normalizeSearch, parseBackup, validCode } from './model';
import { decrypt, encrypt } from './crypto';
import { acknowledgeEntry, getEntries, getEntry, importRecipes, mergeRemote, saveLocal } from './storage';
import { openCloudBook, syncBook } from './sync';

afterEach(() => { vi.unstubAllGlobals(); });
function recipe(title = 'Tortilla de patata') { return { ...newRecipe(), title, ingredients: [{ id: 'patata', quantity: '500', unit: 'g', name: 'Patatas' }], steps: ['Cocina las patatas.'] }; }
describe('Claves y copias', () => {
  it('genera claves que se pueden pegar con espacios, guiones y minúsculas', () => {
    const code = createBookCode();
    expect(code).toMatch(/^[A-Z2-9]{6}(-[A-Z2-9]{6}){3}$/);
    expect(validCode(code.toLowerCase().replaceAll('-', ' '))).toBe(true);
    expect(normalizeCode(code)).toHaveLength(24);
    expect(createBookCode()).not.toBe(code);
    expect(validCode('123456')).toBe(false);
    expect(normalizeSearch('Albaháca')).toBe('albahaca');
  });
  it('restaura una copia válida y rechaza contenido incompatible o fotos inseguras', () => {
    const r = { ...recipe(), photos: ['data:image/png;base64,aGVsbG8='] };
    const backup = { format: 'afuegolento', version: 1, bookName: 'Mis recetas', exportedAt: new Date().toISOString(), recipes: [r] };
    expect(parseBackup(JSON.stringify(backup)).recipes[0].title).toBe(r.title);
    expect(parseBackup(JSON.stringify(backup)).recipes[0].photos).toEqual(r.photos);
    expect(() => parseBackup(JSON.stringify({ ...backup, recipes: [{ ...r, photos: ['javascript:alert(1)'] }] }))).toThrow();
    expect(() => parseBackup(JSON.stringify({ ...backup, version: 2 }))).toThrow();
    expect(isRecipe({ ...r, servings: 0 })).toBe(false);
  });
});
describe('Cifrado', () => {
  it('cifra recetas y fotos y requiere la misma clave y el mismo identificador para abrirlas', async () => {
    const code = createBookCode();
    const r = { ...recipe(), photos: ['data:image/png;base64,aGVsbG8='] };
    const payload = await encrypt(r, code, r.id);
    expect(payload).not.toContain(r.title);
    expect(await decrypt(payload, code.toLowerCase(), r.id)).toEqual(r);
    expect(await encrypt(r, code, r.id)).not.toBe(payload);
    await expect(decrypt(payload, createBookCode(), r.id)).rejects.toThrow();
    await expect(decrypt(payload, code, 'otro-id')).rejects.toThrow();
  });
});
describe('Almacenamiento y conflictos', () => {
  it('conserva una edición nueva hecha mientras la versión anterior se estaba subiendo', async () => {
    const code = createBookCode(); const r = recipe();
    await saveLocal(code, r);
    const snapshot = (await getEntry(code, r.id))!;
    await saveLocal(code, { ...r, title: 'Tortilla nueva' });
    await acknowledgeEntry(snapshot, 1);
    const current = (await getEntry(code, r.id))!;
    expect(current.recipe.title).toBe('Tortilla nueva'); expect(current.pending).toBe(true); expect(current.revision).toBe(1);
  });
  it('conserva las dos versiones de una receta editada en dos dispositivos', async () => {
    const code = createBookCode(); const r = recipe();
    await saveLocal(code, r); await acknowledgeEntry((await getEntry(code, r.id))!, 1);
    await saveLocal(code, { ...r, title: 'Versión del móvil' });
    expect(await mergeRemote(code, r.id, 2, false, { ...r, title: 'Versión del ordenador' })).toBe(1);
    const entries = await getEntries(code);
    expect(entries.map(e => e.recipe.title)).toEqual(expect.arrayContaining(['Versión del ordenador', 'Versión del móvil (copia local)']));
    expect(entries.find(e => e.recipe.title.includes('copia local'))?.pending).toBe(true);
  });
  it('respeta el borrado remoto y guarda una copia si había cambios locales sin subir', async () => {
    const code = createBookCode(); const r = recipe();
    await saveLocal(code, r); await acknowledgeEntry((await getEntry(code, r.id))!, 1);
    await saveLocal(code, { ...r, notes: 'Un cambio sin conexión' });
    expect(await mergeRemote(code, r.id, 2, true)).toBe(1);
    expect((await getEntry(code, r.id))?.deleted).toBe(true);
    expect((await getEntries(code)).filter(e => !e.deleted)).toHaveLength(1);
  });
  it('añade recetas importadas sin sobrescribir recetas con el mismo identificador', async () => {
    const code = createBookCode(); const r = recipe(); await saveLocal(code, r);
    await importRecipes(code, [r]); const entries = await getEntries(code);
    expect(entries).toHaveLength(2); expect(new Set(entries.map(e => e.recipe.id)).size).toBe(2);
  });
});
describe('Sincronización', () => {
  it('sube contenido cifrado y descarga los cambios de otro dispositivo', async () => {
    const code = createBookCode(); const r = recipe();
    const remote = new Map<string, { id: string; revision: number; sequence: number; deleted: boolean; payload: string }>();
    let sequence = 0;
    vi.stubGlobal('fetch', vi.fn(async (input: string, init?: RequestInit) => {
      expect((init?.headers as Record<string, string>).Authorization).toBe(`Bearer ${code}`);
      const url = new URL(input, 'https://example.test');
      if (url.pathname === '/api/book') return Response.json({ payload: (JSON.parse(init!.body as string)).payload });
      if (init?.method === 'PUT') {
        const body = JSON.parse(init.body as string);
        const revision = (remote.get(body.id)?.revision ?? 0) + 1;
        remote.set(body.id, { ...body, revision, sequence: ++sequence });
        return Response.json({ revision });
      }
      const id = url.searchParams.get('id');
      return Response.json(id ? remote.get(id) : [...remote.values()].map(({ payload: _, ...metadata }) => metadata));
    }));
    const book = { code, name: 'Mi libro', createdAt: new Date().toISOString() };
    await saveLocal(code, r); await syncBook(book);
    expect((await getEntry(code, r.id))?.pending).toBe(false);
    expect(remote.get(r.id)?.payload).not.toContain(r.title);
    expect(await decrypt(remote.get(r.id)!.payload, code, r.id)).toEqual(r);
    const updated = { ...r, title: 'Editada desde otro dispositivo' };
    remote.set(r.id, { id: r.id, payload: await encrypt(updated, code, r.id), revision: 2, sequence: ++sequence, deleted: false });
    await syncBook(book);
    expect((await getEntry(code, r.id))?.recipe.title).toBe(updated.title);
  });
  it('conserva los cambios locales cuando falla la conexión', async () => {
    const code = createBookCode(); const r = recipe(); await saveLocal(code, r);
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Sin red')));
    await expect(syncBook({ code, name: 'Mi libro', createdAt: new Date().toISOString() })).rejects.toThrow();
    expect((await getEntry(code, r.id))?.pending).toBe(true);
    expect((await getEntry(code, r.id))?.recipe).toEqual(r);
  });
  it('rechaza una clave inexistente sin crear un libro remoto vacío', async () => {
    const code = createBookCode();
    const fetchMock = vi.fn().mockResolvedValue(Response.json({ error: 'No existe ese libro.' }, { status: 404 }));
    vi.stubGlobal('fetch', fetchMock);
    await expect(openCloudBook(code)).rejects.toThrow('No existe');
    expect(fetchMock.mock.calls[0][1].method).toBe('GET');
  });
  it('explica un fallo del servidor que devuelve HTML y conserva las recetas locales', async () => {
    const code = createBookCode(); const r = recipe(); await saveLocal(code, r);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('<html>Error del servidor</html>', { status: 500 })));
    await expect(syncBook({ code, name: 'Mi libro', createdAt: new Date().toISOString() })).rejects.toThrow('servidor de sincronización');
    expect((await getEntry(code, r.id))?.pending).toBe(true);
  });
});
