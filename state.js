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

// Ресурсные ключи эффектов: только они применяются к ресурсам и показываются игроку.
// Спецключи выбора (bribe, income, incomeEnd, casualtyReduction) лежат в том же объекте effect,
// но ресурсами не являются и везде отфильтровываются.
const RESOURCE_KEYS = ['slava', 'krestyane', 'zoloto'];

// Чистая ресурсная часть эффекта (без спецключей) — для слияния и применения.
function resourceEffect(effect){
  const out = {};
  if(!effect) return out;
  RESOURCE_KEYS.forEach(k => { if(effect[k] !== undefined) out[k] = effect[k]; });
  return out;
}

// Дельты ресурсов для игрока: «Знатность +3», «Души −20», «Золото −200».
// Души — абсолютные числа (не проценты). Неизвестные ключи не показываются.
function fmtDelta(effect){
  const labels = {slava:'Знатность', zoloto:'Золото', krestyane:'Души'};
  const parts = [];
  for(const k in effect){
    if(!labels[k] || !effect[k]) continue;
    const v = effect[k];
    parts.push(`<span class="effect-line ${v>0?'pos':'neg'}">${v>0?'+':''}${v} ${labels[k]}</span>`);
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
// общий effect + effectByEstate[rod.estate] + первый подходящий условный эффект.
// Значения по одинаковым ключам суммируются (R10). Спецключи отфильтрованы.
function resolveEffect(source, rod, druzhina){
  const out = {};
  const add = eff => { const re = resourceEffect(eff); for(const k in re){ out[k] = (out[k] || 0) + re[k]; } };
  add(source && source.effect);
  add(source && source.effectByEstate && rod && source.effectByEstate[rod.estate]);
  // Ступень дружины: берётся дружина на момент выбора (druzhina), а если не передана — текущая по крестьянам рода
  if(source && source.druzhinaTiers && rod){
    const tier = findDruzhinaTier(source, druzhina === undefined ? druzhinaOf(rod.resources) : druzhina);
    if(tier) add(tier.effect);
  }
  // Условные добавки (ТЗ 21 S1): применяются все подходящие записи; текст берётся из первой подходящей.
  const ces = source && source.conditionalEffects ? source.conditionalEffects.filter(ce => {
    const flags = (rod && rod.flags) || {};
    const estate = rod && rod.estate;
    const slava = rod && rod.resources ? (rod.resources.slava || 0) : 0;
    if(ce.requiresFlag && !flags[ce.requiresFlag]) return false;
    if(ce.requiresEstate && ce.requiresEstate !== estate) return false;
    if(ce.minSlava !== undefined && slava < ce.minSlava) return false;
    return true;
  }) : [];
  ces.forEach(ce => add(ce.effect));
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

// Применение ресурсного эффекта: применяются только ресурсные ключи (спецключи игнорируются),
// души — абсолютные числа, после применения не ниже 20 (R8).
function applyEffect(res, effect){
  const out = {...res};
  const eff = resourceEffect(effect);
  RESOURCE_KEYS.forEach(k => {
    if(eff[k] === undefined) return;
    out[k] = (out[k] || 0) + eff[k];
  });
  if(out.krestyane < 20) out.krestyane = 20;
  return out;
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
  if (!rod.incomeMods) rod.incomeMods = {};
  if (typeof rod.casualtyReduction !== 'number') rod.casualtyReduction = 0;
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

// Первый подходящий элемент conditionalEffects (у выбора или события). Условия:
// requiresFlag — флаг стоит у рода; requiresEstate — совпадает сословие рода;
// minSlava — знатность рода не ниже порога (проверяется по ресурсам на момент вызова).
// Элемент без условий подходит всегда (ветка «по умолчанию») — в данных ставить её последней.
function findConditionalEffect(source, rod){
  if (!source || !source.conditionalEffects) return null;
  const flags = (rod && rod.flags) || {};
  const estate = rod && rod.estate;
  const slava = rod && rod.resources ? (rod.resources.slava || 0) : 0;
  return source.conditionalEffects.find(ce => {
    if(ce.requiresFlag && !flags[ce.requiresFlag]) return false;
    if(ce.requiresEstate && ce.requiresEstate !== estate) return false;
    if(ce.minSlava !== undefined && slava < ce.minSlava) return false;
    return true;
  }) || null;
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
function computeEconomyTick(resources, estate, national, incomeMods){
  const nat = national || {stability: 10, centralization: 10};
  const krestyaneBefore = resources.krestyane;
  const mods = Array.isArray(incomeMods) ? incomeMods : [];
  const income = krestyaneBefore * 1 + mods.reduce((a, b) => a + b, 0);

  // Бегство от централизации: ниже 5 — дворяне 4%, бояре 2%; иначе 0
  const fleeCentralPct = nat.centralization < 5 ? (estate === 'boyare' ? 2 : 4) : 0;
  // Бегство от стабильности — ступенями: ниже 3 → 6%, от 3 до 5 → 3%, от 5 и выше → 0%
  const fleeStabilityPct = nat.stability < 3 ? 6 : (nat.stability < 5 ? 3 : 0);

  const fleePct = fleeCentralPct + fleeStabilityPct;
  // R5: потеря считается один раз от текущих душ; округляется сама потеря, а не итог
  const fleeLoss = fleePct !== 0 ? roundHalfUp(krestyaneBefore * fleePct / 100) : 0;
  const krestyaneAfter = Math.max(20, krestyaneBefore - fleeLoss);

  return {zolotoDelta: income, fleeCentralPct: fleeCentralPct, fleeStabilityPct: fleeStabilityPct, fleeLoss: fleeLoss, krestyaneBefore: krestyaneBefore, krestyaneAfter: krestyaneAfter, krestyaneDelta: krestyaneAfter - krestyaneBefore};
}

function roundHalfUp(x){
  const m = Math.abs(x);
  const r = Math.floor(m + 0.5);
  return x < 0 ? -r : r;
}

// Посул (R7): готовая сумма — рубли −max(50, база − 5 × знатность до выбора).
function bribeCost(base, slava){
  return Math.max(50, base - 5 * (slava || 0));
}

// Военный расчёт (R9), чистая функция. military = {deploy, casualties, scale},
// scale = [{by: 'fielded'|'missing'|'due'|'extra', every, effect}], extra = floor(души ÷ 40).
// reductions — массив долей снижения потерь (суммируются): потери × max(0, 1 − сумма).
// Каждый погибший холоп отнимает 1 душу, души после потерь не ниже 20.
function computeMilitary(souls, military, reductions){
  const due = Math.floor(souls / 20);
  const deploy = military.deploy === undefined ? 1 : military.deploy;
  const fielded = roundHalfUp(due * deploy);
  const missing = due - fielded;
  const sumRed = (reductions || []).reduce((a, b) => a + b, 0);
  const factor = Math.max(0, 1 - sumRed);
  let lost = 0;
  if(fielded > 0){
    // ТЗ 21 S5: «потерять ровно 1 холопа» задаётся military.lossFixed: 1, а не casualties: 0.01.
    // Дробные проценты потерь (casualties) применяются к выставленным, фиксированная потеря — константой.
    if(typeof military.lossFixed === 'number'){
      lost = Math.min(fielded, Math.max(1, military.lossFixed));
    } else if(military.casualties > 0){
      lost = Math.min(fielded, Math.max(1, roundHalfUp(fielded * military.casualties * factor)));
    }
  }
  const soulsAfterLosses = Math.max(20, souls - lost);
  const units = {fielded: fielded, missing: missing, due: due, extra: Math.floor(souls / 40)};
  const scaleEffect = {};
  (military.scale || []).forEach(s => {
    const count = Math.floor((units[s.by] || 0) / s.every);
    for(const k in s.effect) scaleEffect[k] = (scaleEffect[k] || 0) + s.effect[k] * count;
  });
  return {due, fielded, missing, lost, soulsAfterLosses, scaleEffect};
}

// Активные прибавки к доходу на тике хода turn (R6): срок until включительный —
// на тике хода until прибавка ещё действует, со следующего нет.
function activeIncomeMods(rod, turn){
  const mods = (rod && rod.incomeMods) || {};
  const out = [];
  Object.keys(mods).forEach(key => {
    const m = mods[key];
    if(!m || typeof m.amount !== 'number') return;
    if(m.until !== undefined && m.until !== null && turn > m.until) return;
    out.push(m.amount);
  });
  return out;
}

// Единый тик экономики — на каждом переходе рода к следующему событию (кроме assembly), без чекпоинтов.
// Тик принадлежит ходу turn: доход = души × 1 + сумма активных на этом ходу прибавок (R4).
// Мутирует rod.resources и возвращает дельты.
function applyEconomyTick(rod, turn){
  const t = computeEconomyTick(rod.resources, rod.estate, state.national, activeIncomeMods(rod, turn));
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
    if(majorityKey === null) return false; // большинства нет — мировых эффектов не будет
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
// opts.force — досрочный подсчёт организатором: делитель — число ответивших (R11),
// итог запоминается окончательно. Без force ждём ответов всех родов.
async function resolveMajorityBonus(ev, opts){
  const force = !!(opts && opts.force);
  const key = 'mb:' + ev.id;
  if(resolvingNow[key]) return false;
  resolvingNow[key] = true;
  try {
    const rodNames = Object.keys(state.rods);
    const answeredOf = n => { const a = state.rods[n].answers[ev.id]; return a && a.choiceKey; };
    const answeredCount = rodNames.filter(n => answeredOf(n)).length;
    // Автоматический подсчёт (без force) выполняется только когда ответили все
    if(!force && answeredCount < rodNames.length) return false;
    const majorityKey = majorityOf(ev, answeredOf);
    // Метка подсчёта ставится транзакцией «только если ещё нет»: эффект применяется ровно один раз (R14)
    const claimed = await dbClaim('majorityBonusResolved/' + ev.id, {majorityKey});
    if(!claimed) return false;
    if(majorityKey === null) return true; // большинства нет — мировых эффектов не будет
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

// Итог большинства (R11): вариант, набравший строго больше половины голосов
// от числа ответивших родов (при полном подсчёте ответили все — делитель равен числу родов).
// При равенстве или отсутствии большинства возвращаем null — мировых эффектов нет.
function majorityOf(ev, answerOf){
  const tally = {};
  ev.choices.forEach(c => tally[c.key] = 0);
  let voters = 0;
  Object.keys(state.rods).forEach(n => {
    const v = answerOf(n);
    if(v === null || v === undefined || v === false) return;
    voters++; // род ответил — участвует в делителе, даже если его варианта уже нет в событии
    if(v in tally) tally[v]++;
  });
  let majorityKey = null;
  let max = -1;
  ev.choices.forEach(c => { if(tally[c.key] > max){ max = tally[c.key]; majorityKey = c.key; } });
  if(voters > 0 && max * 2 > voters) return majorityKey;
  return null;
}

// Итоги игры (R13): рода по знатности (убыв.), затем душам (убыв.), затем имени (алфавит).
function finalRanking(rods){
  return Object.keys(rods).sort((a, b) => {
    const ra = rods[a].resources || {}, rb = rods[b].resources || {};
    if((rb.slava || 0) !== (ra.slava || 0)) return (rb.slava || 0) - (ra.slava || 0);
    if((rb.krestyane || 0) !== (ra.krestyane || 0)) return (rb.krestyane || 0) - (ra.krestyane || 0);
    return a < b ? -1 : (a > b ? 1 : 0);
  });
}

// Вердикт державы (R13): централизация выше 10 — сильная власть, ниже 5 — вольница;
// стабильность ниже 5 — бунты.
function worldVerdict(national){
  const nat = national || {stability: 0, centralization: 0};
  return {
    strongPower: nat.centralization > 10,
    boyarFreedom: nat.centralization < 5,
    unrest: nat.stability < 5
  };
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
