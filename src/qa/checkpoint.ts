import { completeBattle, createCampaign, selectBattle, type Campaign } from '../campaign';
import { createInitialState, reduce } from '../domain/engine';
import { runEnemyActivation } from '../domain/ai';
import type { BattleId, Command } from '../domain/types';
import b01 from '../../tests/fixtures/routes.json';
import b02 from '../../tests/fixtures/b02-route.json';
import b03 from '../../tests/fixtures/b03-route.json';
import b04 from '../../tests/fixtures/b04-route.json';
import b05 from '../../tests/fixtures/b05-route.json';
import b06 from '../../tests/fixtures/b06-route.json';
import b07 from '../../tests/fixtures/b07-route.json';
import b08 from '../../tests/fixtures/b08-route.json';
import b09 from '../../tests/fixtures/b09-route.json';
import b10 from '../../tests/fixtures/b10-route.json';

// Test preparation only: replay the checked-in player commands and real AI in
// memory. These are not browser-play results. B05 and B06 remain uncompleted.
export function buildFourBattleCheckpoint(): Campaign {
  let campaign = createCampaign();
  for (const [id, commands] of [
    ['B01', b01.gate.commands], ['B02', b02.commands], ['B03', b03.commands], ['B04', b04.commands],
  ] as [BattleId, Command[]][]) {
    let state = createInitialState(id);
    for (const command of commands) {
      if (state.phase !== 'playing' || state.turn !== 'player') throw new Error(`${id}: fixtureの手番が不正です。`);
      const result = reduce(state, command);
      if (result.error) throw new Error(`${id}: ${result.error}`);
      state = result.state;
      let responses = 0;
      while (state.phase === 'playing' && state.turn === 'enemy') {
        if (++responses > 3) throw new Error(`${id}: 敵の応手が終わりません。`);
        state = runEnemyActivation(state);
      }
    }
    if (state.phase !== 'won') throw new Error(`${id}: fixtureが勝利していません。`);
    campaign = completeBattle(campaign, state);
  }
  return selectBattle(campaign, 'B05');
}

// B07 preparation stops before B06. Chrome must earn B06 normally and use its
// victory button to test the B06 -> B07 transition; never pre-unlock B07.
export function buildFiveBattleCheckpoint(): Campaign {
  const campaign = buildFourBattleCheckpoint();
  let state = createInitialState('B05');
  for (const command of b05.optional.commands as Command[]) {
    if (state.phase !== 'playing' || state.turn !== 'player') throw new Error('B05: fixtureの手番が不正です。');
    const result = reduce(state, command);
    if (result.error) throw new Error(`B05: ${result.error}`);
    state = result.state;
    let responses = 0;
    while (state.phase === 'playing' && state.turn === 'enemy') {
      if (++responses > 3) throw new Error('B05: 敵の応手が終わりません。');
      state = runEnemyActivation(state);
    }
  }
  if (state.phase !== 'won') throw new Error('B05: fixtureが勝利していません。');
  return selectBattle(completeBattle(campaign, state), 'B06');
}

// B08 starts before B07: browser QA must earn B07 and follow its victory button.
export function buildSixBattleCheckpoint(): Campaign {
  const campaign = buildFiveBattleCheckpoint();
  let state = createInitialState('B06');
  for (const command of b06.victory.commands as Command[]) {
    if (state.phase !== 'playing' || state.turn !== 'player') throw new Error('B06: fixtureの手番が不正です。');
    const result = reduce(state, command);
    if (result.error) throw new Error(`B06: ${result.error}`);
    state = result.state;
    let responses = 0;
    while (state.phase === 'playing' && state.turn === 'enemy') {
      if (++responses > 3) throw new Error('B06: 敵の応手が終わりません。');
      state = runEnemyActivation(state);
    }
  }
  if (state.phase !== 'won') throw new Error('B06: fixtureが勝利していません。');
  return selectBattle(completeBattle(campaign, state), 'B07');
}

// B09 preparation stops before B08. Browser QA earns B08 and follows its victory button.
export function buildSevenBattleCheckpoint(): Campaign {
  const campaign = buildSixBattleCheckpoint();
  let state = createInitialState('B07');
  for (const command of b07.victory.commands as Command[]) {
    if (state.phase !== 'playing' || state.turn !== 'player') throw new Error('B07: fixtureの手番が不正です。');
    const result = reduce(state, command);
    if (result.error) throw new Error(`B07: ${result.error}`);
    state = result.state;
    let responses = 0;
    while (state.phase === 'playing' && state.turn === 'enemy') {
      if (++responses > 3) throw new Error('B07: 敵の応手が終わりません。');
      state = runEnemyActivation(state);
    }
  }
  if (state.phase !== 'won') throw new Error('B07: fixtureが勝利していません。');
  return selectBattle(completeBattle(campaign, state), 'B08');
}

// B10 preparation stops before B09. Chrome earns B09 then uses its victory button.
export function buildEightBattleCheckpoint(): Campaign {
  const campaign = buildSevenBattleCheckpoint();
  let state = createInitialState('B08');
  for (const command of b08.victory.commands as Command[]) {
    if (state.phase !== 'playing' || state.turn !== 'player') throw new Error('B08: fixtureの手番が不正です。');
    const result = reduce(state, command);
    if (result.error) throw new Error(`B08: ${result.error}`);
    state = result.state;
    let responses = 0;
    while (state.phase === 'playing' && state.turn === 'enemy') {
      if (++responses > 3) throw new Error('B08: 敵の応手が終わりません。');
      state = runEnemyActivation(state);
    }
  }
  if (state.phase !== 'won') throw new Error('B08: fixtureが勝利していません。');
  return selectBattle(completeBattle(campaign, state), 'B09');
}

// B11 preparation stops before B10: native QA earns B10 and uses its victory button.
export function buildNineBattleCheckpoint(): Campaign {
  const campaign = buildEightBattleCheckpoint();
  let state = createInitialState('B09');
  for (const command of b09.victory.commands as Command[]) {
    if (state.phase !== 'playing' || state.turn !== 'player') throw new Error('B09: fixtureの手番が不正です。');
    const result = reduce(state, command);
    if (result.error) throw new Error(`B09: ${result.error}`);
    state = result.state;
    let responses = 0;
    while (state.phase === 'playing' && state.turn === 'enemy') {
      if (++responses > 3) throw new Error('B09: 敵の応手が終わりません。');
      state = runEnemyActivation(state);
    }
  }
  if (state.phase !== 'won') throw new Error('B09: fixtureが勝利していません。');
  return selectBattle(completeBattle(campaign, state), 'B10');
}

// B12 preparation stops before B11. Native QA earns B11 and follows the final-battle button.
export function buildTenBattleCheckpoint(): Campaign {
  const campaign = buildNineBattleCheckpoint();
  let state = createInitialState('B10');
  for (const command of b10.victory.commands as Command[]) {
    if (state.phase !== 'playing' || state.turn !== 'player') throw new Error('B10: fixtureの手番が不正です。');
    const result = reduce(state, command);
    if (result.error) throw new Error(`B10: ${result.error}`);
    state = result.state;
    let responses = 0;
    while (state.phase === 'playing' && state.turn === 'enemy') {
      if (++responses > 3) throw new Error('B10: 敵の応手が終わりません。');
      state = runEnemyActivation(state);
    }
  }
  if (state.phase !== 'won') throw new Error('B10: fixtureが勝利していません。');
  return selectBattle(completeBattle(campaign, state), 'B11');
}
