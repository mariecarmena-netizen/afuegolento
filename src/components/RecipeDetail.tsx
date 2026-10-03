import { useState } from 'react';
import { ArrowLeft, Check, ChefHat, Clock3, Heart, Pencil, Printer, Trash2, Users } from 'lucide-react';
import type { Recipe } from '../model';

export default function RecipeDetail({ recipe, onBack, onEdit, onFavorite, onDelete }: { recipe: Recipe; onBack: () => void; onEdit: () => void; onFavorite: () => void; onDelete: () => void }) {
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [photo, setPhoto] = useState(0);
  return <article className="recipe-detail">
    <div className="detail-toolbar"><button className="button subtle" onClick={onBack}><ArrowLeft size={18} />Mi recetario</button><div className="toolbar-actions"><button className={`icon-button ${recipe.favorite ? 'is-favorite' : ''}`} title={recipe.favorite ? 'Quitar de favoritas' : 'Añadir a favoritas'} aria-label={recipe.favorite ? 'Quitar de favoritas' : 'Añadir a favoritas'} onClick={onFavorite}><Heart size={20} fill={recipe.favorite ? 'currentColor' : 'none'} /></button><button className="icon-button print-button" title="Imprimir receta" aria-label="Imprimir receta" onClick={() => window.print()}><Printer size={19} /></button><button className="icon-button muted" title="Eliminar receta" aria-label="Eliminar receta" onClick={onDelete}><Trash2 size={19} /></button><button className="button primary" onClick={onEdit}><Pencil size={17} />Editar</button></div></div>
    <div className="recipe-paper">
      <span className="category-label">{recipe.category}</span><h1>{recipe.title}</h1>{recipe.description && <p className="recipe-description">{recipe.description}</p>}
      <div className="detail-meta"><span><Clock3 size={17} />{recipe.minutes} min</span><span><Users size={17} />{recipe.servings} {recipe.servings === 1 ? 'ración' : 'raciones'}</span><span><ChefHat size={17} />{recipe.ingredients.length} ingredientes</span></div>
      {!!recipe.photos.length && <div className="recipe-gallery"><img className="recipe-main-photo" src={recipe.photos[Math.min(photo, recipe.photos.length - 1)]} alt={recipe.title} />{recipe.photos.length > 1 && <div className="photo-thumbnails">{recipe.photos.map((p, i) => <button key={i} aria-label={`Ver foto ${i + 1}`} aria-pressed={i === photo} onClick={() => setPhoto(i)}><img src={p} alt="" /></button>)}</div>}</div>}
      <div className="recipe-columns"><section className="ingredients-section"><h2>Ingredientes</h2><div className="ingredient-list">{recipe.ingredients.map(i => <label className={`ingredient-check ${checked.has(i.id) ? 'checked' : ''}`} key={i.id}><input type="checkbox" checked={checked.has(i.id)} onChange={() => setChecked(previous => { const next = new Set(previous); next.has(i.id) ? next.delete(i.id) : next.add(i.id); return next; })} /><span className="check-visual">{checked.has(i.id) && <Check size={14} />}</span><span><strong>{[i.quantity, i.unit].filter(Boolean).join(' ')}</strong> {i.name}</span></label>)}</div>{!recipe.ingredients.length && <p className="muted">Sin ingredientes añadidos.</p>}</section>
        <section className="preparation-section"><h2>Preparación</h2><ol className="preparation-list">{recipe.steps.map((step, i) => <li key={i}><span className="step-number">{String(i + 1).padStart(2, '0')}</span><p>{step}</p></li>)}</ol>{!recipe.steps.length && <p className="muted">Sin pasos añadidos.</p>}</section></div>
      {recipe.notes && <section className="recipe-notes"><h2>Notas de cocina</h2><p>{recipe.notes}</p></section>}
      <div className="recipe-date">Guardada el {new Date(recipe.createdAt).toLocaleDateString('es', { day: 'numeric', month: 'long', year: 'numeric' })}</div>
    </div>
  </article>;
}
