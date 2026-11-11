#!/usr/bin/env node
/*
 * Симулятор баланса «Бунташного века».
 * Отдельный скрипт для Node: к сайту не подключается, Firebase и сеть не использует.
 *
 * Запуск:   node tools/simulate.js [--seed N] [--events путь] [--out путь.csv]
 *
 * Правила (тик экономики, resolveEffect, ступени дружины, пороги знатности, стартовые ресурсы)
 * берутся из ../state.js — формулы здесь НЕ дублируются. state.js не зависит от браузера при загрузке,
 * поэтому подключается напрямую через vm; если в будущем это изменится, чистые функции расчёта
 * нужно вынести в общий файл (например rules.js), который подключают и сайт, и этот скрипт.
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

// ---------- аргументы ----------
const args = process.argv.slice(2);
const argOf = (name, dflt) => { const i = args.indexOf(name); return i >= 0 && args[i + 1] !== undefined ? args[i + 1] : dflt; };
const SEED = parseInt(argOf('--seed', '1'), 10);
const EVENTS_PATH = path.resolve(argOf('--events', path.join(__dirname, '..', 'events.json')));
const OUT_PATH = path.resolve(argOf('--out', path.join(__dirname, 'simulate-output.csv')));
const STATE_JS = path.join(__dirname, '..', 'state.js');

// ---------- правила из state.js ----------
function loadRules(file){
  const code = fs.readFileSync(file, 'utf8') +
    '\n;globalThis.__rules = {applyEffect, resolveEffect, computeEconomyTick, applyEconomyTick, pendingMilestones, SLAVA_MILESTONES,' +
    ' defaultResources, druzhinaOf, findConditionalEffect, getArrivalBonuses, arrivalBonusKey, initialState,' +
    ' majorityOf, bribeCost, computeMilitary, activeIncomeMods, finalRanking, worldVerdict, roundHalfUp, fmtDelta, resourceEffect};';
  const sandbox = {};
  vm.createContext(sandbox);
  vm.runInContext(code, sandbox, {filename: file});
  return sandbox.__rules;
}
const R = loadRules(STATE_JS);

// ---------- детерминированный генератор случайных чисел ----------
function mulberry32(a){
  return function(){
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------- события ----------
const allEvents = JSON.parse(fs.readFileSync(EVENTS_PATH, 'utf8')).filter(e => !e.hidden); // как на сайте
const clone = v => JSON.parse(JSON.stringify(v));

// ---------- стратегии ----------
// Оценка варианта: во что превратятся ресурсы рода после выбора (проценты крестьян считает applyEffect).
const STRATEGIES = {
  'макс. золото':        {score: r => r.zoloto},
  'макс. знатность':     {score: r => r.slava},
  'мин. потери крестьян': {score: r => r.krestyane},
  'случайный':           {score: null}
};
const ESTATES = ['boyare', 'dvoryane'];
const ESTATE_NAME = {boyare: 'бояре', dvoryane: 'дворяне'};

// ---------- один прогон: стратегия × сословие ----------
function runOne(strategyName, estate, seedForRun){
  const strategy = STRATEGIES[strategyName];
  const rnd = mulberry32(seedForRun);
  const rod = {estate, resources: R.defaultResources(estate), flags: {}, seenMilestones: {}, seenArrivalBonus: {}};
  const national = clone(R.initialState().national);
  const rows = [];
  const notes = {negativeGold: [], floorPeasants: [], stabilityTurns: {low: 0, mid: 0, high: 0}, milestones: [], skipped: []};
  let turn = 0;

  // Вариант выбора → {resources, national, flags} после применения; считается теми же функциями, что и на сайте.
  function evaluate(ev, choice){
    const res0 = rod.resources;
    const flags = Object.assign({}, rod.flags);
    let resources;
    let natEffect = null;
    if(ev.type === 'global'){
      // Большинство совпадает с выбором самой стратегии: исход берётся по этому выбору.
      const out = ev.outcomes[choice.key];
      resources = R.applyEffect(res0, (out.effectByChoice && out.effectByChoice[choice.key]) || {});
      natEffect = out.nationalEffect || null;
    } else {
      (choice.setFlags || []).forEach(f => { flags[f] = true; });
      const druzhina = R.druzhinaOf(res0);
      let eff = R.resolveEffect(choice, rod, druzhina);
      const cond = R.findConditionalEffect(choice, {flags});
      if(cond && cond.effect) for(const k in cond.effect) eff[k] = (eff[k] || 0) + (cond.effect[k] || 0);
      // Военный расчёт по выбранным ресурсам (R9): шкала «+1 за каждого выставленного» + потери
      if(choice.military){
        const m = R.computeMilitary(res0.krestyane, choice.military, rod.casualtyReduction ? [rod.casualtyReduction] : []);
        for(const k in m.scaleEffect) eff[k] = (eff[k] || 0) + m.scaleEffect[k];
        if(m.lost) eff.krestyane = (eff.krestyane || 0) - m.lost;
      }
      resources = R.applyEffect(res0, eff);
      natEffect = choice.majorityBonus && choice.majorityBonus.nationalEffect || null;
    }
    return {resources, flags, natEffect};
  }

  allEvents.forEach(ev => {
    if(ev.type === 'assembly') return;                       // не игровой ход: ни выбора, ни тика
    if(ev.type === 'auction'){ notes.skipped.push(ev.id + ' (торги не моделируются)'); return; }
    turn++;

    // Бонусы по прибытии: срабатывают по флагам, игрок подтверждает их сразу
    R.getArrivalBonuses(ev).forEach((bonus, i) => {
      const key = R.arrivalBonusKey(ev, i);
      if(bonus && bonus.requiresFlag && rod.flags[bonus.requiresFlag] && !rod.seenArrivalBonus[key]){
        rod.resources = R.applyEffect(rod.resources, bonus.effect || {});
        rod.seenArrivalBonus[key] = true;
      }
    });

    if(ev.type === 'narrative'){
      const eff = R.resolveEffect(ev, rod);
      const branch = R.findConditionalEffect(ev, rod);
      if(branch && branch.military){
        const m = R.computeMilitary(rod.resources.krestyane, branch.military, rod.casualtyReduction ? [rod.casualtyReduction] : []);
        for(const k in m.scaleEffect) eff[k] = (eff[k] || 0) + m.scaleEffect[k];
        if(m.lost) eff.krestyane = (eff.krestyane || 0) - m.lost;
      }
      rod.resources = R.applyEffect(rod.resources, eff);
    } else {
      const options = ev.choices.filter(c => !c.requiresEstate || c.requiresEstate === estate);
      let pick;
      if(strategy.score){
        let best = -Infinity;
        options.forEach(c => { const s = strategy.score(evaluate(ev, c).resources); if(s > best){ best = s; pick = c; } });
      } else {
        pick = options[Math.floor(rnd() * options.length)];   // случайный выбор с фиксированным зерном
      }
      const ev2 = evaluate(ev, pick);
      rod.resources = ev2.resources;
      rod.flags = ev2.flags;
      if(ev2.natEffect) for(const k in ev2.natEffect) national[k] = (national[k] || 0) + ev2.natEffect[k];
    }

    // Тик экономики по текущим национальным показателям
    const tier = national.stability < 3 ? 'low' : (national.stability < 8 ? 'mid' : 'high');
    notes.stabilityTurns[tier]++;
    const t = R.computeEconomyTick(rod.resources, estate, national);
    rod.resources = Object.assign({}, rod.resources, {zoloto: rod.resources.zoloto + t.zolotoDelta, krestyane: t.krestyaneAfter});

    // Награды за пороги знатности
    R.pendingMilestones(rod).forEach(m => {
      rod.seenMilestones[m.threshold] = true;
      rod.resources = Object.assign({}, rod.resources, {krestyane: rod.resources.krestyane + m.krestyane});
      notes.milestones.push({threshold: m.threshold, turn});
    });

    if(rod.resources.zoloto < 0) notes.negativeGold.push(turn);
    if(rod.resources.krestyane <= 20) notes.floorPeasants.push(turn);
    rows.push({
      strategy: strategyName, estate: ESTATE_NAME[estate], turn, event: ev.id,
      slava: rod.resources.slava, krestyane: rod.resources.krestyane, druzhina: R.druzhinaOf(rod.resources),
      zoloto: rod.resources.zoloto, stability: national.stability, centralization: national.centralization
    });
  });
  return {rows, notes};
}

// ---------- вывод ----------
const COLS = ['turn', 'event', 'slava', 'krestyane', 'druzhina', 'zoloto', 'stability', 'centralization'];
const HEAD = {turn: 'ход', event: 'событие', slava: 'знатность', krestyane: 'крестьяне', druzhina: 'дружина', zoloto: 'золото', stability: 'стабильн.', centralization: 'централиз.'};
function printTable(rows){
  const widths = COLS.map(c => Math.max(HEAD[c].length, ...rows.map(r => String(r[c]).length)));
  const line = cells => cells.map((v, i) => String(v).padEnd(widths[i])).join('  ');
  console.log('  ' + line(COLS.map(c => HEAD[c])));
  rows.forEach(r => console.log('  ' + line(COLS.map(c => r[c]))));
}
const list = a => a.length ? a.join(', ') : 'нет';

const allRows = [];
console.log(`Симуляция баланса. Событий в игре (без скрытых): ${allEvents.length}; зерно: ${SEED}; файл событий: ${path.relative(process.cwd(), EVENTS_PATH) || EVENTS_PATH}`);
let runIndex = 0;
Object.keys(STRATEGIES).forEach(strategyName => {
  ESTATES.forEach(estate => {
    const {rows, notes} = runOne(strategyName, estate, SEED * 1000 + runIndex++);
    allRows.push(...rows);
    console.log(`\n=== Стратегия «${strategyName}», ${ESTATE_NAME[estate]} ===`);
    if(rows.length) printTable(rows);
    else console.log('  (нет игровых ходов)');
    const last = rows[rows.length - 1];
    console.log('  Сводка:');
    console.log(`   - золото в минусе на ходах: ${list(notes.negativeGold)}`);
    console.log(`   - крестьяне упёрлись в пол 20 на ходах: ${list(notes.floorPeasants)}`);
    console.log(`   - ходов на ступенях стабильности: ниже 3 — ${notes.stabilityTurns.low}, 3–7 — ${notes.stabilityTurns.mid}, 8 и выше — ${notes.stabilityTurns.high}`);
    console.log(`   - пороги знатности: ${notes.milestones.length ? notes.milestones.map(m => `${m.threshold} (ход ${m.turn})`).join(', ') : 'не достигнуты'}`);
    if(last) console.log(`   - итог: знатность ${last.slava}, крестьяне ${last.krestyane}, дружина ${last.druzhina}, золото ${last.zoloto}`);
    if(notes.skipped.length) console.log(`   - пропущено: ${notes.skipped.join('; ')}`);
  });
});

// ---------- CSV ----------
const csvCols = ['strategy', 'estate', 'turn', 'event', 'slava', 'krestyane', 'druzhina', 'zoloto', 'stability', 'centralization'];
const csvCell = v => /[",\n;]/.test(String(v)) ? '"' + String(v).replace(/"/g, '""') + '"' : String(v);
const csv = [csvCols.join(',')].concat(allRows.map(r => csvCols.map(c => csvCell(r[c])).join(','))).join('\n') + '\n';
fs.writeFileSync(OUT_PATH, csv, 'utf8');
console.log(`\nТаблица по ходам записана в ${path.relative(process.cwd(), OUT_PATH) || OUT_PATH} (${allRows.length} строк).`);
