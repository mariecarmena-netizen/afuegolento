import { useRef, useState } from 'react';
import { Check, Copy, Download, KeyRound, LoaderCircle, LogOut, Smartphone, Upload } from 'lucide-react';
import { parseBackup, type Backup, type Book, type Recipe } from '../model';
import type { SyncStatus } from '../sync';
import { Modal } from './Modal';

export const syncLabels: Record<SyncStatus, string> = { local: 'Sincronización pendiente de activar', syncing: 'Sincronizando…', synced: 'Libro sincronizado', offline: 'Sin conexión · guardado en este dispositivo', error: 'Cambios pendientes de sincronizar' };
export type InstallPrompt = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };
export default function BookSettings({ book, recipes, status, created, onClose, onImport, onLeave, installPrompt }: {
  book: Book; recipes: Recipe[]; status: SyncStatus; created: boolean; onClose: () => void;
  onImport: (recipes: Recipe[]) => Promise<void>; onLeave: () => Promise<void>; installPrompt: InstallPrompt | null;
}) {
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const codeRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  async function copy() {
    try { await navigator.clipboard.writeText(book.code); setCopied(true); }
    catch { codeRef.current?.select(); setError('La clave está seleccionada. Usa la opción Copiar de tu dispositivo.'); }
  }
  function exportBackup() {
    const backup: Backup = { format: 'afuegolento', version: 1, exportedAt: new Date().toISOString(), bookName: book.name, recipes };
    const url = URL.createObjectURL(new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' }));
    const link = document.createElement('a'); link.href = url; link.download = `afuegolento-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.append(link); link.click(); link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  async function importBackup(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]; event.target.value = '';
    if (!file) return;
    setError(''); setBusy(true);
    try {
      if (file.size > 50000000) throw new Error('El archivo supera los 50 MB.');
      const backup = parseBackup(await file.text());
      await onImport(backup.recipes);
      onClose();
    } catch (err) { setError(err instanceof Error ? err.message : 'No se ha podido restaurar la copia.'); }
    finally { setBusy(false); }
  }
  return <Modal title={created ? 'Tu libro ya tiene su clave' : 'Mi libro'} onClose={() => { if (!busy) onClose(); }}>
    <div className="settings-body"><div className="book-identity"><img src="/icons/icon-192.png" alt="" /><div><h3>{book.name}</h3><span className="muted">{recipes.length} {recipes.length === 1 ? 'receta' : 'recetas'}</span></div></div>
      <section className="settings-section"><h3><KeyRound size={18} />Clave del libro</h3><div className="book-code"><input ref={codeRef} aria-label="Clave del libro" value={book.code} readOnly onFocus={e => e.target.select()} /><button className="icon-button" title={copied ? 'Clave copiada' : 'Copiar clave'} aria-label={copied ? 'Clave copiada' : 'Copiar clave'} onClick={copy}>{copied ? <Check size={19} /> : <Copy size={19} />}</button></div><p className="settings-note">Guarda esta clave en un lugar seguro. Cualquier persona que la tenga podrá abrir tu libro cuando la sincronización esté activa.</p><div className={`sync-message status-${status}`}><span className="status-dot" />{syncLabels[status]}</div>{status === 'local' && <p className="settings-note">Por ahora, tus recetas y fotos están guardadas en este dispositivo. La clave funcionará en otros dispositivos cuando se active la sincronización y este libro se suba por primera vez.</p>}</section>
      <section className="settings-section"><h3><Download size={18} />Copia de seguridad</h3><div className="settings-buttons"><button className="button" onClick={exportBackup} disabled={busy}><Download size={17} />Descargar copia</button><button className="button" onClick={() => fileRef.current?.click()} disabled={busy}>{busy ? <LoaderCircle className="spin" size={17} /> : <Upload size={17} />}Restaurar copia</button></div><input ref={fileRef} type="file" accept=".json,application/json" onChange={importBackup} hidden /><p className="settings-note">La copia incluye las fotos. Al restaurarla se añaden las recetas a este libro.</p></section>
      <section className="settings-section"><h3><Smartphone size={18} />En la pantalla de tu móvil</h3>{installPrompt ? <button className="button" onClick={async () => { await installPrompt.prompt(); await installPrompt.userChoice; }}><Smartphone size={17} />Instalar A fuego lento</button> : <p className="settings-note">En iPhone: abre la app en Safari, pulsa Compartir y «Añadir a pantalla de inicio». En Android: abre el menú del navegador y elige «Instalar aplicación» o «Añadir a pantalla de inicio».</p>}</section>
      {error && <p className="error" role="alert">{error}</p>}
      <section className="settings-section leave-section">{leaving ? <><p>Conserva tu clave y una copia de seguridad antes de salir. Las recetas seguirán guardadas en este dispositivo.</p><div className="settings-buttons"><button className="button small" onClick={() => setLeaving(false)}>Cancelar</button><button className="button small danger" onClick={async () => { setBusy(true); try { await onLeave(); } catch { setError('No se ha podido salir del libro.'); setBusy(false); } }} disabled={busy}>Salir del libro</button></div></> : <button className="button subtle" onClick={() => setLeaving(true)}><LogOut size={17} />Abrir otro libro</button>}</section>
    </div><div className="modal-footer"><button className="button primary" onClick={onClose} disabled={busy}>{created ? 'Empezar mi recetario' : 'Listo'}</button></div>
  </Modal>;
}
