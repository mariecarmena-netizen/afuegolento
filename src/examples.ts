import { newRecipe, type Recipe } from './model';

export const exampleRecipes = [
  {
    title: 'Pasta al pesto', category: 'Platos principales', minutes: 25, servings: 2,
    description: 'Albahaca fresca, parmesano y ese último chorrito de aceite de oliva.',
    photos: ['/images/pasta.webp'],
    ingredients: [
      { quantity: '200', unit: 'g', name: 'Pasta' }, { quantity: '30', unit: 'g', name: 'Albahaca fresca' },
      { quantity: '30', unit: 'g', name: 'Parmesano' }, { quantity: '25', unit: 'g', name: 'Piñones' },
      { quantity: '1', unit: 'diente', name: 'Ajo' }, { quantity: '50', unit: 'ml', name: 'Aceite de oliva' },
    ],
    steps: ['Pon a hervir agua con sal y cuece la pasta siguiendo el tiempo del envase.',
      'Tritura la albahaca, el ajo, los piñones, el parmesano y el aceite hasta obtener el pesto.',
      'Reserva un poco de agua de cocción. Escurre la pasta y mezcla con el pesto, añadiendo agua hasta que quede cremosa.'],
    notes: 'Añade el pesto fuera del fuego para conservar el sabor de la albahaca.',
  },
  {
    title: 'Ensalada de la huerta', category: 'Entrantes', minutes: 15, servings: 2,
    description: 'Crujiente, colorida y con un aliño de limón recién exprimido.', photos: ['/images/salad.webp'],
    ingredients: [{ quantity: '150', unit: 'g', name: 'Hojas verdes' }, { quantity: '8', unit: 'ud.', name: 'Tomates cherry' },
      { quantity: '1', unit: 'ud.', name: 'Pepino' }, { quantity: '2', unit: 'cda.', name: 'Aceite de oliva' },
      { quantity: '1', unit: 'cda.', name: 'Zumo de limón' }],
    steps: ['Lava y seca las hojas verdes. Corta los tomates y el pepino.',
      'Bate el aceite con el limón y una pizca de sal.', 'Mezcla las verduras y aliña justo antes de servir.'], notes: '',
  },
  {
    title: 'Tostadas con fruta', category: 'Desayunos', minutes: 10, servings: 2,
    description: 'Un desayuno tranquilo, con fruta de temporada y un toque de miel.', photos: ['/images/toast.webp'],
    ingredients: [{ quantity: '4', unit: 'rebanadas', name: 'Pan' }, { quantity: '100', unit: 'g', name: 'Yogur griego' },
      { quantity: '1', unit: 'ud.', name: 'Plátano' }, { quantity: '80', unit: 'g', name: 'Frutos rojos' }, { quantity: '1', unit: 'cda.', name: 'Miel' }],
    steps: ['Tuesta el pan a tu gusto.', 'Unta el yogur sobre las tostadas.',
      'Reparte el plátano y los frutos rojos. Termina con un hilo de miel.'], notes: '',
  },
] as const;
export function makeExample(index: number): Recipe {
  const example = exampleRecipes[index];
  return { ...newRecipe(), ...example, photos: [...example.photos], steps: [...example.steps],
    ingredients: example.ingredients.map(i => ({ ...i, id: crypto.randomUUID() })) };
}
