function initialState(){
  return {
    currentIndex: 0,
    events: [],
    rods: {},
    globalResults: {},
    auctions: {}
  };
}

function defaultResources(){ return {slava:10, krestyane:100, zoloto:50}; }

let state = null;
let role = null;
let currentRod = null;
let busy = false;
let storageError = null;
let sortBy = 'slava'; // 'slava' | 'krestyane' | 'zoloto' — выбор ведущего для сортировки таблицы родов
let selectedEstate = null;
let showHistory = false; // переключатель "История" на экране рода

function fmtDelta(effect){
  const labels = {slava:'Слава', krestyane:'Крестьяне', zoloto:'Золото'};
  const parts = [];
  for(const k in effect){
    if(!effect[k]) continue;
    const v = effect[k];
    parts.push(`<span class="effect-line ${v>0?'pos':'neg'}">${v>0?'+':''}${v} ${labels[k]}</span>`);
  }
  return parts.join(' &nbsp; ');
}

function applyEffect(res, effect){
  const out = {...res};
  for(const k in effect){ out[k] = (out[k]||0) + effect[k]; }
  return out;
}

function ensureRod(name, estate){
  if(!state.rods[name]){
    state.rods[name] = {
      resources: defaultResources(),
      answers: {},
      votes: {},
      seenReveal: {},
      seenRumors: {},
      order: Object.keys(state.rods).length,
      progress: 0,
      estate: estate || 'dvoryane',
      titles: {}
    };
  }
}

function errorBanner(){
  if(!storageError) return '';
  return `<div class="ui" style="background:#F0DCC9;color:#6E2018;border:1px solid #8C2A20;border-radius:6px;padding:10px 14px;margin-bottom:14px;font-size:13px;">${storageError}</div>`;
}

// Предохранитель: приводит объект рода к полной форме (используется и в render(), и в boot())
function patchRod(rod){
  if (!rod.resources) rod.resources = defaultResources();
  if (!rod.answers) rod.answers = {};
  if (!rod.votes) rod.votes = {};
  if (!rod.seenReveal) rod.seenReveal = {};
  if (!rod.seenRumors) rod.seenRumors = {};
  if (typeof rod.progress !== 'number') rod.progress = 0;
  if (!rod.estate) rod.estate = 'dvoryane';
  if (!rod.titles) rod.titles = {};
  return rod;
}
