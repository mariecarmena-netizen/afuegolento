import { useEffect, useState } from 'react';
import { Camera, Check, ImagePlus, LoaderCircle, Plus, Trash2, X } from 'lucide-react';
import { categories, isRecipe, newIngredient, type Recipe } from '../model';
import { preparePhoto } from '../photos';

export default function RecipeEditor({ initial, onSave, onBack }: { initial: Recipe; onSave: (recipe: Recipe) => Promise<void>; onBack: () => void }) {
  const [recipe, setRecipe] = useState<Recipe>(structuredClone(initial));
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const dirty = JSON.stringify(recipe) !== JSON.stringify(initial);
  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => { if (dirty) { event.preventDefault(); event.returnValue = ''; } };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);
  function update<K extends keyof Recipe>(key: K, value: Recipe[K]) { setRecipe(previous => ({ ...previous, [key]: value })); }
  async function upload(event: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []);
    event.target.value = '';
    if (!files.length) return;
    if (recipe.photos.length + files.length > 4) { setError('Puedes guardar hasta cuatro fotos por receta.'); return; }
    setUploading(true); setError('');
    try { const photos = await Promise.all(files.map(preparePhoto)); setRecipe(r => ({ ...r, photos: [...r.photos, ...photos] })); }
    catch (err) { setError(err instanceof Error ? err.message : 'No se ha podido añadir la foto.'); }
    finally { setUploading(false); }
  }
  async function save(event: React.FormEvent) {
    event.preventDefault(); setError('');
    const value: Recipe = { ...recipe, title: recipe.title.trim(), description: recipe.description.trim(),
      ingredients: recipe.ingredients.filter(i => i.name.trim()).map(i => ({ ...i, name: i.name.trim() })),
      steps: recipe.steps.map(s => s.trim()).filter(Boolean), updatedAt: new Date().toISOString() };
    if (!isRecipe(value)) { setError('Revisa el nombre, las cantidades y los campos de la receta.'); return; }
    setBusy(true);
    try { await onSave(value); } catch (err) { setError(err instanceof Error ? err.message : 'No se ha podido guardar la receta.'); }
    finally { setBusy(false); }
  }
  return <form className="recipe-editor" onSubmit={save}>
    <div className="editor-toolbar"><button className="button subtle" type="button" onClick={() => dirty ? setConfirmDiscard(true) : onBack()} disabled={busy || uploading}><X size={18} />Cancelar</button><span className="eyebrow">{initial.title ? 'EDITAR RECETA' : 'UNA NUEVA HOJA'}</span><button className="button primary" disabled={busy || uploading}>{busy ? <LoaderCircle className="spin" size={18} /> : <Check size={18} />}Guardar receta</button></div>
    <div className="recipe-paper editor-paper">
      <label className="title-label">Nombre de la receta<input className="recipe-title-input" placeholder="¿Qué vamos a cocinar?" value={recipe.title} onChange={e => update('title', e.target.value)} maxLength={150} required autoFocus /></label>
      <label>Una pequeña descripción<textarea className="description-input" placeholder="Lo que hace especial esta receta…" value={recipe.description} onChange={e => update('description', e.target.value)} maxLength={2000} rows={2} /></label>
      <div className="form-meta"><label>Categoría<select value={recipe.category} onChange={e => update('category', e.target.value as Recipe['category'])}>{categories.map(c => <option key={c}>{c}</option>)}</select></label><label>Tiempo (min)<input type="number" min={0} max={10080} value={recipe.minutes} onChange={e => update('minutes', Number(e.target.value))} /></label><label>Raciones<input type="number" min={1} max={100} value={recipe.servings} onChange={e => update('servings', Number(e.target.value))} /></label></div>
      <section className="editor-section"><div className="section-heading"><h2>Fotos</h2><span className="muted">{recipe.photos.length} / 4</span></div>
        <div className="photo-editor-grid">{recipe.photos.map((photo, index) => <div className="photo-preview" key={index}><img src={photo} alt={`Foto ${index + 1} de la receta`} />{index === 0 && <span className="cover-label">Portada</span>}<button type="button" className="icon-button" title={`Eliminar foto ${index + 1}`} aria-label={`Eliminar foto ${index + 1}`} onClick={() => update('photos', recipe.photos.filter((_, i) => i !== index))} disabled={uploading}><X size={16} /></button></div>)}
          {recipe.photos.length < 4 && <label className={`photo-upload ${uploading ? 'disabled' : ''}`}>{uploading ? <LoaderCircle className="spin" size={26} /> : recipe.photos.length ? <ImagePlus size={26} /> : <Camera size={28} />}<span>{uploading ? 'Preparando fotos…' : 'Añadir fotos'}</span><input type="file" accept="image/jpeg,image/png,image/webp,image/avif,image/gif" multiple onChange={upload} disabled={uploading} /></label>}
        </div>
      </section>
      <section className="editor-section"><div className="section-heading"><h2>Ingredientes</h2><button type="button" className="button small subtle" onClick={() => update('ingredients', [...recipe.ingredients, newIngredient()])} disabled={recipe.ingredients.length >= 100}><Plus size={17} />Añadir</button></div>
        {!!recipe.ingredients.length && <div className="ingredient-head"><span>Cantidad</span><span>Unidad</span><span>Ingrediente</span></div>}
        <div className="ingredient-inputs">{recipe.ingredients.map((ingredient, index) => <div className="ingredient-input-row" key={ingredient.id}>
          <input aria-label={`Cantidad del ingrediente ${index + 1}`} value={ingredient.quantity} maxLength={30} placeholder="200" onChange={e => update('ingredients', recipe.ingredients.map((i, n) => n === index ? { ...i, quantity: e.target.value } : i))} />
          <input aria-label={`Unidad del ingrediente ${index + 1}`} value={ingredient.unit} maxLength={30} placeholder="g" list="units" onChange={e => update('ingredients', recipe.ingredients.map((i, n) => n === index ? { ...i, unit: e.target.value } : i))} />
          <input aria-label={`Nombre del ingrediente ${index + 1}`} value={ingredient.name} maxLength={300} placeholder="Harina, tomate, un poco de sal…" onChange={e => update('ingredients', recipe.ingredients.map((i, n) => n === index ? { ...i, name: e.target.value } : i))} />
          <button className="icon-button muted" type="button" title={`Eliminar ingrediente ${index + 1}`} aria-label={`Eliminar ingrediente ${index + 1}`} onClick={() => update('ingredients', recipe.ingredients.filter((_, n) => n !== index))}><Trash2 size={17} /></button>
        </div>)}</div><datalist id="units">{['g', 'kg', 'ml', 'l', 'ud.', 'cda.', 'cdta.', 'tazas', 'dientes', 'pizcas'].map(u => <option key={u} value={u} />)}</datalist>
      </section>
      <section className="editor-section"><div className="section-heading"><h2>Preparación</h2><button type="button" className="button small subtle" onClick={() => update('steps', [...recipe.steps, ''])} disabled={recipe.steps.length >= 100}><Plus size={17} />Añadir paso</button></div>
        <div className="steps-editor">{recipe.steps.map((step, index) => <div className="step-editor" key={index}><span className="step-number">{String(index + 1).padStart(2, '0')}</span><textarea aria-label={`Paso ${index + 1}`} rows={3} maxLength={10000} value={step} placeholder={index === 0 ? 'Empieza por el primer paso…' : '¿Qué viene después?'} onChange={e => update('steps', recipe.steps.map((s, n) => n === index ? e.target.value : s))} /><button type="button" className="icon-button muted" title={`Eliminar paso ${index + 1}`} aria-label={`Eliminar paso ${index + 1}`} onClick={() => update('steps', recipe.steps.filter((_, n) => n !== index))}><Trash2 size={17} /></button></div>)}</div>
      </section>
      <section className="editor-section"><h2>Notas de cocina</h2><label className="sr-only" htmlFor="recipe-notes">Notas de cocina</label><textarea id="recipe-notes" rows={3} maxLength={10000} value={recipe.notes} onChange={e => update('notes', e.target.value)} placeholder="Ese truco, la versión de la abuela, lo que cambiarías la próxima vez…" /></section>
      {error && <p className="error" role="alert">{error}</p>}
      <div className="editor-save-bottom"><button className="button primary" disabled={busy || uploading}><Check size={18} />Guardar receta</button></div>
    </div>
    {confirmDiscard && <div className="discard-bar" role="alert"><span>Hay cambios sin guardar.</span><button type="button" className="button small" onClick={() => setConfirmDiscard(false)}>Seguir editando</button><button type="button" className="button small danger" onClick={onBack}>Descartar cambios</button></div>}
  </form>;
}
