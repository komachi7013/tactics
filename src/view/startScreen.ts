import { readCampaign, type StorageLike } from '../campaign';

/** Observe the existing reader's one read; never create, repair or reset a save here. */
export function readStartProgress(storage: StorageLike) {
  let exists = false;
  const loaded = readCampaign({
    getItem: key => { const raw = storage.getItem(key); exists = raw !== null; return raw; },
    setItem: (key, value) => storage.setItem(key, value),
    removeItem: key => storage.removeItem(key),
  });
  return { ...loaded, hasCheckpoint: exists && loaded.writable };
}

export interface StartScreenOptions {
  hasCheckpoint: boolean;
  battleLabel: string;
  warning?: string;
  qaNotice?: string;
  start: () => void;
}

/** Initial boot only. One explicit action transfers ownership to the existing intro. */
export function mountStartScreen(host: HTMLElement, options: StartScreenOptions): () => void {
  const doc = host.ownerDocument;
  const root = doc.createElement('section'); root.className = 'start-screen';
  root.setAttribute('role', 'dialog'); root.setAttribute('aria-modal', 'true'); root.setAttribute('aria-labelledby', 'start-title');
  const art = doc.createElement('div'); art.className = 'start-art';
  const image = doc.createElement('img'); image.src = '/assets/title/title-battle-v1.png'; image.alt = ''; image.decoding = 'async';
  art.append(image);
  const copy = doc.createElement('div'); copy.className = 'start-copy';
  const seal = doc.createElement('span'); seal.className = 'start-seal'; seal.textContent = '澪'; seal.setAttribute('aria-hidden', 'true');
  const title = doc.createElement('h1'); title.id = 'start-title'; title.textContent = '澪を継ぐ者';
  const subtitle = doc.createElement('p'); subtitle.className = 'start-subtitle'; subtitle.textContent = '流域盟約戦記';
  const rule = doc.createElement('div'); rule.className = 'start-rule'; rule.setAttribute('aria-hidden', 'true');
  const action = doc.createElement('button'); action.type = 'button'; action.className = 'start-action';
  action.textContent = options.hasCheckpoint ? '続きから' : 'はじめる';
  const note = doc.createElement('p'); note.id = 'start-progress-note'; note.className = 'start-note';
  note.textContent = options.hasCheckpoint
    ? `${options.battleLabel}の導入から再開します。戦闘途中のHP・手番は保存されません。`
    : '物語と作戦説明から始めます。';
  action.setAttribute('aria-describedby', note.id);
  const warning = doc.createElement('p'); warning.className = 'start-warning'; warning.setAttribute('role', 'status');
  warning.textContent = options.warning ?? ''; warning.hidden = !options.warning;
  const fallback = doc.createElement('p'); fallback.className = 'start-image-note'; fallback.setAttribute('role', 'status'); fallback.hidden = true;
  const qa = doc.createElement('p'); qa.className = 'start-qa'; qa.textContent = options.qaNotice ?? ''; qa.hidden = !options.qaNotice;
  copy.append(seal, title, subtitle, rule, action, note, warning, fallback, qa);
  root.append(art, copy); host.replaceChildren(root);
  let disposed = false, started = false;
  const opened = performance.now();
  const activate = () => {
    if (disposed || started || !root.isConnected || performance.now() - opened < 220) return;
    started = true; action.disabled = true; options.start();
  };
  action.onclick = event => { event.preventDefault(); event.stopPropagation(); if (event.detail < 2) activate(); };
  const keys = (event: KeyboardEvent) => {
    if (event.ctrlKey || event.metaKey || event.altKey || event.key === 'Tab') return;
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault(); event.stopPropagation();
      if (!event.repeat && event.target === action) activate();
    } else if (event.key === 'Escape' || event.key.startsWith('Arrow')) {
      event.stopPropagation(); // Reading/scrolling never selects a battlefield cell.
    }
  };
  root.addEventListener('keydown', keys);
  image.onerror = () => {
    if (disposed || !root.isConnected) return;
    image.hidden = true; root.classList.add('start-image-unavailable');
    fallback.textContent = '背景画像を読み込めませんでした。開始できます。'; fallback.hidden = false;
  };
  action.focus();
  return () => { disposed = true; root.removeEventListener('keydown', keys); action.onclick = null; image.onerror = null; };
}
