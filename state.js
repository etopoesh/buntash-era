function initialState(){
  return {
    currentIndex: 0,
    events: [],
    rods: {},
    globalResults: {},
    auctions: {},
    national: {stability: 10, centralization: 10},
    releasedAssemblies: {},
    majorityBonusResolved: {}
  };
}

function defaultResources(estate){
  // Стартовые ресурсы едины для всех сословий; rod.estate сохраняется и используется
  // отдельно (например, requiresEstate у части выборов), но на старте больше не влияет.
  return {slava: 10, krestyane: 200, zoloto: 300};
}

let state = null;
let role = null;
let currentRod = null;
let busy = false;
let storageError = null;
let sortBy = 'slava'; // 'slava' | 'krestyane' | 'zoloto' — выбор ведущего для сортировки таблицы родов
let selectedEstate = null;
let showHistory = false; // переключатель "История" на экране рода

// Крестьяне считаются в процентах от текущего числа (не могут уйти в минус),
// деньги и слава — обычными числами (могут уйти в минус).
function fmtDelta(effect){
  const labels = {slava:'Царская милость', zoloto:'Золото'};
  const parts = [];
  for(const k in effect){
    if(!effect[k]) continue;
    const v = effect[k];
    if(k === 'krestyane'){
      parts.push(`<span class="effect-line ${v>0?'pos':'neg'}">${v>0?'+':''}${v}% Крестьяне</span>`);
    } else {
      parts.push(`<span class="effect-line ${v>0?'pos':'neg'}">${v>0?'+':''}${v} ${labels[k]}</span>`);
    }
  }
  return parts.join(' &nbsp; ');
}

// Аналог fmtDelta для эффектов на национальные показатели (state.national) —
// Стабильность/Централизация — всегда абсолютные числа, без процентного случая krestyane.
function fmtNationalDelta(effect){
  const labels = {stability:'Стабильность', centralization:'Централизация'};
  const parts = [];
  for(const k in effect){
    if(!effect[k]) continue;
    const v = effect[k];
    parts.push(`<span class="effect-line ${v>0?'pos':'neg'}">${v>0?'+':''}${v} ${labels[k]||k}</span>`);
  }
  return parts.join(' &nbsp; ');
}

// Итоговый эффект источника (narrative-события или выбора) для конкретного рода:
// общий effect плюс effectByEstate[rod.estate], если есть. Значения по одинаковым ключам суммируются.
function resolveEffect(source, rod, druzhina){
  const out = {};
  const add = eff => { if(!eff) return; for(const k in eff){ out[k] = (out[k] || 0) + eff[k]; } };
  add(source && source.effect);
  add(source && source.effectByEstate && rod && source.effectByEstate[rod.estate]);
  // Ступень дружины: берётся дружина на момент выбора (druzhina), а если не передана — текущая по крестьянам рода
  if(source && source.druzhinaTiers && rod){
    const tier = findDruzhinaTier(source, druzhina === undefined ? druzhinaOf(rod.resources) : druzhina);
    if(tier) add(tier.effect);
  }
  return out;
}

// Дружина рода: одна единица на каждые 20 крестьян, с округлением вниз.
function druzhinaOf(resources){
  return Math.floor((resources.krestyane || 0) / 20);
}

// Ступень выбора с наибольшим minDruzhina, не превышающим дружину рода (или null).
function findDruzhinaTier(choice, druzhina){
  if(!choice || !choice.druzhinaTiers) return null;
  let best = null;
  choice.druzhinaTiers.forEach(t => { if(t.minDruzhina <= druzhina && (!best || t.minDruzhina > best.minDruzhina)) best = t; });
  return best;
}

// arrivalBonus у события может быть объектом или массивом объектов — всегда отдаём массив.
function getArrivalBonuses(ev){
  if(!ev || !ev.arrivalBonus) return [];
  return Array.isArray(ev.arrivalBonus) ? ev.arrivalBonus : [ev.arrivalBonus];
}
// Ключ «показано» для i-го бонуса: у нулевого — id события (совместимо со старыми сохранениями), дальше id:i.
// Символ # в ключах Firebase запрещён, поэтому разделитель — двоеточие.
function arrivalBonusKey(ev, i){
  return i === 0 ? ev.id : ev.id + ':' + i;
}

function applyEffect(res, effect){
  const out = {...res};
  for(const k in effect){
    if(k === 'krestyane'){
      out.krestyane = Math.round(out.krestyane * (1 + effect.krestyane/100));
    } else {
      out[k] = (out[k]||0) + effect[k];
    }
  }
  return out;
}

// Скрытый параметр "Благоволение" — виден только ведущему, на ресурсы не влияет
// автоматически. track — произвольная строка (например "tsar" или "godunov"),
// значения по разным track накапливаются отдельно.
function applyFavor(rod, favor){
  if(!favor) return;
  if(!rod.favor) rod.favor = {};
  rod.favor[favor.track] = (rod.favor[favor.track] || 0) + favor.value;
}

function makeRod(name, estate){
  return {
    resources: defaultResources(estate),
    answers: {},
    votes: {},
    seenReveal: {},
    seenRumors: {},
    seenIntro: false,
    order: Object.keys(state.rods).length,
    progress: 0,
    estate: estate || 'dvoryane',
    titles: {},
    favor: {}
  };
}

// Создание рода: пишет только rods/<имя> и только если такого рода ещё нет. Возвращает true, если создан.
async function ensureRod(name, estate){
  return dbClaim('rods/' + name, makeRod(name, estate));
}
// Род можно удалить, только пока он ничего не делал: нет ответов, голосов и продвижения.
function canDeleteRod(rod){
  return Object.keys(rod.answers || {}).length === 0 && Object.keys(rod.votes || {}).length === 0 && (rod.progress || 0) === 0;
}

function errorBanner(){
  if(!storageError) return '';
  return `<div class="ui" style="background:#F0DCC9;color:#6E2018;border:1px solid #8C2A20;border-radius:6px;padding:10px 14px;margin-bottom:14px;font-size:13px;">${storageError}</div>`;
}

// Предохранитель: приводит объект рода к полной форме (используется и в render(), и в boot())
function patchRod(rod){
  if (!rod.resources) rod.resources = defaultResources(rod.estate);
  if (!rod.answers) rod.answers = {};
  if (!rod.votes) rod.votes = {};
  if (!rod.seenReveal) rod.seenReveal = {};
  if (!rod.seenRumors) rod.seenRumors = {};
  if (typeof rod.seenIntro !== 'boolean') rod.seenIntro = false;
  if (typeof rod.progress !== 'number') rod.progress = 0;
  if (!rod.estate) rod.estate = 'dvoryane';
  if (!rod.titles) rod.titles = {};
  if (!rod.favor) rod.favor = {};
  if (!rod.flags) rod.flags = {};
  if (!rod.seenArrivalBonus) rod.seenArrivalBonus = {};
  if (!rod.seenMilestones) rod.seenMilestones = {};
  return rod;
}

// Пороговые награды знатности: при достижении slava >= threshold — разовая награда крестьянами.
const SLAVA_MILESTONES = [
  {threshold: 25, krestyane: 52},
  {threshold: 50, krestyane: 47},
  {threshold: 75, krestyane: 58},
  {threshold: 200, krestyane: 45},
  {threshold: 500, krestyane: 55}
];

// Все ещё не выданные рубежи знатности, которые род достиг при данной знатности (по умолчанию — текущей).
function pendingMilestones(rod, slava){
  const seen = rod.seenMilestones || {};
  const s = slava === undefined ? rod.resources.slava : slava;
  return SLAVA_MILESTONES.filter(m => s >= m.threshold && !seen[m.threshold]);
}

// Ищет первый элемент choice.conditionalEffects, чей requiresFlag стоит у рода.
function findConditionalEffect(choice, rod){
  if (!choice.conditionalEffects) return null;
  return choice.conditionalEffects.find(ce => ce.requiresFlag && rod.flags && rod.flags[ce.requiresFlag]) || null;
}

// Предохранитель: приводит объект аукциона к полной форме (используется и в render(), и в boot())
function patchAuction(auction){
  if (typeof auction.round !== 'number') auction.round = 1;
  if (!auction.bids) auction.bids = {};
  if (typeof auction.tiedRods === 'undefined') auction.tiedRods = null;
  if (typeof auction.winner === 'undefined') auction.winner = null;
  return auction;
}

// Расчёт тика экономики — чистая функция (ничего не мутирует). Её вызывают и реальное применение
// (applyEconomyTick), и прикидка «Хозяйство за ход» на экране рода, формулы не дублируются.
// Возвращает составляющие: бегство от централизации и от стабильности (%), крестьян до/после (с полом 20),
// их изменение и доход золота.
function computeEconomyTick(resources, estate, national){
  const nat = national || {stability: 10, centralization: 10};
  const krestyaneBefore = resources.krestyane;
  const zolotoDelta = Math.round(krestyaneBefore * 0.15);

  // Бегство от централизации: ниже 8 — дворяне 4%, бояре 2%; иначе 0
  const fleeCentralPct = nat.centralization < 8 ? (estate === 'boyare' ? 2 : 4) : 0;
  // Бегство от стабильности — ступенями: ниже 3 → 6%, от 3 до 7 → 3%, от 8 и выше → 0%
  const fleeStabilityPct = nat.stability < 3 ? 6 : (nat.stability < 8 ? 3 : 0);

  const fleePct = fleeCentralPct + fleeStabilityPct;
  let krestyaneAfter = fleePct !== 0 ? Math.round(krestyaneBefore * (1 - fleePct / 100)) : krestyaneBefore;
  krestyaneAfter = Math.max(20, krestyaneAfter);

  return {zolotoDelta, fleeCentralPct, fleeStabilityPct, krestyaneBefore, krestyaneAfter, krestyaneDelta: krestyaneAfter - krestyaneBefore};
}

// Единый тик экономики — на каждом переходе рода к следующему событию (кроме assembly), без чекпоинтов.
// Мутирует rod.resources и возвращает дельты.
function applyEconomyTick(rod){
  const t = computeEconomyTick(rod.resources, rod.estate, state.national);
  rod.resources.zoloto += t.zolotoDelta;
  rod.resources.krestyane = t.krestyaneAfter;
  return {zolotoDelta: t.zolotoDelta, krestyaneDelta: t.krestyaneDelta};
}

// Подводит итоги global-события: тальи голосов, запись в state.globalResults,
// применение effectByChoice каждому роду и nationalEffect (если указан) к state.national.
// Мутирует state, ничего не возвращает. Идемпотентна по факту вызова (перезаписывает тот же id).
async function resolveGlobalEvent(ev){
  if(resolvingNow[ev.id]) return false;
  resolvingNow[ev.id] = true;
  try {
    const rodNames = Object.keys(state.rods);
    const majorityKey = majorityOf(ev, n => state.rods[n].votes[ev.id]);
    // Метка подсчёта ставится транзакцией «только если ещё нет»: применяет эффекты ровно одно устройство, ровно один раз
    const claimed = await dbClaim('globalResults/' + ev.id, {majorityKey});
    if(!claimed) return false;
    const out = ev.outcomes[majorityKey];
    for(const n of rodNames){
      const myChoice = state.rods[n].votes[ev.id];
      const eff = (out.effectByChoice && out.effectByChoice[myChoice]) || {};
      if(Object.keys(eff).length) await txResources(n, res => applyEffect(res, eff));
    }
    if(out.nationalEffect) await txNational(out.nationalEffect);
    return true;
  } finally {
    delete resolvingNow[ev.id];
  }
}
// Аналог resolveGlobalEvent для type:"normal" событий с choice.majorityBonus —
// тальи личных ответов (rod.answers), без effectByChoice, только nationalEffect
// того выбора, что набрал большинство. Мутирует state, ничего не возвращает.
async function resolveMajorityBonus(ev){
  const key = 'mb:' + ev.id;
  if(resolvingNow[key]) return false;
  resolvingNow[key] = true;
  try {
    const rodNames = Object.keys(state.rods);
    const majorityKey = majorityOf(ev, n => { const a = state.rods[n].answers[ev.id]; return a && a.choiceKey; });
    const claimed = await dbClaim('majorityBonusResolved/' + ev.id, {majorityKey});
    if(!claimed) return false;
    const choice = ev.choices.find(c => c.key === majorityKey);
    const nationalEffect = choice && choice.majorityBonus && choice.majorityBonus.nationalEffect;
    if(nationalEffect) await txNational(nationalEffect);
    return true;
  } finally {
    delete resolvingNow[key];
  }
}

// ---------------------------------------------------------------------------
// Запись состояния по путям и транзакциями (ТЗ 15).
// Принцип: у каждого поля один автор, общие числа меняются транзакциями.
// Целиком состояние больше не пишется (кроме первичного создания/сброса организатором).
// ---------------------------------------------------------------------------
const resolvingNow = {}; // защита от повторного запуска подсчёта, пока предыдущий вызов ещё идёт

function cloneJSON(v){
  return (v === null || v === undefined) ? v : JSON.parse(JSON.stringify(v));
}

function dbFail(e){
  storageError = 'Ошибка облака: ' + e.message;
  render();
}

// Запись одного значения по пути (null удаляет).
async function dbSet(path, value){
  try { await stateRef.child(path).set(value); storageError = null; return true; }
  catch(e){ dbFail(e); return false; }
}

// Запись нескольких путей сразу: ключи — пути от корня, например {'rods/Имя/progress': 3}.
async function dbUpdate(updates){
  try { await stateRef.update(updates); storageError = null; return true; }
  catch(e){ dbFail(e); return false; }
}

// Транзакция по пути. fn получает копию текущего значения (null, если пусто) и возвращает новое;
// undefined — отказаться (транзакция не применится); null — удалить узел.
async function dbTx(path, fn){
  try {
    const r = await stateRef.child(path).transaction(cur => fn(cloneJSON(cur === undefined ? null : cur)));
    storageError = null;
    return {committed: !!r.committed, value: r.snapshot.val()};
  } catch(e){ dbFail(e); return {committed: false, value: null}; }
}

// «Поставить, только если ещё нет»: true, если значение поставили именно мы.
async function dbClaim(path, value){
  const r = await dbTx(path, cur => cur === null ? value : undefined);
  return r.committed;
}

// Изменение ресурсов рода: fn(resources) → новые resources, считается от актуального значения внутри транзакции.
// Если рода уже нет (удалён), ничего не пишет — удалённый род не воскресает.
async function txResources(rodName, fn){
  return dbTx('rods/' + rodName + '/resources', cur => cur === null ? undefined : fn(cur));
}

// Изменение национальных показателей: effect = {stability: +1, ...}.
async function txNational(effect){
  return dbTx('national', cur => {
    const n = cur || {stability: 10, centralization: 10};
    for(const k in effect) n[k] = (n[k] || 0) + effect[k];
    return n;
  });
}

// Итог большинства: ключ выбора с наибольшим числом голосов (при равенстве — первый из списка).
function majorityOf(ev, answerOf){
  const tally = {};
  ev.choices.forEach(c => tally[c.key] = 0);
  Object.keys(state.rods).forEach(n => { const v = answerOf(n); if(v && v in tally) tally[v]++; });
  let majorityKey = ev.choices[0].key;
  let max = -1;
  ev.choices.forEach(c => { if(tally[c.key] > max){ max = tally[c.key]; majorityKey = c.key; } });
  return majorityKey;
}

// Один раунд аукциона: чистая функция над объектом аукциона. Возвращает {auction, winnerName}.
function computeAuctionRound(auction, rodNames, ev){
  const a = patchAuction(cloneJSON(auction));
  const eligibleRods = a.round === 1 ? rodNames : (a.tiedRods || []);
  let maxBid = -1;
  eligibleRods.forEach(n => { const b = a.bids[n] || 0; if(b > maxBid) maxBid = b; });
  const topRods = eligibleRods.filter(n => (a.bids[n] || 0) === maxBid && maxBid > 0);
  let winnerName = null;
  if(topRods.length === 1){
    winnerName = topRods[0];
    a.winner = winnerName;
    a.narrative = `Наивысшую ставку сделал род «${winnerName}» — ${maxBid} золота.`;
  } else if(topRods.length > 1){
    a.round++;
    a.tiedRods = topRods;
    a.bids = {};
  } else {
    // никто не поставил ничего — повторяем раунд для тех же участников
    a.round++;
    a.tiedRods = eligibleRods;
    a.bids = {};
  }
  return {auction: a, winnerName};
}
