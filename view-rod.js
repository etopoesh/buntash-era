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

  const titleBadges = Object.values(rod.titles||{}).map(t=>`<span class="title-badge">${t}</span>`).join('');
  const header = `
    <div class="rod-header">
      <span class="name">${rod.estate === 'boyare' ? 'Боярский' : 'Дворянский'} род «${currentRod}» ${titleBadges}</span>
      <button id="btn-leave">перейти к выбору рода</button>
    </div>
    <div class="resource-bar">
      <div class="res-pill"><div class="val">${res.slava}</div><div class="lab">Слава</div></div>
      <div class="res-pill"><div class="val">${res.krestyane}</div><div class="lab">Крестьяне</div></div>
      <div class="res-pill"><div class="val">${res.zoloto}</div><div class="lab">Золото</div></div>
    </div>`;

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

  // Панель истории — что род уже выбирал раньше и к чему это привело (без слухов, с датами)
  const historyToggle = `<button class="top-link" id="btn-toggle-history">${showHistory ? 'Скрыть историю ▲' : 'История ▼'}</button>`;
  let historyPanel = '';
  if(showHistory){
    const items = state.events.slice(0, idx).map(e=>{
      const dateTag = `<span class="h-date">${e.era || ''}</span>`;
      if(e.type === 'auction'){
        const auction = state.auctions[e.id];
        const myBid = auction && auction.bids && auction.bids[currentRod];
        let status = 'не участвовали';
        if(auction && auction.winner){
          status = auction.winner === currentRod ? `получили титул «${e.titleName}»` : 'проиграли торги';
        } else if(myBid !== undefined){
          status = 'ставка сделана, ждём итогов';
        }
        return `<div class="history-item">${dateTag}<span class="h-event">${e.title}</span>: <span class="h-choice">${status}</span></div>`;
      }
      const choiceKey = e.type === 'normal' ? (rod.answers[e.id] && rod.answers[e.id].choiceKey) : rod.votes[e.id];
      if(!choiceKey) return `<div class="history-item">${dateTag}<span class="h-event">${e.title}</span> — <span class="h-status">пропущено</span></div>`;
      const choice = e.choices.find(c=>c.key===choiceKey);
      return `<div class="history-item">${dateTag}<span class="h-event">${e.title}</span>: <span class="h-choice">${choice ? choice.label : ''}</span></div>`;
    }).join('');
    historyPanel = `<div class="history-panel">${items || '<span class="small-note">Пока ничего не было</span>'}</div>`;
  }

  // Слухи — необязательный переходный экран перед конкретным событием, показывается один раз
  if(ev.rumors && ev.rumors.length && !rod.seenRumors[ev.id]){
    const rumorBody = `
      <div class="event-card">
        <span class="era-badge">${ev.era || ''}</span><span class="type-badge rumor">Слухи</span>
        <h2 class="event-title">Вести с земли</h2>
        <div class="rumor-list">${ev.rumors.map(t=>`<p class="rumor-item">${t}</p>`).join('')}</div>
        <button class="choice-btn" id="btn-rumor-continue" data-ev="${ev.id}">Далее →</button>
      </div>`;
    return `${header}${historyToggle}${historyPanel}${rumorBody}`;
  }

  let body = '';
  if(ev.type === 'auction'){
    const auction = state.auctions[ev.id] || {round:1, bids:{}, tiedRods:null, winner:null};
    if(auction.winner){
      const won = auction.winner === currentRod;
      body = `
        <div class="event-card">
          <span class="era-badge">${ev.era}</span><span class="type-badge auction">Торги за титул</span>
          <h2 class="event-title">${ev.title}</h2>
          <div class="outcome-box">
            <div class="otitle">${won ? `Ваш род получил титул «${ev.titleName}»!` : `Титул «${ev.titleName}» получил род «${auction.winner}»`}</div>
            <div class="otext">${auction.narrative || ''}</div>
          </div>
          ${nextBtnHtml}
        </div>`;
    } else {
      const eligible = auction.round === 1 || (auction.tiedRods && auction.tiedRods.includes(currentRod));
      const alreadyBid = auction.bids[currentRod] !== undefined;
      if(!eligible){
        body = `
          <div class="event-card">
            <span class="era-badge">${ev.era}</span><span class="type-badge auction">Торги за титул</span>
            <h2 class="event-title">${ev.title}</h2>
            <div class="waiting-box">Ваша ставка не победила в первом раунде. Торги продолжаются между другими родами — ждите итогов.</div>
          </div>`;
      } else if(alreadyBid){
        body = `
          <div class="event-card">
            <span class="era-badge">${ev.era}</span><span class="type-badge auction">Торги за титул</span>
            <h2 class="event-title">${ev.title}</h2>
            <div class="waiting-box">Ставка принята: ${auction.bids[currentRod]} золота. Ждите оглашения итогов.</div>
          </div>`;
      } else {
        body = `
          <div class="event-card">
            <span class="era-badge">${ev.era}</span><span class="type-badge auction">Торги за титул</span>
            <h2 class="event-title">${ev.title}</h2>
            <p class="event-desc">${ev.description}</p>
            ${auction.round > 1 ? `<p class="small-note">Второй раунд: ваша ставка сравнялась с другим родом. Новая ставка — из оставшегося золота.</p>` : ''}
            <div class="bid-row">
              <input type="number" id="bid-input" min="0" max="${res.zoloto}" placeholder="Золота (макс. ${res.zoloto})">
              <button class="choice-btn" id="btn-submit-bid">Сделать ставку</button>
            </div>
          </div>`;
      }
    }
  } else {
    const answered = ev.type === 'normal' ? rod.answers[ev.id] : (rod.votes[ev.id] ? {choiceKey: rod.votes[ev.id]} : null);
    const typeLabel = ev.type === 'normal' ? 'Обычное событие' : 'Глобальное событие';
    const typeClass = ev.type === 'normal' ? 'normal' : 'global';
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
  }

  return `${header}${historyToggle}${historyPanel}${revealBanner}${body}`;
}
function bindRodScreen(){
  document.getElementById('btn-leave').onclick = ()=>{ currentRod=null; render(); };
  const rod = state.rods[currentRod];
  const idx = Math.min(rod.progress || 0, state.events.length - 1);
  const ev = state.events[idx];

  document.getElementById('btn-toggle-history').onclick = ()=>{ showHistory = !showHistory; render(); };

  const rumorBtn = document.getElementById('btn-rumor-continue');
  if(rumorBtn){
    rumorBtn.onclick = async ()=>{
      if(busy) return;
      busy = true;
      if(!rod.seenRumors) rod.seenRumors = {};
      rod.seenRumors[rumorBtn.dataset.ev] = true;
      render();
      await saveState(state);
      busy = false;
    };
    return; // на экране слухов больше нечего привязывать
  }

  document.querySelectorAll('[data-key]').forEach(btn=>{
    btn.onclick = async ()=>{
      if(busy) return;
      busy = true;
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
  const bidBtn = document.getElementById('btn-submit-bid');
  if(bidBtn){
    bidBtn.onclick = async ()=>{
      if(busy) return;
      const input = document.getElementById('bid-input');
      let amount = parseInt(input.value, 10);
      if(isNaN(amount) || amount <= 0){ alert('Введите сумму ставки больше нуля'); return; }
      if(amount > rod.resources.zoloto) amount = rod.resources.zoloto;
      busy = true;
      if(!state.auctions[ev.id]) state.auctions[ev.id] = {round:1, bids:{}, tiedRods:null, winner:null};
      state.auctions[ev.id].bids[currentRod] = amount;
      rod.resources = applyEffect(rod.resources, {zoloto: -amount});
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
