const firebaseConfig = {
  databaseURL: "https://buntash-era-default-rtdb.firebaseio.com"
};
firebase.initializeApp(firebaseConfig);
const db = firebase.database();
const stateRef = db.ref('buntash-state');


function initialState(){
  return {
    currentIndex: 0,
    events: [],
    rods: {},
    globalResults: {}
  };
}


function defaultResources(){ return {slava:10, krestyane:100, zoloto:50}; }


async function saveState(s){
  try {
    await stateRef.set(s);
    storageError = null;
  } catch(e) {
    storageError = 'Ошибка облака: ' + e.message;
    render();
  }
}


async function loadEvents() {
  try {
    const response = await fetch('events.json');
    return await response.json();
  } catch (e) {
    console.error('Ошибка загрузки событий:', e);
    return [];
  }
}


let state = null;
let role = null;
let currentRod = null;
let busy = false;
let storageError = null;


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


function ensureRod(name){
  if(!state.rods[name]){
    state.rods[name] = {
      resources: defaultResources(),
      answers: {},
      votes: {},
      seenReveal: {},
      order: Object.keys(state.rods).length,
      progress: 0
    };
  }
}


let sortBy = 'slava'; // 'slava' | 'krestyane' | 'zoloto' — выбор ведущего для сортировки таблицы родов


function errorBanner(){
  if(!storageError) return '';
  return `<div class="ui" style="background:#F0DCC9;color:#6E2018;border:1px solid #8C2A20;border-radius:6px;padding:10px 14px;margin-bottom:14px;font-size:13px;">${storageError}</div>`;
}


async function render(){
  const app = document.getElementById('app');
  if(!state){ app.innerHTML = '<div class="ui" style="color:#eee;text-align:center;padding:40px;">Загрузка...</div>'; return; }


  if (!state.globalResults) state.globalResults = {};
  if (!state.rods) {
    state.rods = {};
  } else {
    Object.keys(state.rods).forEach(name => {
      if (!state.rods[name]) state.rods[name] = {};
      if (!state.rods[name].resources) state.rods[name].resources = defaultResources();
      if (!state.rods[name].answers) state.rods[name].answers = {};
      if (!state.rods[name].votes) state.rods[name].votes = {};
      if (!state.rods[name].seenReveal) state.rods[name].seenReveal = {};
      if (typeof state.rods[name].progress !== 'number') state.rods[name].progress = 0;
    });
  }


  const banner = errorBanner();
  if(!role){
    app.innerHTML = banner + landingScreen();
    bindLanding();
    return;
  }
  if(role === 'rod' && !currentRod){
    app.innerHTML = banner + rodJoinScreen();
    bindRodJoin();
    return;
  }
  if(role === 'rod'){
    app.innerHTML = banner + rodScreen();
    bindRodScreen();
    return;
  }
  if(role === 'gm'){
    app.innerHTML = banner + gmScreen();
    bindGmScreen();
  }
}


function landingScreen(){
  return `
  <div class="center-screen">
    <div class="landing-card">
      <div class="crest">Б</div>
      <h1 class="title">Бунташный век</h1>
      <p class="subtitle">Ролевая игра для родов</p>
      <button class="role-btn" id="btn-rod">Начать игру</button>
    </div>
  </div>
  <button class="gm-tiny-link" id="btn-gm">ведущий</button>
  <div class="school-footer">Школа 1576 «Праздники эпох»</div>`;
}
function bindLanding(){
  document.getElementById('btn-gm').onclick = ()=>{ role='gm'; render(); };
  document.getElementById('btn-rod').onclick = ()=>{ role='rod'; render(); };
}


function rodJoinScreen(){
  const existing = Object.keys(state.rods);
  return `
  <div class="center-screen">
    <div class="landing-card">
      <div class="crest">Р</div>
      <h1 class="title" style="font-size:22px;">Назовите свой род</h1>
      <p class="subtitle">Впишите название или выберите уже созданный род</p>
      <input type="text" id="rod-name-input" placeholder="Например: Волковы">
      <button class="role-btn" id="btn-join">Войти в игру</button>
      ${existing.length ? `<div class="chip-row" id="chip-row">${existing.map(n=>`<button class="chip" data-name="${n}">${n}</button>`).join('')}</div>` : ''}
      <div class="top-link" id="btn-back-landing" style="margin-top:14px;">← назад</div>
    </div>
  </div>`;
}
function bindRodJoin(){
  document.getElementById('btn-join').onclick = async ()=>{
    const val = document.getElementById('rod-name-input').value.trim();
    if(!val) return;
    ensureRod(val);
    await saveState(state);
    currentRod = val;
    render();
  };
  const chipRow = document.getElementById('chip-row');
  if(chipRow){
    chipRow.querySelectorAll('.chip').forEach(btn=>{
      btn.onclick = ()=>{ currentRod = btn.dataset.name; render(); };
    });
  }
  document.getElementById('btn-back-landing').onclick = ()=>{ role=null; render(); };
}


function rodScreen(){
  const rod = state.rods[currentRod];
  const idx = Math.min(rod.progress || 0, state.events.length - 1);
  const ev = state.events[idx];
  const res = rod.resources;
  const isLast = idx >= state.events.length - 1;
  const nextBtnHtml = isLast
    ? `<p class="small-note">Это было последнее событие — ждите продолжения.</p>`
    : `<button class="choice-btn" id="btn-next-event">Далее →</button>`;


  // Непоказанные итоги отложенных (глобальных) событий — не зависят от того, на каком событии род сейчас
  const pendingEv = state.events.find(e => e.type === 'global' && rod.votes[e.id] && state.globalResults[e.id] && !rod.seenReveal[e.id]);
  let revealBanner = '';
  if(pendingEv){
    const gr = state.globalResults[pendingEv.id];
    const out = pendingEv.outcomes[gr.majorityKey];
    const myChoice = rod.votes[pendingEv.id];
    const personalEffect = (out.effectByChoice && out.effectByChoice[myChoice]) || {};
    revealBanner = `
      <div class="event-card">
        <span class="type-badge global">Вести с Земского собора</span>
        <h2 class="event-title">${pendingEv.title}</h2>
        <div class="outcome-box">
          <div class="otitle">Итоги решены</div>
          <div class="otext">${out.narrative}</div>
          ${fmtDelta(personalEffect)}
        </div>
        <button class="choice-btn" id="btn-ack-reveal" data-ev="${pendingEv.id}">Понятно</button>
      </div>`;
  }


  const answered = ev.type === 'normal' ? rod.answers[ev.id] : (rod.votes[ev.id] ? {choiceKey: rod.votes[ev.id]} : null);
  const typeLabel = ev.type === 'normal' ? 'Обычное событие' : 'Глобальное событие';
  const typeClass = ev.type === 'normal' ? 'normal' : 'global';


  let body = '';
  if(!answered){
    body = `
      <div class="event-card">
        <span class="era-badge">${ev.era}</span><span class="type-badge ${typeClass}">${typeLabel}</span>
        <h2 class="event-title">${ev.title}</h2>
        <p class="event-desc">${ev.description}</p>
        ${ev.choices.map(c=>`<button class="choice-btn" data-key="${c.key}">${c.label}</button>`).join('')}
      </div>`;
  } else {
    const choice = ev.choices.find(c=>c.key===answered.choiceKey);
    const waitNote = ev.type === 'global' ? `<p class="small-note">Итоги этого решения придут позже, на Земском соборе.</p>` : '';
    body = `
      <div class="event-card">
        <span class="era-badge">${ev.era}</span><span class="type-badge ${typeClass}">${typeLabel}</span>
        <h2 class="event-title">${ev.title}</h2>
        <p class="event-desc" style="opacity:0.75">Ваш выбор: ${choice ? choice.label : ''}</p>
        <div class="outcome-box">
          <div class="otitle">${choice.outcomeTitle}</div>
          <div class="otext">${choice.outcomeText}</div>
          ${fmtDelta(choice.effect)}
        </div>
        ${waitNote}
        ${nextBtnHtml}
      </div>`;
  }


  return `
    <div class="rod-header">
      <span class="name">Род «${currentRod}»</span>
      <button id="btn-leave">сменить род</button>
    </div>
    <div class="resource-bar">
      <div class="res-pill"><div class="val">${res.slava}</div><div class="lab">Слава</div></div>
      <div class="res-pill"><div class="val">${res.krestyane}</div><div class="lab">Крестьяне</div></div>
      <div class="res-pill"><div class="val">${res.zoloto}</div><div class="lab">Золото</div></div>
    </div>
    ${revealBanner}
    ${body}
  `;
}
function bindRodScreen(){
  document.getElementById('btn-leave').onclick = ()=>{ currentRod=null; render(); };
  const rod = state.rods[currentRod];
  const idx = Math.min(rod.progress || 0, state.events.length - 1);
  document.querySelectorAll('[data-key]').forEach(btn=>{
    btn.onclick = async ()=>{
      if(busy) return;
      busy = true;
      const ev = state.events[idx];
      const choice = ev.choices.find(c=>c.key===btn.dataset.key);
      if(ev.type === 'normal'){
        rod.answers[ev.id] = {choiceKey: choice.key};
      } else {
        rod.votes[ev.id] = choice.key;
        rod.answers[ev.id] = {choiceKey: choice.key};
      }
      rod.resources = applyEffect(rod.resources, choice.effect || {});
      render();
      await saveState(state);
      busy = false;
    };
  });
  const ackBtn = document.getElementById('btn-ack-reveal');
  if(ackBtn){
    ackBtn.onclick = async ()=>{
      if(busy) return;
      busy = true;
      rod.seenReveal[ackBtn.dataset.ev] = true;
      render();
      await saveState(state);
      busy = false;
    };
  }
  const nextBtn = document.getElementById('btn-next-event');
  if(nextBtn){
    nextBtn.onclick = async ()=>{
      if(busy) return;
      busy = true;
      if(rod.progress < state.events.length - 1) rod.progress++;
      render();
      await saveState(state);
      busy = false;
    };
  }
}


function gmScreen(){
  const ev = state.events[state.currentIndex];
  const allRodNames = Object.keys(state.rods);
  const rodNames = allRodNames.slice().sort((a,b)=> state.rods[b].resources[sortBy] - state.rods[a].resources[sortBy]);


  const sortLabels = {slava:'Слава', krestyane:'Крестьяне', zoloto:'Золото'};
  const sortTabs = `
    <div class="sort-tabs">
      ${Object.keys(sortLabels).map(k=>`<button data-sort="${k}" class="${sortBy===k?'active':''}">${sortLabels[k]}</button>`).join('')}
    </div>`;


  const summaryRows = rodNames.map((name,i)=>{
    const r = state.rods[name];
    return `<tr class="rod-row" data-rod="${name}">
      <td>${i+1}</td><td>${name}</td><td>${r.resources.slava}</td><td>${r.resources.krestyane}</td><td>${r.resources.zoloto}</td>
    </tr>`;
  }).join('');


  const timeline = state.events.map((e,i)=>{
    const done = e.type === 'normal'
      ? allRodNames.filter(n=>state.rods[n].answers[e.id]).length
      : allRodNames.filter(n=>state.rods[n].votes[e.id]).length;
    return `<div class="tl-item ${i===state.currentIndex?'active':''}" data-jump="${i}">
      <div class="tl-dot"></div>
      <div class="tl-title">${e.title}</div>
      <div class="tl-count">${done}/${allRodNames.length}</div>
    </div>`;
  }).join('');


  let rightPanel = '';
  if(ev.type === 'normal'){
    const answeredCount = allRodNames.filter(n=>state.rods[n].answers[ev.id]).length;
    rightPanel = `
      <span class="era-badge">${ev.era}</span><span class="type-badge normal">Обычное</span>
      <h2 class="event-title">${ev.title}</h2>
      <p class="event-desc">${ev.description}</p>
      <p class="ui" style="font-size:13px;color:var(--ink-soft);">Ответили: ${answeredCount} из ${allRodNames.length} родов</p>
    `;
  } else {
    const tally = {};
    ev.choices.forEach(c=>tally[c.key]=0);
    allRodNames.forEach(n=>{ const v = state.rods[n].votes[ev.id]; if(v) tally[v]++; });
    const notVoted = allRodNames.filter(n=>!state.rods[n].votes[ev.id]);


    rightPanel = `
      <span class="era-badge">${ev.era}</span><span class="type-badge global">Глобальное</span>
      <h2 class="event-title">${ev.title}</h2>
      <p class="event-desc">${ev.description}</p>
      <div class="vote-tally">
        ${ev.choices.map(c=>`<div class="vote-row"><span>${c.label}</span><span>${tally[c.key]}</span></div>`).join('')}
      </div>
      ${notVoted.length ? `<p class="small-note">Ещё не проголосовали: ${notVoted.join(', ')}</p>` : `<p class="small-note">Все рода проголосовали.</p>`}
      ${state.globalResults[ev.id]
        ? `<div class="revealed-note">Итоги оглашены: победил вариант «${ev.choices.find(c=>c.key===state.globalResults[ev.id].majorityKey)?.label}».<br>${ev.outcomes[state.globalResults[ev.id].majorityKey].narrative}</div>`
        : `<button class="reveal-btn" id="btn-reveal">Огласить итоги (после Земского собора)</button>`
      }
    `;
  }


  return `
    <div class="rod-header">
      <span class="name">Панель ведущего</span>
      <button id="btn-leave-gm">выйти</button>
    </div>
    <div class="timeline">${timeline}</div>
    <div class="gm-grid">
      <div class="gm-panel">
        <div class="gm-nav">
          <button id="btn-prev" ${state.currentIndex===0?'disabled':''}>← пред.</button>
          <span class="pos ui">Событие ${state.currentIndex+1} / ${state.events.length}</span>
          <button id="btn-next" ${state.currentIndex===state.events.length-1?'disabled':''}>след. →</button>
        </div>
        ${sortTabs}
        <table class="summary">
          <tr><th>#</th><th>Род</th><th>Слава</th><th>Крест.</th><th>Золото</th></tr>
          ${summaryRows || '<tr><td colspan="5" style="color:var(--ink-soft);padding:10px 0;">Ещё никто не присоединился</td></tr>'}
        </table>
        <div id="history-slot"></div>
        <button class="reveal-btn" style="background:var(--seal);margin-top:16px;" id="btn-reset">Сбросить игру</button>
      </div>
      <div class="gm-panel">${rightPanel}</div>
    </div>
  `;
}
function bindGmScreen(){
  document.getElementById('btn-leave-gm').onclick = ()=>{ role=null; render(); };
  document.querySelectorAll('.sort-tabs button').forEach(btn=>{
    btn.onclick = ()=>{ sortBy = btn.dataset.sort; render(); };
  });
  document.querySelectorAll('.tl-item').forEach(item=>{
    item.onclick = async ()=>{
      if(busy) return;
      busy = true;
      state.currentIndex = parseInt(item.dataset.jump, 10);
      render();
      await saveState(state);
      busy = false;
    };
  });
  document.getElementById('btn-prev').onclick = async ()=>{
    if(busy || state.currentIndex<=0) return;
    busy = true;
    state.currentIndex--; render(); await saveState(state); busy = false;
  };
  document.getElementById('btn-next').onclick = async ()=>{
    if(busy || state.currentIndex>=state.events.length-1) return;
    busy = true;
    state.currentIndex++; render(); await saveState(state); busy = false;
  };
  const revealBtn = document.getElementById('btn-reveal');
  if(revealBtn){
    revealBtn.onclick = async ()=>{
      if(busy) return;
      busy = true;
      const ev = state.events[state.currentIndex];
      const rodNames = Object.keys(state.rods);
      const tally = {};
      ev.choices.forEach(c=>tally[c.key]=0);
      rodNames.forEach(n=>{ const v = state.rods[n].votes[ev.id]; if(v) tally[v]++; });
      let majorityKey = ev.choices[0].key;
      let max = -1;
      ev.choices.forEach(c=>{ if(tally[c.key] > max){ max = tally[c.key]; majorityKey = c.key; } });
      state.globalResults[ev.id] = {majorityKey};
      const out = ev.outcomes[majorityKey];
      rodNames.forEach(n=>{
        const rod = state.rods[n];
        const myChoice = rod.votes[ev.id];
        const eff = (out.effectByChoice && out.effectByChoice[myChoice]) || {};
        rod.resources = applyEffect(rod.resources, eff);
      });
      render();
      await saveState(state);
      busy = false;
    };
  }
  document.getElementById('btn-reset').onclick = async ()=>{
    if(!confirm('Сбросить всю игру и ресурсы всех родов?')) return;
    busy = true;
    state = initialState();
    render();
    await saveState(state);
    busy = false;
  };
  document.querySelectorAll('.rod-row').forEach(row=>{
    row.onclick = ()=>{
      const name = row.dataset.rod;
      const slot = document.getElementById('history-slot');
      const rod = state.rods[name];
      const items = state.events.map(ev=>{
        if(ev.type==='normal'){
          const a = rod.answers[ev.id];
          if(!a) return `<div class="history-item"><span class="h-event">${ev.title}</span> — <span class="h-status">ещё не выбрано</span></div>`;
          const choice = ev.choices.find(c=>c.key===a.choiceKey);
          return `<div class="history-item"><span class="h-event">${ev.title}</span>: <span class="h-choice">${choice.label}</span></div>`;
        } else {
          const v = rod.votes[ev.id];
          if(!v) return `<div class="history-item"><span class="h-event">${ev.title}</span> — <span class="h-status">ещё не голосовал</span></div>`;
          const choice = ev.choices.find(c=>c.key===v);
          const status = state.globalResults[ev.id] ? '(итоги оглашены)' : '(ждёт Земского собора)';
          return `<div class="history-item"><span class="h-event">${ev.title}</span>: <span class="h-choice">${choice.label}</span> <span class="h-status">${status}</span></div>`;
        }
      }).join('');
      slot.innerHTML = `<div class="history-panel"><strong style="display:block;margin-bottom:6px;">История рода «${name}»</strong>${items}</div>`;
    };
  });
}


async function boot(){
  const freshEvents = await loadEvents(); // Сначала загружаем события из JSON
  
  stateRef.on('value', (snapshot) => {
    const data = snapshot.val();
    if (data) {
      state = data;
      state.events = freshEvents;
      if (!state.globalResults) state.globalResults = {};


      // 1. Предохранитель для списка родов
      if (!state.rods) {
        state.rods = {};
      } else {
        // 2. Предохранитель для каждого рода: восстанавливаем пустые answers и votes, 
        // если Firebase удалил их из-за пустоты.
        Object.keys(state.rods).forEach(name => {
          if (!state.rods[name].answers) state.rods[name].answers = {};
          if (!state.rods[name].votes) state.rods[name].votes = {};
          if (!state.rods[name].seenReveal) state.rods[name].seenReveal = {};
          if (typeof state.rods[name].progress !== 'number') state.rods[name].progress = 0;
        });
      }
      
    } else {
      state = initialState();
      state.events = freshEvents;
      stateRef.set(state);
    }
    render();
  });
}
boot();
