import { useState } from 'react';
import { BookOpen, KeyRound, LoaderCircle, Plus } from 'lucide-react';
import { createBookCode, formatCode, type Book } from '../model';
import { getEntries, setBook } from '../storage';
import { openCloudBook } from '../sync';

export default function BookGate({ onReady }: { onReady: (book: Book, created: boolean) => void }) {
  const [mode, setMode] = useState<'create' | 'open'>('create');
  const [name, setName] = useState('Mi libro de recetas');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function submit(event: React.FormEvent) {
    event.preventDefault(); setError(''); setBusy(true);
    try {
      if (mode === 'create') {
        const book = { code: createBookCode(), name: name.trim(), createdAt: new Date().toISOString() };
        await setBook(book);
        navigator.storage?.persist?.().catch(() => {});
        onReady(book, true);
      } else {
        const book = await openCloudBook(code);
        await getEntries(book.code);
        onReady(book, false);
      }
    } catch (err) { setError(err instanceof Error ? err.message : 'No se ha podido abrir el libro.'); }
    finally { setBusy(false); }
  }
  return <main className="book-gate">
    <div className="gate-brand"><img src="/icons/icon-512.png" alt="" /><span className="eyebrow">TU RECETARIO PERSONAL</span><h1>A fuego lento</h1><p>Las recetas que merecen quedarse.</p></div>
    <div className="gate-form">
      <div className="segmented" role="tablist" aria-label="Libro de recetas">
        <button role="tab" aria-selected={mode === 'create'} onClick={() => { setMode('create'); setError(''); }}><Plus size={17} />Crear un libro</button>
        <button role="tab" aria-selected={mode === 'open'} onClick={() => { setMode('open'); setError(''); }}><KeyRound size={17} />Abrir mi libro</button>
      </div>
      <form onSubmit={submit}>
        {mode === 'create' ? <label>Nombre del libro<input value={name} onChange={e => setName(e.target.value)} required minLength={2} maxLength={80} autoComplete="off" /></label>
          : <label>Clave de tu libro<input className="code-input" value={code} onChange={e => setCode(formatCode(e.target.value))} placeholder="XXXXXX-XXXXXX-XXXXXX-XXXXXX" required maxLength={27} autoCapitalize="characters" autoComplete="off" spellCheck={false} /></label>}
        {error && <p className="error" role="alert">{error}</p>}
        <button className="button primary gate-submit" disabled={busy || (mode === 'create' && name.trim().length < 2)}>{busy ? <LoaderCircle className="spin" size={19} /> : <BookOpen size={19} />}{mode === 'create' ? 'Crear mi libro' : 'Abrir mi libro'}</button>
      </form>
      <p className="gate-note">{mode === 'create' ? 'Al crearlo recibirás una clave única. Guárdala para abrir este mismo libro en otro dispositivo cuando esté conectada la sincronización.' : 'Introduce la clave del libro que creaste en tu otro dispositivo. El libro original debe haberse sincronizado al menos una vez.'}</p>
    </div>
    <p className="gate-footer">Hecho para cocinar, recordar y compartir.</p>
  </main>;
}
