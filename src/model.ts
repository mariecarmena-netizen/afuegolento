export const categories = ['Entrantes', 'Platos principales', 'Postres', 'Desayunos', 'Bebidas', 'Otros'] as const;
export type Category = typeof categories[number];
export type Ingredient = { id: string; quantity: string; unit: string; name: string };
export type Recipe = {
  id: string;
  title: string;
  category: Category;
  description: string;
  minutes: number;
  servings: number;
  ingredients: Ingredient[];
  steps: string[];
  notes: string;
  photos: string[];
  favorite: boolean;
  createdAt: string;
  updatedAt: string;
};
export type Book = { code: string; name: string; createdAt: string };
export type StoredRecipe = { key: string; bookCode: string; recipe: Recipe; revision: number; pending: boolean; deleted: boolean };
export type Backup = { format: 'afuegolento'; version: 1; exportedAt: string; bookName: string; recipes: Recipe[] };

export function newRecipe(): Recipe {
  const now = new Date().toISOString();
  return { id: crypto.randomUUID(), title: '', category: 'Platos principales', description: '', minutes: 30, servings: 2,
    ingredients: [newIngredient()], steps: [''], notes: '', photos: [], favorite: false, createdAt: now, updatedAt: now };
}
export function newIngredient(): Ingredient {
  return { id: crypto.randomUUID(), quantity: '', unit: '', name: '' };
}

const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export function createBookCode(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(24));
  return formatCode(Array.from(bytes, byte => alphabet[byte & 31]).join(''));
}
export function normalizeCode(code: string): string { return code.toUpperCase().replace(/[\s-]/g, ''); }
export function formatCode(code: string): string { return normalizeCode(code).match(/.{1,6}/g)?.join('-') ?? ''; }
export function validCode(code: string): boolean { return /^[A-HJ-NP-Z2-9]{24}$/.test(normalizeCode(code)); }
export function normalizeSearch(value: string): string {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('es');
}

function isText(value: unknown, max = 10000): value is string { return typeof value === 'string' && value.length <= max; }
export function isRecipe(value: unknown): value is Recipe {
  if (!value || typeof value !== 'object') return false;
  const r = value as Record<string, unknown>;
  return isText(r.id, 100) && /^[a-zA-Z0-9-]+$/.test(r.id) && isText(r.title, 150) && !!r.title.trim()
    && categories.includes(r.category as Category) && isText(r.description, 2000) && isText(r.notes)
    && typeof r.favorite === 'boolean' && typeof r.minutes === 'number' && Number.isFinite(r.minutes) && r.minutes >= 0 && r.minutes <= 10080
    && typeof r.servings === 'number' && Number.isInteger(r.servings) && r.servings >= 1 && r.servings <= 100
    && isText(r.createdAt, 40) && Number.isFinite(Date.parse(r.createdAt)) && isText(r.updatedAt, 40) && Number.isFinite(Date.parse(r.updatedAt))
    && Array.isArray(r.ingredients) && r.ingredients.length <= 100 && r.ingredients.every(i => i && isText(i.id, 100) && isText(i.name, 300) && isText(i.quantity, 30) && isText(i.unit, 30))
    && Array.isArray(r.steps) && r.steps.length <= 100 && r.steps.every(s => isText(s, 10000))
    && Array.isArray(r.photos) && r.photos.length <= 4 && r.photos.every(p => isText(p, 800000) && (/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(p) || /^\/images\/[a-z-]+\.webp$/.test(p)));
}
export function parseBackup(text: string): Backup {
  if (text.length > 50000000) throw new Error('La copia es demasiado grande. El máximo es 50 MB.');
  const data: unknown = JSON.parse(text);
  if (!data || typeof data !== 'object') throw new Error('Este archivo no es una copia de A fuego lento.');
  const b = data as Record<string, unknown>;
  if (b.format !== 'afuegolento' || b.version !== 1 || !isText(b.bookName, 100) || !isText(b.exportedAt, 40)
    || !Array.isArray(b.recipes) || b.recipes.length > 5000 || !b.recipes.every(isRecipe)) {
    throw new Error('La copia no es válida o contiene recetas incompatibles.');
  }
  return b as Backup;
}
