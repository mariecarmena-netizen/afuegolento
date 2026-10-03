import { openDB, type DBSchema } from 'idb';
import type { Book, Recipe, StoredRecipe } from './model';

interface RecipeDatabase extends DBSchema {
  meta: { key: string; value: Book };
  recipes: { key: string; value: StoredRecipe; indexes: { bookCode: string } };
}
const database = openDB<RecipeDatabase>('afuegolento', 1, {
  upgrade(db) {
    db.createObjectStore('meta');
    const store = db.createObjectStore('recipes', { keyPath: 'key' });
    store.createIndex('bookCode', 'bookCode');
  },
});
export async function getBook(): Promise<Book | undefined> { return (await database).get('meta', 'active-book'); }
export async function getCachedBook(code: string): Promise<Book | undefined> { return (await database).get('meta', `book:${code}`); }
export async function setBook(book: Book): Promise<void> {
  const tx = (await database).transaction('meta', 'readwrite');
  await tx.store.put(book, 'active-book');
  await tx.store.put(book, `book:${book.code}`);
  await tx.done;
}
export async function leaveBook(): Promise<void> { await (await database).delete('meta', 'active-book'); }
export async function getEntries(code: string): Promise<StoredRecipe[]> { return (await database).getAllFromIndex('recipes', 'bookCode', code); }
export async function getEntry(code: string, id: string): Promise<StoredRecipe | undefined> { return (await database).get('recipes', `${code}:${id}`); }
export async function putEntry(entry: StoredRecipe): Promise<void> { await (await database).put('recipes', entry); }
export async function mergeRemote(code: string, id: string, revision: number, deleted: boolean, recipe?: Recipe): Promise<number> {
  const db = await database;
  const tx = db.transaction('recipes', 'readwrite');
  const key = `${code}:${id}`;
  const current = await tx.store.get(key);
  if (current?.revision === revision) { await tx.done; return 0; }
  let conflicts = 0;
  if (current?.pending && !current.deleted) {
    const copy = { ...current.recipe, id: crypto.randomUUID(), title: `${current.recipe.title.slice(0, 120)} (copia local)`, updatedAt: new Date().toISOString() };
    await tx.store.put({ key: `${code}:${copy.id}`, bookCode: code, recipe: copy, revision: 0, pending: true, deleted: false });
    conflicts = 1;
  }
  const value = deleted ? current?.recipe : recipe;
  if (value) await tx.store.put({ key, bookCode: code, recipe: value, revision, pending: false, deleted });
  await tx.done;
  return conflicts;
}
export async function saveLocal(code: string, recipe: Recipe, deleted = false): Promise<void> {
  const db = await database;
  const tx = db.transaction('recipes', 'readwrite');
  const key = `${code}:${recipe.id}`;
  const previous = await tx.store.get(key);
  await tx.store.put({ key, bookCode: code, recipe, revision: previous?.revision ?? 0, pending: true, deleted });
  await tx.done;
}
export async function acknowledgeEntry(snapshot: StoredRecipe, revision: number): Promise<void> {
  const db = await database;
  const tx = db.transaction('recipes', 'readwrite');
  const current = await tx.store.get(snapshot.key);
  if (current) await tx.store.put({ ...current, revision,
    pending: JSON.stringify(current.recipe) !== JSON.stringify(snapshot.recipe) || current.deleted !== snapshot.deleted });
  await tx.done;
}
export async function importRecipes(code: string, recipes: Recipe[]): Promise<void> {
  const db = await database;
  const tx = db.transaction('recipes', 'readwrite');
  for (const recipe of recipes) {
    const imported = { ...recipe, id: crypto.randomUUID(), updatedAt: new Date().toISOString() };
    await tx.store.put({ key: `${code}:${imported.id}`, bookCode: code, recipe: imported, revision: 0, pending: true, deleted: false });
  }
  await tx.done;
}
