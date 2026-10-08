import { useCallback, useEffect, useRef, useState } from 'react';
import { BookOpen, Check, ChefHat, ChevronDown, Clock3, Cloud, CloudOff, Heart, KeyRound, Leaf, LoaderCircle, Plus, Search, Settings2, Trash2, Users, X } from 'lucide-react';
import { useRegisterSW } from 'virtual:pwa-register/react';
import { categories, newRecipe, normalizeSearch, type Book, type Category, type Recipe } from './model';
import { getBook, getEntries, importRecipes, leaveBook, saveLocal } from './storage';
import { cloudConfigured, syncBook, type SyncStatus } from './sync';
import { exampleRecipes, makeExample } from './examples';
import BookGate from './components/BookGate';
import BookSettings, { syncLabels, type InstallPrompt } from './components/BookSettings';
import RecipeEditor from './components/RecipeEditor';
import RecipeDetail from './components/RecipeDetail';
import { Modal } from './components/Modal';

type View = 'library' | 'detail' | 'editor';
type Toast = { text: string; undo?: Recipe };
export default function App() {
  const [book, setBookState] = useState<Book | null>(null);
  const [booting, setBooting] = useState(true);
  const [fatal, setFatal] = useState('');
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [view, setView] = useState<View>('library');
  const [selected, setSelected] = useState<string | null>(null);
  const [draft, setDraft] = useState<Recipe | null>(null);
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState<Category | ''>('');
  const [favorites, setFavorites] = useState(false);
  const [sort, setSort] = useState('recent');
  const [settings, setSettings] = useState<false | 'created' | 'open'>(false);
  const [status, setStatus] = useState<SyncStatus>('local');
  const [syncError, setSyncError] = useState('');
  const [toast, setToast] = useState<Toast | null>(null);
  const [deleteRecipe, setDeleteRecipe] = useState<Recipe | null>(null);
  const [installPrompt, setInstallPrompt] = useState<InstallPrompt | null>(null);
  const activeBook = useRef<Book | null>(null);
  const synchronizing = useRef(false);
  const { needRefresh: [needRefresh, setNeedRefresh], updateServiceWorker } = useRegisterSW();

  useEffect(() => { activeBook.current = book; }, [book]);
  const refreshRecipes = useCallback(async (current: Book) => {
    const entries = await getEntries(current.code);
    if (activeBook.current?.code === current.code) setRecipes(entries.filter(e => !e.deleted).map(e => e.recipe));
  }, []);
  const synchronize = useCallback(async () => {
    const current = activeBook.current;
    if (!current || synchronizing.current) return;
    synchronizing.current = true;
    try {
      if (!navigator.onLine) { setStatus('offline'); return; }
      if (!await cloudConfigured()) { setStatus('local'); setSyncError(''); return; }
      setStatus('syncing');
      const result = await syncBook(current);
      if (activeBook.current?.code === current.code) {
        const pending = (await getEntries(current.code)).some(e => e.pending);
        setStatus(pending ? 'error' : 'synced'); setSyncError('');
        if (result.conflicts) setToast({ text: 'Había cambios en dos dispositivos. Se ha conservado una copia de cada versión.' });
      }
    } catch (error) {
      if (activeBook.current?.code === current.code) {
        setStatus(navigator.onLine ? 'error' : 'offline');
        setSyncError(error instanceof Error ? error.message : 'Los cambios siguen guardados en este dispositivo.');
      }
    } finally { await refreshRecipes(current).catch(() => {}); synchronizing.current = false; }
  }, [refreshRecipes]);
  useEffect(() => {
    getBook().then(value => {
      if (value) { activeBook.current = value; setBookState(value); return refreshRecipes(value); }
    }).catch(() => setFatal('El navegador no permite guardar el libro. Abre la app en una ventana normal con el almacenamiento habilitado.')).finally(() => setBooting(false));
  }, [refreshRecipes]);
  useEffect(() => {
    if (!book) return;
    void synchronize();
    const onOnline = () => { void synchronize(); };
    const onOffline = () => setStatus('offline');
    const onFocus = () => { if (document.visibilityState === 'visible') void synchronize(); };
    const interval = window.setInterval(() => { if (document.visibilityState === 'visible') void synchronize(); }, 15000);
    window.addEventListener('online', onOnline); window.addEventListener('offline', onOffline); window.addEventListener('focus', onFocus); document.addEventListener('visibilitychange', onFocus);
    return () => { window.clearInterval(interval); window.removeEventListener('online', onOnline); window.removeEventListener('offline', onOffline); window.removeEventListener('focus', onFocus); document.removeEventListener('visibilitychange', onFocus); };
  }, [book, synchronize]);
  useEffect(() => { if (!toast) return; const timer = window.setTimeout(() => setToast(null), toast.undo ? 10000 : 6000); return () => window.clearTimeout(timer); }, [toast]);
  useEffect(() => {
    const handler = (event: Event) => { event.preventDefault(); setInstallPrompt(event as InstallPrompt); };
    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);
  async function save(recipe: Recipe) {
    if (!book) return;
    await saveLocal(book.code, recipe); await refreshRecipes(book);
    setSelected(recipe.id); setView('detail'); setDraft(null);
    setToast({ text: 'Receta guardada' }); void synchronize();
  }
  async function favorite(recipe: Recipe) {
    if (!book) return;
    try { await saveLocal(book.code, { ...recipe, favorite: !recipe.favorite, updatedAt: new Date().toISOString() }); await refreshRecipes(book); void synchronize(); }
    catch { setToast({ text: 'No se ha podido guardar el cambio. Revisa el espacio disponible.' }); }
  }
  async function remove(recipe: Recipe) {
    if (!book) return;
    try { await saveLocal(book.code, { ...recipe, updatedAt: new Date().toISOString() }, true); await refreshRecipes(book); setDeleteRecipe(null); setView('library'); setToast({ text: 'Receta eliminada', undo: recipe }); void synchronize(); }
    catch { setToast({ text: 'No se ha podido eliminar la receta.' }); }
  }
  function goLibrary(onlyFavorites = false) { setView('library'); setFavorites(onlyFavorites); setCategory(''); setSearch(''); }
  function createRecipe(recipe = newRecipe()) { setDraft(recipe); setView('editor'); window.scrollTo({ top: 0 }); }
  if (booting) return <div className="boot-screen"><img src="/icons/icon-192.png" alt="" /><LoaderCircle size={24} className="spin" /><p>Abriendo tu recetario…</p></div>;
  if (fatal) return <div className="boot-screen"><BookOpen size={32} /><p role="alert">{fatal}</p></div>;
  if (!book) return <BookGate onReady={(value, created) => { activeBook.current = value; setBookState(value); setRecipes([]); setView('library'); setStatus('local'); setSyncError(''); if (created) setSettings('created'); void refreshRecipes(value); }} />;
  const current = recipes.find(r => r.id === selected);
  const filtered = recipes.filter(r => (!favorites || r.favorite) && (!category || r.category === category)
    && normalizeSearch([r.title, r.description, ...r.ingredients.map(i => i.name)].join(' ')).includes(normalizeSearch(search)))
    .sort((a, b) => sort === 'name' ? a.title.localeCompare(b.title, 'es') : sort === 'time' ? a.minutes - b.minutes : b.updatedAt.localeCompare(a.updatedAt));
  return <div className="app">
    <header className="app-header"><button className="brand" onClick={() => { if (view !== 'editor') goLibrary(); }} disabled={view === 'editor'}><img src="/icons/icon-192.png" alt="" /><span>A fuego lento<small>MI RECETARIO</small></span></button><div className="header-actions"><button className="button subtle book-key-button" onClick={() => setSettings('open')}><KeyRound size={18} /><span>Mi libro</span></button><button className="icon-button" title="Ajustes del libro" aria-label="Ajustes del libro" onClick={() => setSettings('open')}><Settings2 size={20} /></button></div></header>
    <div className="app-layout"><aside className={`sidebar ${view === 'editor' ? 'sidebar-disabled' : ''}`}><div className="sidebar-book"><BookOpen size={20} /><div><span className="eyebrow">MI LIBRO</span><strong>{book.name}</strong></div></div><nav aria-label="Recetario"><button className={view === 'library' && !favorites ? 'active' : ''} onClick={() => goLibrary()} disabled={view === 'editor'}><BookOpen size={18} />Todas las recetas<span>{recipes.length}</span></button><button className={favorites ? 'active' : ''} onClick={() => goLibrary(true)} disabled={view === 'editor'}><Heart size={18} />Mis favoritas<span>{recipes.filter(r => r.favorite).length}</span></button></nav><div className="sidebar-categories"><span className="eyebrow">CATEGORÍAS</span>{categories.map(c => <button key={c} className={category === c ? 'selected' : ''} disabled={view === 'editor'} onClick={() => { setCategory(c); setFavorites(false); setView('library'); }}><span className={`category-dot dot-${categories.indexOf(c)}`} />{c}<span>{recipes.filter(r => r.category === c).length || ''}</span></button>)}</div><div className="sidebar-bottom"><Leaf size={25} /><p>Un poco de aquí.<br />Un recuerdo de allá.</p><button className={`sync-status status-${status}`} onClick={() => { if (status === 'local') setSettings('open'); else void synchronize(); }} title={syncError || syncLabels[status]}>{status === 'syncing' ? <LoaderCircle className="spin" size={16} /> : status === 'synced' ? <Cloud size={16} /> : <CloudOff size={16} />}<span>{status === 'local' ? 'Guardado en este dispositivo' : syncLabels[status]}</span></button></div></aside>
      <main className={`main-content view-${view}`}>
        {view === 'editor' && draft ? <RecipeEditor key={draft.id} initial={draft} onSave={save} onBack={() => { setDraft(null); setView(current ? 'detail' : 'library'); }} />
        : view === 'detail' && current ? <RecipeDetail key={current.id} recipe={current} onBack={() => goLibrary(favorites)} onEdit={() => createRecipe(current)} onFavorite={() => { void favorite(current); }} onDelete={() => setDeleteRecipe(current)} />
        : <div className="library"><div className="page-heading"><div><span className="eyebrow">RECETAS PARA VOLVER A ELLAS</span><h1>{favorites ? 'Mis favoritas' : category || 'Mis recetas'}</h1><p className="muted">{recipes.length ? `${filtered.length} ${filtered.length === 1 ? 'receta' : 'recetas'} en tu libro` : 'Tu próxima receta empieza aquí.'}</p></div><button className="button primary new-recipe" onClick={() => createRecipe()}><Plus size={20} />Nueva receta</button></div>
          <div className="library-toolbar"><div className="search-field"><Search size={19} /><input aria-label="Buscar recetas" placeholder="Buscar una receta o ingrediente…" value={search} onChange={e => setSearch(e.target.value)} />{search && <button className="icon-button" title="Limpiar búsqueda" aria-label="Limpiar búsqueda" onClick={() => setSearch('')}><X size={16} /></button>}</div><label className="category-filter"><span className="sr-only">Filtrar por categoría</span><select value={category} onChange={e => setCategory(e.target.value as Category | '')}><option value="">Todas las categorías</option>{categories.map(c => <option key={c}>{c}</option>)}</select><ChevronDown size={16} /></label><label className="sort-filter"><span className="sr-only">Ordenar recetas</span><select value={sort} onChange={e => setSort(e.target.value)}><option value="recent">Más recientes</option><option value="name">Nombre A–Z</option><option value="time">Menor tiempo</option></select><ChevronDown size={16} /></label></div>
          {filtered.length ? <div className="recipe-grid">{filtered.map(recipe => <article className="recipe-card" key={recipe.id}><button className="recipe-card-open" aria-label={`Abrir ${recipe.title}`} onClick={() => { setSelected(recipe.id); setView('detail'); window.scrollTo({ top: 0 }); }}><div className={`recipe-card-photo ${recipe.photos.length ? '' : 'no-photo'}`}>{recipe.photos.length ? <img src={recipe.photos[0]} alt={recipe.title} loading="lazy" /> : <ChefHat size={48} strokeWidth={1} />}</div><div className="recipe-card-body"><span className="category-label">{recipe.category}</span><h2>{recipe.title}</h2><p>{recipe.description || (recipe.ingredients.length ? recipe.ingredients.slice(0, 3).map(i => i.name).join(', ') : 'Una receta de tu libro.')}</p><div className="card-meta"><span><Clock3 size={15} />{recipe.minutes} min</span><span><Users size={15} />{recipe.servings} {recipe.servings === 1 ? 'ración' : 'raciones'}</span></div></div></button><button className={`card-favorite icon-button ${recipe.favorite ? 'is-favorite' : ''}`} title={recipe.favorite ? 'Quitar de favoritas' : 'Añadir a favoritas'} aria-label={`${recipe.favorite ? 'Quitar' : 'Añadir'} ${recipe.title} ${recipe.favorite ? 'de' : 'a'} favoritas`} onClick={() => { void favorite(recipe); }}><Heart size={19} fill={recipe.favorite ? 'currentColor' : 'none'} /></button></article>)}</div>
            : recipes.length || search || category || favorites ? <div className="empty-search"><Search size={32} strokeWidth={1.3} /><h2>{favorites ? 'Tus favoritas tendrán su sitio aquí' : 'No encontramos esa receta'}</h2><p className="muted">{favorites ? 'Marca con un corazón las recetas que quieras tener a mano.' : 'Prueba con otro nombre o ingrediente.'}</p><button className="button" onClick={() => goLibrary()}>Ver todas las recetas</button></div>
            : <><div className="first-recipe"><div className="notebook-mark"><BookOpen size={35} strokeWidth={1.3} /><Heart size={15} /></div><div><h2>La primera hoja es tuya.</h2><p>Ese plato que siempre sale bien.<br />El que no quieres olvidar.</p></div><button className="button" onClick={() => createRecipe()}><Plus size={18} />Escribir mi primera receta</button></div><section className="example-section"><div className="section-heading"><h2>Un poco de inspiración</h2><span className="muted">Recetas de ejemplo</span></div><div className="example-grid">{exampleRecipes.map((r, i) => <article className="example-card" key={r.title}><img src={r.photos[0]} alt={r.title} /><div><span className="category-label">{r.category}</span><h3>{r.title}</h3><div className="example-bottom"><span><Clock3 size={14} />{r.minutes} min</span><button className="icon-button" title={`Añadir ${r.title} a mi libro`} aria-label={`Añadir ${r.title} a mi libro`} onClick={() => createRecipe(makeExample(i))}><Plus size={19} /></button></div></div></article>)}</div></section></>}
          {!!recipes.length && <div className="library-footer"><span>{book.name}</span><span>Con cariño, a fuego lento.</span></div>}
        </div>}
      </main>
    </div>
    {view !== 'editor' && <nav className="mobile-nav" aria-label="Navegación móvil"><button className={!favorites ? 'active' : ''} onClick={() => goLibrary()}><BookOpen size={21} /><span>Recetas</span></button><button className="mobile-add" onClick={() => createRecipe()} title="Nueva receta" aria-label="Nueva receta"><Plus size={24} /></button><button className={favorites ? 'active' : ''} onClick={() => goLibrary(true)}><Heart size={21} /><span>Favoritas</span></button></nav>}
    {settings && <BookSettings book={book} recipes={recipes} status={status} syncError={syncError} onSync={() => { void synchronize(); }} created={settings === 'created'} onClose={() => setSettings(false)} installPrompt={installPrompt} onImport={async values => { await importRecipes(book.code, values); await refreshRecipes(book); setView('library'); setToast({ text: `${values.length} recetas restauradas` }); void synchronize(); }} onLeave={async () => { await leaveBook(); activeBook.current = null; setBookState(null); setSettings(false); setRecipes([]); }} />}
    {deleteRecipe && <Modal title="Eliminar receta" onClose={() => setDeleteRecipe(null)}><div className="confirm-body"><p>¿Quieres eliminar «{deleteRecipe.title}» de tu libro?</p></div><div className="modal-footer"><button className="button" onClick={() => setDeleteRecipe(null)}>Cancelar</button><button className="button danger" onClick={() => { void remove(deleteRecipe); }}><Trash2 size={16} />Eliminar receta</button></div></Modal>}
    {(toast || needRefresh) && <div className="toast" role="status"><Check size={18} /><span>{toast?.text ?? 'Hay una nueva versión disponible.'}</span>{toast?.undo && <button onClick={async () => { const value = toast.undo!; if (book) { try { await saveLocal(book.code, { ...value, updatedAt: new Date().toISOString() }); await refreshRecipes(book); setToast({ text: 'Receta recuperada' }); void synchronize(); } catch { setToast({ text: 'No se ha podido recuperar la receta.' }); } } }}>Deshacer</button>}{needRefresh && !toast && <button disabled={view === 'editor'} title={view === 'editor' ? 'Guarda los cambios antes de actualizar' : 'Actualizar aplicación'} onClick={() => { void updateServiceWorker(true); }}>Actualizar</button>}<button className="icon-button" title="Cerrar aviso" aria-label="Cerrar aviso" onClick={() => { setToast(null); setNeedRefresh(false); }}><X size={16} /></button></div>}
  </div>;
}
