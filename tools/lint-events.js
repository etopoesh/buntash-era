#!/usr/bin/env node
/*
 * Линтер events.json — ТЗ 20, этап 1, раздел 5.
 * Падает с понятным списком ошибок.
 * Запуск: node tools/lint-events.js
 */
const fs = require('fs');
const path = require('path');

const EVENTS_PATH = path.join(__dirname, '..', 'events.json');
const VEC_PATH = path.join(__dirname, '..', 'plus', 'verify-vectors.json');

const errors = [];
const eventsDoc = JSON.parse(fs.readFileSync(EVENTS_PATH, 'utf8'));
const evs = Array.isArray(eventsDoc) ? eventsDoc : eventsDoc.events;
const vec = JSON.parse(fs.readFileSync(VEC_PATH, 'utf8'));
const filtered = evs.filter(e => !e.hidden);
const lint = vec.eventsLint || {};
const err = msg => errors.push(msg);

// ---- 1. Счёт и порядок записей (раздел 1.2, проверка eventsLint вектора) ----
if (filtered.length !== lint.expectedTotal){
  err('eventsLintTotal: ожидалось ' + lint.expectedTotal + ' записей, найдено ' + filtered.length);
}
const gatesNow = filtered.map((e, i) => e.type === 'assembly' ? i : -1).filter(i => i >= 0);
if (JSON.stringify(gatesNow) !== JSON.stringify(lint.positions.gateIndexes || [])){
  err('eventsLintGates: индексы gate ' + JSON.stringify(gatesNow) + ' ожидалось ' + JSON.stringify(lint.positions.gateIndexes));
}
const typesNow = {assembly: 0, normal: 0, narrative: 0};
filtered.forEach(e => { if (e.type in typesNow) typesNow[e.type]++; });
if (typesNow.assembly !== (lint.types ? lint.types.gate : 4)) err('eventsLintTypes: assembly=' + typesNow.assembly + ' ожидалось ' + (lint.types ? lint.types.gate : 4));
if (typesNow.normal !== (lint.types ? lint.types.normal : 57)) err('eventsLintTypes: normal=' + typesNow.normal + ' ожидалось ' + (lint.types ? lint.types.normal : 57));
if (typesNow.narrative !== (lint.types ? lint.types.narrative : 3)) err('eventsLintTypes: narrative=' + typesNow.narrative + ' ожидалось ' + (lint.types ? lint.types.narrative : 3));
const narrNow = filtered.filter(e => e.type === 'narrative');
if (JSON.stringify(narrNow.map(e => e.turn)) !== JSON.stringify(lint.narrativeTurns || [])){
  err('eventsLintNarrativeTurns: ' + JSON.stringify(narrNow.map(e => e.turn)) + ' ожидалось ' + JSON.stringify(lint.narrativeTurns));
}
Object.keys(lint.positions.turnRanges || {}).forEach(range => {
  const [lo, hi] = (lint.positions.turnRanges)[range];
  const wantLo = parseInt(range.split('-')[0], 10);
  const wantHi = parseInt(range.split('-')[1], 10);
  for (let i = lo; i <= hi; i++){
    const ev = filtered[i];
    const expectTurn = wantLo + (i - lo);
    if (!ev || ev.type === 'assembly' || ev.turn !== expectTurn){
      err('eventsLintTurnRanges: индекс ' + i + ' должен быть turn=' + expectTurn + ', получен ' + (ev ? ev.turn : 'нет элемента'));
    }
  }
});
const last = filtered[filtered.length - 1];
if (!last || last.type !== 'assembly' || last.final !== true){
  err('eventsLintOrder: последняя запись должна быть gate с final=true');
}
if (!filtered.length || filtered[0].type !== 'assembly'){
  err('eventsLintOrder: перед первым ходом должен стоять gate');
}

// ---- 2. id уникальны; у normal >= 2 варианта, у narrative вариантов нет ----
const seenIds = {};
filtered.forEach(e => {
  if (seenIds[e.id]) err('eventsLintIds: дубликат id ' + e.id);
  seenIds[e.id] = true;
});
filtered.forEach(e => {
  if (e.type === 'normal') {
    if (!Array.isArray(e.choices) || e.choices.length < 2) err('eventsLintChoices: normal ' + e.id + ' имеет ' + (e.choices ? e.choices.length : 0) + ' вариантов, нужно >= 2');
  }
  if (e.type === 'narrative') {
    if (Array.isArray(e.choices) && e.choices.length > 0) err('eventsLintChoices: narrative ' + e.id + ' не должен иметь вариантов');
  }
});

// ---- 3. Запрещённые шаблоны в текстовых полях ----
const textFields = lint.textFields || ['description', 'label', 'outcomeText', 'text', 'narrative'];
const forbidden = lint.forbiddenInTextFields || [];
const fieldsToCheck = [...textFields];
if (!fieldsToCheck.includes('outcomeTitle')) fieldsToCheck.push('outcomeTitle'); // линтер строже ТЗ: дополнительно проверяем outcomeTitle
const checkText = (v, f, evId) => {
  if (typeof v !== 'string') return;
  forbidden.forEach((s, i) => {
    let rx;
    try { rx = new RegExp(s, 'i'); } catch (e) { return; }
    if (rx.test(v)) err('eventsLintText: запрещённый шаблон ' + i + ' в поле ' + f + ' у события ' + evId + ': ' + v.slice(0, 120));
  });
};
filtered.forEach(e => {
  textFields.concat(['outcomeTitle']).forEach(f => checkText(e[f], f, e.id));
  (e.choices || []).forEach(c => {
    textFields.concat(['outcomeTitle']).forEach(f => checkText(c[f], f, e.id + '/' + c.key));
    checkText(c.outcomeTextOverride, 'outcomeTextOverride', e.id + '/' + c.key);
  });
});

// ---- 4. Требует флаг, который должен ставиться setFlags на более раннем ходу ----
const setFlagTurns = {}; // flag -> turn, где первый был поставлен через setFlags
filtered.forEach(e => {
  (e.choices || []).forEach(c => {
    (c.setFlags || []).forEach(f => { if (setFlagTurns[f] === undefined) setFlagTurns[f] = e.turn; });
  });
});
const getSetFlagTurn = (flag, beforeTurn) => setFlagTurns[flag] !== undefined && setFlagTurns[flag] < beforeTurn;
filtered.forEach(e => {
  (e.choices || []).forEach(c => {
    if (c.requires && Array.isArray(c.requires.flags)) {
      c.requires.flags.forEach(f => {
        if (!getSetFlagTurn(f, e.turn)) err('eventsLintFlags: requires.flags ' + f + ' у ' + e.id + '/' + c.key + ' не найдена ставка ранее (turn < ' + e.turn + ')');
      });
    }
  });
});

// ---- 5. majority: turn-ссылки на более ранний ход, структура nationalEffect ----
filtered.forEach(e => {
  (e.choices || []).forEach(c => {
    if (c.majority) {
      if (c.majority.turn !== undefined && !filtered.some(o => o.id === c.majority.turn)) err('eventsLintMajority: majority.turn ' + c.majority.turn + ' у ' + e.id + '/' + c.key + ' не существует');
      if (c.majorityBonus && c.majorityBonus.nationalEffect) {
        const ne = c.majorityBonus.nationalEffect;
        if (ne && typeof ne === 'object') {
          Object.keys(ne).forEach(k => {
            if (k !== 'stability' && k !== 'centralization') err('eventsLintMajority: неизвестный ключ nationalEffect ' + k + ' у ' + e.id + '/' + c.key);
          });
          Object.keys(ne).forEach(k => { if (typeof ne[k] !== 'number' || !Number.isInteger(ne[k])) err('eventsLintMajority: nationalEffect.' + k + ' у ' + e.id + '/' + c.key + ' должен быть целым числом'); });
        }
      }
      // Военный блок (R9): deploy/casualties — дробные шкалы, scale[].effect — целые дельты
      const mil = c.military;
      if (mil) {
        if (typeof mil.deploy !== 'number' || mil.deploy < 0 || mil.deploy > 1) err('eventsLintMilitary: deploy у ' + e.id + '/' + c.key + ' должен быть числом в [0,1]');
        if (mil.casualties !== undefined && (typeof mil.casualties !== 'number' || mil.casualties < 0 || mil.casualties > 1)) err('eventsLintMilitary: casualties у ' + e.id + '/' + c.key + ' должен быть числом в [0,1]');
        if (Array.isArray(mil.scale)) {
          mil.scale.forEach(s => {
            if (['fielded', 'missing', 'due', 'extra'].indexOf(s.by) === -1) err('eventsLintMilitary: неизвестный by=' + s.by + ' у ' + e.id + '/' + c.key);
            if (typeof s.every !== 'number' || !Number.isInteger(s.every) || s.every < 1) err('eventsLintMilitary: bad scale.every у ' + e.id + '/' + c.key);
            if (s.effect) checkEffectsAnywhere(s.effect, e.id + '#' + c.key + '#milScale');
          });
        }
      }
    }
  });
});

// ---- 6. В effect только известные ключи, целые числа, дробные только в военных снижениях ----
const EFFECT_KEYS = ['slava', 'krestyane', 'zoloto', 'bribe', 'income', 'incomeEnd', 'casualtyReduction'];
const checkEffectKeys = (eff, ctx) => {
  if (!eff || typeof eff !== 'object') return;
  Object.keys(eff).forEach(k => {
    if (EFFECT_KEYS.indexOf(k) === -1) err('eventsLintEffect: ключ ' + k + ' в эффекте ' + ctx + ' неизвестен');
    const v = eff[k];
    if (v === null || v === undefined) return;
    if (k === 'income' || k === 'incomeEnd') return;
    if (typeof v === 'number') {
      if (Number.isInteger(v)) return;
      if (k === 'deploy' || k === 'casualties' || k === 'casualtyReduction') return;
      err('eventsLintEffect: дробное число ' + v + ' в ключе ' + k + ' у ' + ctx + ' (допустимо только в deploy/casualties/casualtyReduction)');
    }
  });
};
const checkEffectsAnywhere = (eff, ctx) => {
  if (!eff || typeof eff !== 'object') return;
  Object.keys(eff).forEach(k => {
    const v = eff[k];
    if (k === 'income') {
      // income: {key: string, amount: int, until?: int} — проверяем только типы значений
      if (!v || typeof v !== 'object') { err('eventsLintEffect: income у ' + ctx + ' должен быть объектом'); return; }
      if (typeof v.amount !== 'number' || !Number.isInteger(v.amount)) err('eventsLintEffect: income.amount у ' + ctx + ' должен быть целым числом');
      if (v.until !== undefined && v.until !== null && (typeof v.until !== 'number' || !Number.isInteger(v.until))) err('eventsLintEffect: income.until у ' + ctx + ' должен быть целым числом');
      return;
    }
    if (k === 'deploy' || k === 'casualties' || k === 'casualtyReduction') { checkEffectKeys(v, ctx + '#' + k); return; }
    if (k === 'deploy' || k === 'casualtyReduction') return;
    checkEffectKeys(v, ctx + '#' + k);
  });
};
filtered.forEach(e => {
  if (Array.isArray(e.choices)) {
    e.choices.forEach(c => {
      checkEffectsAnywhere(c.effect, e.id + '#' + c.key);
      checkEffectsAnywhere(c.majorityBonus && c.majorityBonus.nationalEffect, e.id + '#' + c.key + '#majorityBonus');
      checkEffectsAnywhere(c.arrivalBonus && c.arrivalBonus.effect, e.id + '#' + c.key + '#arrivalBonus');
      (c.conditionalEffects || []).forEach((ce, i) => {
        checkEffectsAnywhere(ce.effect, e.id + '#' + c.key + '#condEff' + i);
        checkEffectsAnywhere(ce.nationalEffect, e.id + '#' + c.key + '#condEff' + i + '#national');
        const cim = ce.military;
        if (cim) {
          if (typeof cim.deploy !== 'number' || cim.deploy < 0 || cim.deploy > 1) err('eventsLintMilitary: deploy у ' + e.id + '#' + c.key + '#condEff' + i + ' должен быть числом в [0,1]');
          if (cim.casualties !== undefined && (typeof cim.casualties !== 'number' || cim.casualties < 0 || cim.casualties > 1)) err('eventsLintMilitary: casualties у ' + e.id + '#' + c.key + '#condEff' + i + ' должен быть числом в [0,1]');
          if (Array.isArray(cim.scale)) cim.scale.forEach(s => { if (['fielded', 'missing', 'due', 'extra'].indexOf(s.by) === -1) err('eventsLintMilitary: неизвестный by=' + s.by); if (typeof s.every !== 'number' || !Number.isInteger(s.every) || s.every < 1) err('eventsLintMilitary: bad scale.every'); if (s.effect) checkEffectsAnywhere(s.effect, e.id + '#' + c.key + '#condEff' + i + '#milScale'); });
        }
      });
      if (e.type === 'narrative') (e.conditionalEffects || []).forEach((ce, i) => checkEffectsAnywhere(ce.effect, e.id + '#condEff' + i));
    });
  }
  checkEffectsAnywhere(e.effect, e.id);
  checkEffectsAnywhere(e.nationalEffect, e.id + '#nationalEffect');
});

// ---- 7. Итоговый вывод ----
if (errors.length){
  console.log('LINT-ERRORS ' + errors.length);
  errors.forEach(e => console.log('ERROR ' + e));
  process.exit(1);
} else {
  console.log('LINT-OK events.json');
}
