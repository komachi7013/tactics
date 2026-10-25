import { CAMPAIGN_KEY, type StorageLike } from '../campaign';

export function qaStorageKey(session: string) {
  if (!/^[a-z0-9][a-z0-9-]{7,63}$/.test(session)) throw new Error('QA IDは8〜64文字の英小文字・数字・ハイフンで指定してください。');
  return `mio-tactics.qa.v1.${session}`;
}

// The application sees its usual key, but every operation is confined to the
// explicitly selected QA namespace. Never read, merge, clear or restore the
// user's ordinary campaign key (or another QA session).
export function createQaStorage(raw: StorageLike, session: string): StorageLike {
  const isolated = qaStorageKey(session);
  const key = (requested: string) => {
    if (requested !== CAMPAIGN_KEY) throw new Error('QA保存領域外へのアクセスを拒否しました。');
    return isolated;
  };
  return { getItem: k => raw.getItem(key(k)), setItem: (k, v) => raw.setItem(key(k), v), removeItem: k => raw.removeItem(key(k)) };
}

export function selectProgressStorage(raw: StorageLike, search: string) {
  const query = new URLSearchParams(search);
  if (!query.has('qaSession')) return { storage: raw, session: null };
  if (query.getAll('qaSession').length !== 1) throw new Error('QA IDを複数指定できません。');
  const session = query.get('qaSession')!;
  return { storage: createQaStorage(raw, session), session };
}
