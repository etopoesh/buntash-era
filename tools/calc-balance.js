#!/usr/bin/env node
/*
 * Расчёт максимумов и разбор источников денег/знатности в «Долгом веке».
 * Правила берутся из state.js через vm; контент — из events.json / buildings.json.
 * Моделируется порядок сайта: окно построек -> выбор -> (нац. эффекты) -> тик -> пороги знатности.
 * Каждое действие пишет дельты в s.parts; доход тика делится по источникам модов.
 *
 * Запуск из корня проекта:
 *   node tools/calc-balance.js --estate boyare --objective gold --beam 2000
 *   node tools/calc-balance.js --estate dvoryane --objective slava --no-buildings --out slava.json
 *   node tools/calc-balance.js --estate boyare --objective krestyane --beam 4000 --trace
 *   node tools/calc-balance.js --estate boyare --objective choice --no-buildings
 *
 * Параметры: --estate boyare|dvoryane, --objective gold|slava|krestyane|build|choice,
 *   --beam N (ширина перебора, по умолчанию 4000), --no-buildings (без окон построек),
 *   --rich (казня 1 000 000 — проверка без денежных ограничений),
 *   --out файл.json (полный результат), --trace (вывести цепочку ходов в консоль).
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..');
const read = p => fs.readFileSync(path.join(ROOT, p), 'utf8');
const EXPORTS = `
;globalThis.R = {applyEffect, resolveEffect, computeEconomyTick, applyEconomyTick, pendingMilestones, SLAVA_MILESTONES,
 defaultResources, druzhinaOf, findConditionalEffect, bribeCost, computeMilitary, activeIncomeMods,
 roundHalfUp, resourceEffect, militaryEquipmentCost, choiceMoneyCost, minChoiceMoneyCost,
 choiceMilitaryOf, effectiveMilitary, matchingConditionals, casualtyReductionsOf, incomeSpecsOf,
 choiceAvailable, fleeReductionOf, buildingsList,
 setStateForCalc(v){ state = v; }};`;
const sandbox = {};
vm.createContext(sandbox);
vm.runInContext(read('state.js') + EXPORTS, sandbox, {filename: 'state.js'});
const R = sandbox.R;

const allEvents = JSON.parse(read('events.json')).filter(e => !e.hidden);
const buildingCatalog = JSON.parse(read('buildings.json'));
R.setStateForCalc({national: {stability: 8, centralization: 6}, buildings: buildingCatalog, rods: {}});

const arg = (name, dflt) => { const i = process.argv.indexOf(name); return i >= 0 ? process.argv[i + 1] : dflt; };
const ESTATE = arg('--estate', 'boyare');
const BEAM = parseInt(arg('--beam', '4000'), 10);
const USE_BUILDINGS = process.argv.indexOf('--no-buildings') < 0;
const OUT = arg('--out', '');
const OBJECTIVE = arg('--objective', 'gold');
const RICH = process.argv.indexOf('--rich') >= 0;
const TRACE = process.argv.indexOf('--trace') >= 0;
const OBJECTIVES = ['gold', 'slava', 'krestyane', 'build', 'choice'];
if (!['boyare', 'dvoryane'].includes(ESTATE) || !OBJECTIVES.includes(OBJECTIVE) || !(BEAM > 0)) {
  console.error('Некорректные параметры. См. шапку файла: --estate boyare|dvoryane, --objective ' + OBJECTIVES.join('|') + ', --beam N');
  process.exit(2);
}

const cloneRes = r => ({slava: r.slava, krestyane: r.krestyane, zoloto: r.zoloto});
const cloneMods = m => { const o = {}; for (const k in m) o[k] = Object.assign({}, m[k]); return o; };
const cloneFlags = f => Object.assign({}, f);
const cloneNat = n => ({stability: n.stability, centralization: n.centralization});
const newParts = () => ({choiceGold: 0, choiceSlava: 0, choiceKrestyane: 0, choiceIncome: 0,
  narrativeGold: 0, narrativeSlava: 0, narrativeKrestyane: 0, narrativeIncome: 0,
  buildSpent: 0, buildSlava: 0, buildKrestyane: 0, buildIncome: 0,
  peasantIncome: 0, incomeResidual: 0, milestoneKrestyane: 0});
const cloneParts = p => Object.assign({}, p);
function score(s){
  switch (OBJECTIVE){
    case 'slava': return s.resources.slava;
    case 'krestyane': return s.resources.krestyane;
    case 'build': return s.parts.buildIncome + s.parts.buildSlava;
    case 'choice': return s.parts.choiceGold + s.parts.choiceSlava;
    default: return s.resources.zoloto;
  }
}

function keyOf(s) {
  const flags = Object.keys(s.flags).sort();
  const mods = Object.keys(s.incomeMods).sort().map(k => [k, s.incomeMods[k].amount, s.incomeMods[k].until === undefined ? null : s.incomeMods[k].until]);
  const ms = Object.keys(s.seenMilestones).sort();
  const bl = Object.keys(s.buildings).sort().map(k => [k, s.buildings[k]]);
  return JSON.stringify([s.resources.slava, s.resources.krestyane, s.resources.zoloto,
    s.national.stability, s.national.centralization, s.casualtyReduction,
    flags, mods, ms, bl]);
}

function heuristic(s, remainingTurns) {
  if (OBJECTIVE === 'slava') {
    // Эвристика из проверенного расчёта максимума знатности: знатность доминирует,
    // золото и души только развязывают ничьи в луче.
    let v = s.resources.slava * 60 + s.resources.zoloto + (s.resources.krestyane / 10) * remainingTurns * 0.5;
    for (const k in s.incomeMods) v += s.incomeMods[k].amount;
    for (const m of R.SLAVA_MILESTONES) {
      if (!s.seenMilestones[m.threshold] && s.resources.slava < m.threshold) {
        v += (m.krestyane / 10) * remainingTurns * 0.5;
      }
    }
    return v;
  }
  if (OBJECTIVE === 'krestyane') return s.resources.krestyane + s.resources.zoloto / 20;
  if (OBJECTIVE === 'build') return s.parts.buildIncome + s.parts.buildSlava + s.resources.zoloto / 100;
  if (OBJECTIVE === 'choice') return s.parts.choiceGold + s.parts.choiceSlava + s.resources.zoloto / 100;
  let v = s.resources.zoloto + (s.resources.krestyane / 10) * remainingTurns;
  for (const k in s.incomeMods) {
    const m = s.incomeMods[k];
    const until = m.until === undefined ? Infinity : m.until;
    v += m.amount * Math.max(0, Math.min(remainingTurns, until - s.turn + 1));
  }
  for (const m of R.SLAVA_MILESTONES) {
    if (!s.seenMilestones[m.threshold] && s.resources.slava < m.threshold) {
      v += (m.krestyane / 10) * remainingTurns * 0.5;
    }
  }
  return v;
}

// Доход тика = ceil(души*0.1 + сумма активных модов). Делим прибавку сверх базы
// по источникам модов: постройки -> выборы -> события-повествования -> прочее.
function splitTickIncome(s, mods, origins, krestyaneBefore, turn, totalIncome){
  let build = 0, choice = 0, narrative = 0, other = 0;
  for (const k in mods){
    const m = mods[k];
    if (!m || typeof m.amount !== 'number') continue;
    if (m.until !== undefined && m.until !== null && turn > m.until) continue;
    switch (origins[k]){
      case 'build': build += m.amount; break;
      case 'choice': choice += m.amount; break;
      case 'narrative': narrative += m.amount; break;
      default: other += m.amount;
    }
  }
  const k = krestyaneBefore * 0.1;
  const base = Math.ceil(k);
  const wBuild = Math.ceil(k + build);
  const wChoice = Math.ceil(k + build + choice);
  const wNarr = Math.ceil(k + build + choice + narrative + other);
  s.parts.peasantIncome += base;
  s.parts.buildIncome += wBuild - base;
  s.parts.choiceIncome += wChoice - wBuild;
  s.parts.narrativeIncome += wNarr - wChoice;
  s.parts.incomeResidual += totalIncome - wNarr;
}

function tickAndMilestones(s, ev, viaNarrative, origins) {
  const modsForTick = cloneMods(s.incomeMods);
  if (!viaNarrative) {
    if (ev.nationalSet) for (const k in ev.nationalSet) s.national[k] = ev.nationalSet[k];
    const krestyaneBefore = s.resources.krestyane;
    const goldBefore = s.resources.zoloto;
    const shim = {resources: cloneRes(s.resources), estate: ESTATE, incomeMods: modsForTick,
      buildings: USE_BUILDINGS ? cloneFlags(s.buildings) : {}};
    R.applyEconomyTick(shim, ev.turn);
    s.resources = cloneRes(shim.resources);
    splitTickIncome(s, modsForTick, origins, krestyaneBefore, ev.turn, s.resources.zoloto - goldBefore);
  }
  for (const m of R.pendingMilestones(s, s.resources.slava)) {
    s.seenMilestones[m.threshold] = true;
    s.resources.krestyane += m.krestyane;
    s.parts.milestoneKrestyane += m.krestyane;
  }
  return s;
}

function applyNarrative(s, ev) {
  const rod = {flags: s.flags, estate: ESTATE, resources: s.resources, casualtyReduction: s.casualtyReduction};
  if (ev.nationalEffect) for (const k in ev.nationalEffect) s.national[k] = (s.national[k] || 0) + ev.nationalEffect[k];
  if (ev.nationalSet) for (const k in ev.nationalSet) s.national[k] = ev.nationalSet[k];

  const modsAfter = cloneMods(s.incomeMods);
  const origins = cloneFlags(s.modOrigins);
  if (ev.incomeEnd) {
    const ends = Array.isArray(ev.incomeEnd) ? ev.incomeEnd : [ev.incomeEnd];
    ends.forEach(k => { delete modsAfter[k]; delete origins[k]; });
  }
  const eff = R.resolveEffect(ev, rod);
  const branch = R.findConditionalEffect(ev, rod);
  if (branch && branch.military) {
    const m = R.computeMilitary(s.resources.krestyane, branch.military,
      R.casualtyReductionsOf(ev, rod, s.resources));
    for (const k in m.scaleEffect) eff[k] = (eff[k] || 0) + m.scaleEffect[k];
    if (m.lost) eff.krestyane = (eff.krestyane || 0) - m.lost;
    const equip = R.militaryEquipmentCost(m.fielded);
    if (equip) eff.zoloto = (eff.zoloto || 0) - equip;
  }
  const before = cloneRes(s.resources);
  s.resources = R.applyEffect(s.resources, eff);
  s.parts.narrativeGold += s.resources.zoloto - before.zoloto;
  s.parts.narrativeSlava += s.resources.slava - before.slava;
  s.parts.narrativeKrestyane += s.resources.krestyane - before.krestyane;

  const krestyaneBefore = s.resources.krestyane;
  const goldBefore = s.resources.zoloto;
  const shim = {resources: cloneRes(s.resources), estate: ESTATE, incomeMods: modsAfter, buildings: {}};
  R.applyEconomyTick(shim, ev.turn);
  s.resources = cloneRes(shim.resources);
  splitTickIncome(s, modsAfter, origins, krestyaneBefore, ev.turn, s.resources.zoloto - goldBefore);
  s.incomeMods = modsAfter;
  s.modOrigins = origins;
  for (const inc of R.incomeSpecsOf(ev, rod)) {
    s.incomeMods[inc.key] = {amount: inc.amount, ...(inc.until !== undefined ? {until: inc.until} : {})};
    s.modOrigins[inc.key] = 'narrative';
  }
  for (const m of R.pendingMilestones(s, s.resources.slava)) {
    s.seenMilestones[m.threshold] = true;
    s.resources.krestyane += m.krestyane;
    s.parts.milestoneKrestyane += m.krestyane;
  }
  return s;
}

function applyChoice(s, ev, choice) {
  const res0 = s.resources;
  const flagsAfter = cloneFlags(s.flags);
  (choice.setFlags || []).forEach(f => { flagsAfter[f] = true; });
  const rodForConds = {flags: flagsAfter, estate: ESTATE, resources: res0};
  const druzhina = R.druzhinaOf(res0);
  const incSpecs = R.incomeSpecsOf(choice, rodForConds, druzhina);
  const reductions = R.casualtyReductionsOf(choice, rodForConds, res0);
  const milSpec = R.effectiveMilitary(choice, rodForConds, res0);
  const mil = milSpec ? R.computeMilitary(res0.krestyane, milSpec, reductions) : null;
  let combined = R.resolveEffect(choice, rodForConds, druzhina);
  if (mil) {
    for (const k in mil.scaleEffect) combined[k] = (combined[k] || 0) + mil.scaleEffect[k];
    if (mil.lost) combined.krestyane = (combined.krestyane || 0) - mil.lost;
  }
  const eff = choice.effect || {};
  if (eff.bribe !== undefined) combined.zoloto = (combined.zoloto || 0) - R.bribeCost(eff.bribe, res0.slava);
  if (mil && ev.turn >= 2) combined.zoloto = (combined.zoloto || 0) - R.militaryEquipmentCost(mil.fielded);

  const before = cloneRes(res0);
  s.resources = R.applyEffect(res0, combined);
  s.flags = flagsAfter;
  s.parts.choiceGold += s.resources.zoloto - before.zoloto;
  s.parts.choiceSlava += s.resources.slava - before.slava;
  s.parts.choiceKrestyane += s.resources.krestyane - before.krestyane;
  for (const inc of incSpecs) {
    s.incomeMods[inc.key] = {amount: inc.amount, ...(inc.until !== undefined ? {until: inc.until} : {})};
    s.modOrigins[inc.key] = 'choice';
  }
  if (eff.incomeEnd) {
    const ends = Array.isArray(eff.incomeEnd) ? eff.incomeEnd : [eff.incomeEnd];
    ends.forEach(k => { delete s.incomeMods[k]; delete s.modOrigins[k]; });
  }
  if (eff.casualtyReduction) s.casualtyReduction += eff.casualtyReduction;
  const mb = choice.majorityBonus && choice.majorityBonus.nationalEffect;
  if (mb) for (const k in mb) s.national[k] = (s.national[k] || 0) + mb[k];
  return s;
}

function affordableChoices(ev, s) {
  const rod = {flags: s.flags, estate: ESTATE, resources: s.resources, casualtyReduction: s.casualtyReduction};
  const list = ev.choices.filter(c => R.choiceAvailable(c, rod));
  const minCost = R.minChoiceMoneyCost(ev.choices, rod, s.resources, ev.turn);
  const ok = list.filter(c => {
    const need = R.choiceMoneyCost(c, rod, s.resources, ev.turn);
    return s.resources.zoloto < 0 ? need === minCost : (need === 0 || need <= s.resources.zoloto);
  });
  return ok.length ? ok : list;
}

function buildOptions(s, ev) {
  if (!USE_BUILDINGS || !ev.buildWindow) return [null];
  const out = [null];
  for (const b of buildingCatalog.buildings || []) {
    const count = s.buildings[b.id] || 0;
    if (b.maxCount !== null && b.maxCount !== undefined && count >= b.maxCount) continue;
    if (s.resources.zoloto < (b.price || 0)) continue;
    out.push(b);
  }
  return out;
}

function applyBuild(s, ev, b) {
  if (!b) { s.buildWindows[ev.id] = 'skipped'; return s; }
  const before = cloneRes(s.resources);
  s.resources.zoloto -= (b.price || 0);
  const on = R.resourceEffect(b.onBuild);
  s.resources = R.applyEffect(s.resources, on);
  s.parts.buildSpent += (b.price || 0);
  s.parts.buildSlava += s.resources.slava - before.slava;
  s.parts.buildKrestyane += s.resources.krestyane - before.krestyane;
  s.buildings[b.id] = (s.buildings[b.id] || 0) + 1;
  if (b.perTurn && typeof b.perTurn.income === 'number') {
    s.incomeMods['building:' + b.id] = {amount: b.perTurn.income};
    s.modOrigins['building:' + b.id] = 'build';
  }
  s.buildWindows[ev.id] = 'bought';
  return s;
}

function makeNode(parent, action) {
  return {
    parent, action,
    resources: parent.resources, flags: parent.flags, incomeMods: parent.incomeMods,
    modOrigins: parent.modOrigins, parts: parent.parts,
    casualtyReduction: parent.casualtyReduction, seenMilestones: parent.seenMilestones,
    national: parent.national, buildings: parent.buildings, buildWindows: parent.buildWindows,
    turn: parent.turn, evId: ''
  };
}
function cloneNodeForAction(parent, action) {
  const n = makeNode(parent, action);
  n.resources = cloneRes(parent.resources);
  n.flags = cloneFlags(parent.flags);
  n.incomeMods = cloneMods(parent.incomeMods);
  n.modOrigins = cloneFlags(parent.modOrigins);
  n.parts = cloneParts(parent.parts);
  n.seenMilestones = cloneFlags(parent.seenMilestones);
  n.national = cloneNat(parent.national);
  n.buildings = cloneFlags(parent.buildings);
  n.buildWindows = cloneFlags(parent.buildWindows);
  return n;
}
function initialState() {
  const resources = R.defaultResources(ESTATE);
  if (RICH) resources.zoloto = 1000000;
  return {
    resources, flags: {}, incomeMods: {}, modOrigins: {},
    parts: newParts(), casualtyReduction: 0, seenMilestones: {},
    national: {stability: 8, centralization: 6}, buildings: {}, buildWindows: {},
    parent: null, action: null, turn: 0
  };
}

// ---------- жадный проход для сравнения ----------
function greedy() {
  let s = initialState();
  const trace = [];
  for (const ev of allEvents) {
    if (ev.type === 'assembly') continue;
    s.turn++;
    const before = s.resources.zoloto;
    let pick = null;
    if (ev.type !== 'narrative') {
      let best = -Infinity;
      for (const c of affordableChoices(ev, s)) {
        const t = cloneNodeForAction(s, {choice: c.key});
        applyChoice(t, ev, c);
        if (score(t) > best) { best = score(t); pick = c; }
      }
    }
    if (ev.type === 'narrative') applyNarrative(s, ev);
    else {
      if (pick) s = applyChoice(cloneNodeForAction(s, {choice: pick.key, event: ev.id, turn: ev.turn}), ev, pick);
      tickAndMilestones(s, ev, false, s.modOrigins);
    }
    trace.push({turn: ev.turn, event: ev.id, choice: pick ? pick.key : '', zoloto: s.resources.zoloto, delta: s.resources.zoloto - before});
  }
  return {score: score(s), state: s, trace};
}

// ---------- beam search ----------
function search() {
  let beam = [initialState()];
  const gameEvents = allEvents.filter(e => e.type !== 'assembly');
  for (let i = 0; i < gameEvents.length; i++) {
    const ev = gameEvents[i];
    const next = [];
    const seen = new Set();
    for (const cur of beam) {
      for (const b of buildOptions(cur, ev)) {
        const s0 = cloneNodeForAction(cur, {build: b ? b.id : null});
        applyBuild(s0, ev, b);
        s0.evId = ev.id;
        s0.action = {event: ev.id, turn: ev.turn, build: b ? b.id : null};
        if (ev.type === 'narrative') {
          applyNarrative(s0, ev);
          s0.action.choice = '';
          s0.turn = i + 1;
          const k = keyOf(s0);
          if (!seen.has(k)) { seen.add(k); next.push(s0); }
        } else {
          for (const c of affordableChoices(ev, s0)) {
            const s = cloneNodeForAction(s0, {choice: c.key});
            s.action = Object.assign({}, s0.action, {choice: c.key});
            applyChoice(s, ev, c);
            tickAndMilestones(s, ev, false, s.modOrigins);
            s.turn = i + 1;
            const k = keyOf(s);
            if (!seen.has(k)) { seen.add(k); next.push(s); }
          }
        }
      }
    }
    next.sort((a, b) => heuristic(b, gameEvents.length - i - 1) - heuristic(a, gameEvents.length - i - 1));
    beam = next.slice(0, BEAM);
    if (!beam.length) throw new Error('beam пуст на ходе ' + ev.id);
    if ((i + 1) % 10 === 0 || i === gameEvents.length - 1) {
      console.error(i + 1 + '/' + gameEvents.length + ' states=' + next.length + ' bestZ=' + Math.max(...beam.map(s => s.resources.zoloto)));
    }
  }
  beam.sort((a, b) => score(b) - score(a)
    || (OBJECTIVE === 'slava' ? b.resources.zoloto - a.resources.zoloto : 0));
  const best = beam[0];
  const trace = [];
  for (let n = best; n && n.action; n = n.parent) {
    trace.push({turn: n.action.turn, event: n.action.event, choice: n.action.choice,
      build: n.action.build, zoloto: n.resources.zoloto, slava: n.resources.slava,
      krestyane: n.resources.krestyane,
      stability: n.national.stability, centralization: n.national.centralization});
  }
  trace.reverse();
  return {score: score(best), state: best, trace};
}

const start = Date.now();
const greedyRes = greedy();
const res = search();
console.error('time ms=' + (Date.now() - start));
const startRes = R.defaultResources(ESTATE);
if (RICH) startRes.zoloto = 1000000;
const p = res.state.parts;
const check = startRes.zoloto + p.choiceGold + p.narrativeGold - p.buildSpent
  + p.peasantIncome + p.choiceIncome + p.narrativeIncome + p.buildIncome + p.incomeResidual;
const result = {estate: ESTATE, objective: OBJECTIVE, beam: BEAM, buildings: USE_BUILDINGS,
  greedy: {score: greedyRes.score, parts: greedyRes.state.parts}, best: res,
  start: startRes, goldCheck: check};
if (OUT) fs.writeFileSync(OUT, JSON.stringify(result, null, 2), 'utf8');
console.log(JSON.stringify({estate: ESTATE, objective: OBJECTIVE, buildings: USE_BUILDINGS,
  rich: RICH, beam: BEAM, greedy: greedyRes.score, best: res.score,
  final: res.state.resources, start: startRes, goldCheck: check,
  parts: p, flags: Object.keys(res.state.flags).sort(),
  buildingsBought: Object.keys(res.state.buildings).sort(),
  trace: TRACE ? res.trace : undefined}, null, 2));
