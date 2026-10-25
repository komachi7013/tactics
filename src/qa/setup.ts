import { CAMPAIGN_KEY, readCampaign, writeCampaign } from '../campaign';
import { buildFourBattleCheckpoint, buildFiveBattleCheckpoint, buildSixBattleCheckpoint, buildSevenBattleCheckpoint, buildEightBattleCheckpoint, buildNineBattleCheckpoint, buildTenBattleCheckpoint } from './checkpoint';
import { createQaStorage, qaStorageKey } from './storage';

const root = document.getElementById('qa-setup')!;
if (!import.meta.env.DEV) root.textContent = 'この準備画面は開発サーバー専用です。';
else {
  const target = root.dataset.targetBattle === 'B12' ? 'B12' : root.dataset.targetBattle === 'B11' ? 'B11' : root.dataset.targetBattle === 'B10' ? 'B10' : root.dataset.targetBattle === 'B09' ? 'B09' : root.dataset.targetBattle === 'B08' ? 'B08' : root.dataset.targetBattle === 'B07' ? 'B07' : 'B06';
  const prior = target === 'B12' ? 'B11' : target === 'B11' ? 'B10' : target === 'B10' ? 'B09' : target === 'B09' ? 'B08' : target === 'B08' ? 'B07' : target === 'B07' ? 'B06' : 'B05';
  const count = target === 'B12' ? 10 : target === 'B11' ? 9 : target === 'B10' ? 8 : target === 'B09' ? 7 : target === 'B08' ? 6 : target === 'B07' ? 5 : 4;
  root.style.cssText = 'max-width:900px;margin:32px auto;padding:16px;font:16px/1.8 sans-serif';
  const heading = document.createElement('h1'); heading.textContent = `${target} 隔離QAの開始条件`;
  const notice = document.createElement('p'); notice.textContent = `B01〜B${String(count).padStart(2, '0')}の公式fixture＋正規AIから${count}戦済みデータを作ります。実機プレイ合格ではありません。通常保存は読まず・変更せず、${prior}と${target}は通常UIで検証します。`;
  const label = document.createElement('label'); label.textContent = 'QA ID（同じIDとURLで再開） ';
  const input = document.createElement('input'); input.value = new URLSearchParams(location.search).get('session') ?? `${target.toLowerCase()}-chrome-20261018-a`;
  input.size = 32; label.append(input);
  const status = document.createElement('p'); status.setAttribute('role', 'status');
  const preview = document.createElement('pre'); preview.style.whiteSpace = 'pre-wrap';
  const create = document.createElement('button'); create.textContent = `空の隔離キーへ${count}戦済みfixtureを作成`;
  const resume = document.createElement('a'); resume.textContent = `同じ隔離QAで${prior}／現在のチェックポイントを開く`;
  const remove = document.createElement('button'); remove.textContent = 'このQA IDの保存だけを削除（通常保存は保持）';
  let message = '';
  function refresh() {
    try {
      const session = input.value, key = qaStorageKey(session);
      const store = createQaStorage(window.localStorage, session), raw = store.getItem(CAMPAIGN_KEY);
      create.disabled = raw !== null; remove.disabled = raw === null;
      resume.href = `/?qaSession=${encodeURIComponent(session)}`;
      status.textContent = `${message} origin=${location.origin} / QAキー=${key} / ${raw === null ? '空・未作成' : '既存QAデータあり・上書き禁止'}`;
      const loaded = readCampaign(store);
      preview.textContent = JSON.stringify({ kind: 'QA preparation, not browser acceptance', warning: loaded.warning, campaign: loaded.campaign }, null, 2);
    } catch (error) { create.disabled = true; remove.disabled = true; resume.removeAttribute('href'); status.textContent = String(error); }
  }
  create.onclick = () => {
    try {
      const store = createQaStorage(window.localStorage, input.value);
      if (store.getItem(CAMPAIGN_KEY) !== null) throw new Error('既存QAデータを保持しました。再開リンクか別のQA IDを使ってください。');
      const checkpoint = target === 'B12' ? buildTenBattleCheckpoint() : target === 'B11' ? buildNineBattleCheckpoint() : target === 'B10' ? buildEightBattleCheckpoint() : target === 'B09' ? buildSevenBattleCheckpoint() : target === 'B08' ? buildSixBattleCheckpoint() : target === 'B07' ? buildFiveBattleCheckpoint() : buildFourBattleCheckpoint();
      const saved = writeCampaign(store, checkpoint);
      if (!saved.ok) throw new Error(saved.error);
      message = `fixture作成済み。${prior}は未クリア、${target}は未解放です。`;
    } catch (error) { message = String(error); }
    refresh();
  };
  remove.onclick = () => {
    try { createQaStorage(window.localStorage, input.value).removeItem(CAMPAIGN_KEY); message = 'このQA IDのみ削除しました。'; }
    catch (error) { message = String(error); }
    refresh();
  };
  input.oninput = () => { message = ''; refresh(); };
  root.append(heading, notice, label, status, create, document.createElement('br'), resume, document.createElement('br'), remove, preview);
  refresh();
}
