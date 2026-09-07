function initialState(){
  return {
    currentIndex: 0,
    events: [],
    rods: {},
    globalResults: {},
    auctions: {}
  };
}

function defaultResources(estate){
  if(estate === 'boyare') return {slava:30, krestyane:150, zoloto:40};
  return {slava:10, krestyane:80, zoloto:60}; // dvoryane и запасной вариант
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

function ensureRod(name, estate){
  if(!state.rods[name]){
    state.rods[name] = {
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
  return rod;
}
