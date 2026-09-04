function landingScreen(){
  return `
  <button class="gm-tiny-link" id="btn-gm">вход для мастера игры</button>
  <div class="center-screen">
    <div class="landing-card">
      <div class="crest">Б</div>
      <h1 class="title">Бунташный век</h1>
      <p class="subtitle">Ролевая игра для 7х классов</p>
      <button class="role-btn" id="btn-rod">Начать игру</button>
    </div>
  </div>
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
      <h1 class="title" style="font-size:22px;">Впишите свой род в эпоху</h1>
      <input type="text" id="rod-name-input" placeholder="Например: Волковы">
      <div class="estate-row">
        <button class="estate-btn" data-estate="boyare">Бояре</button>
        <button class="estate-btn" data-estate="dvoryane">Дворяне</button>
      </div>
      <button class="role-btn" id="btn-join">Войти в игру</button>
      ${existing.length ? `<div class="chip-row" id="chip-row">${existing.map(n=>`<button class="chip" data-name="${n}">${n}</button>`).join('')}</div>` : ''}
      <div class="top-link" id="btn-back-landing" style="margin-top:14px;">← назад</div>
    </div>
  </div>`;
}
function bindRodJoin(){
  selectedEstate = null;
  document.querySelectorAll('.estate-btn').forEach(btn=>{
    btn.onclick = ()=>{
      selectedEstate = btn.dataset.estate;
      document.querySelectorAll('.estate-btn').forEach(b=>b.classList.remove('active'));
      btn.classList.add('active');
    };
  });
  document.getElementById('btn-join').onclick = async ()=>{
    const val = document.getElementById('rod-name-input').value.trim();
    if(!val) return;
    if(!selectedEstate){ alert('Выберите сословие: Бояре или Дворяне'); return; }
    ensureRod(val, selectedEstate);
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
      <span class="name">${rod.estate === 'boyare' ? 'Боярский' : 'Дворянский'} род «${currentRod}»</span>
      <button id="btn-leave">перейти к выбору рода</button>
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
