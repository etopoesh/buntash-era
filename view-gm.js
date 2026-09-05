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
    const titles = Object.values(r.titles||{}).join(', ');
    return `<tr class="rod-row" data-rod="${name}">
      <td>${i+1}</td><td>${name}${titles ? ` <span class="title-badge-sm">${titles}</span>` : ''}</td><td>${r.resources.slava}</td><td>${r.resources.krestyane}</td><td>${r.resources.zoloto}</td>
    </tr>`;
  }).join('');

  const timeline = state.events.map((e,i)=>{
    let done;
    if(e.type === 'normal') done = allRodNames.filter(n=>state.rods[n].answers[e.id]).length;
    else if(e.type === 'global') done = allRodNames.filter(n=>state.rods[n].votes[e.id]).length;
    else if(e.type === 'auction') done = (state.auctions[e.id] && state.auctions[e.id].winner) ? allRodNames.length : (state.auctions[e.id] ? Object.keys(state.auctions[e.id].bids).length : 0);
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
  } else if(ev.type === 'auction'){
    const auction = state.auctions[ev.id] || {round:1, bids:{}, tiedRods:null, winner:null};
    const eligibleRods = auction.round === 1 ? allRodNames : (auction.tiedRods || []);
    const bidRows = eligibleRods.map(n=>{
      const bid = auction.bids[n];
      return `<div class="vote-row"><span>${n}</span><span>${bid !== undefined ? bid + ' зол.' : 'ждём…'}</span></div>`;
    }).join('');
    const allBid = eligibleRods.length > 0 && eligibleRods.every(n=>auction.bids[n]!==undefined);
    rightPanel = `
      <span class="era-badge">${ev.era}</span><span class="type-badge auction">Торги за титул</span>
      <h2 class="event-title">${ev.title}</h2>
      <p class="event-desc">${ev.description}</p>
      <p class="small-note">Раунд ${auction.round}${auction.round>1 ? ' — переторжка при ничьей, между: ' + (auction.tiedRods||[]).join(', ') : ''}</p>
      <div class="vote-tally">${bidRows || '<p class="small-note">Пока никто не поставил</p>'}</div>
      ${auction.winner
        ? `<div class="revealed-note">Титул «${ev.titleName}» получил род «${auction.winner}».<br>${auction.narrative || ''}</div>`
        : `<button class="reveal-btn" id="btn-resolve-auction">${allBid ? 'Определить победителя' : 'Определить победителя (не все ещё поставили)'}</button>`
      }
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
  const resolveBtn = document.getElementById('btn-resolve-auction');
  if(resolveBtn){
    resolveBtn.onclick = async ()=>{
      if(busy) return;
      busy = true;
      const ev = state.events[state.currentIndex];
      if(!state.auctions[ev.id]) state.auctions[ev.id] = {round:1, bids:{}, tiedRods:null, winner:null};
      const auction = state.auctions[ev.id];
      const eligibleRods = auction.round === 1 ? Object.keys(state.rods) : (auction.tiedRods || []);
      let maxBid = -1;
      eligibleRods.forEach(n=>{ const b = auction.bids[n] || 0; if(b > maxBid) maxBid = b; });
      const topRods = eligibleRods.filter(n=>(auction.bids[n]||0) === maxBid && maxBid > 0);
      if(topRods.length === 1){
        const winnerName = topRods[0];
        auction.winner = winnerName;
        auction.narrative = `Наивысшую ставку сделал род «${winnerName}» — ${maxBid} золота.`;
        if(!state.rods[winnerName].titles) state.rods[winnerName].titles = {};
        state.rods[winnerName].titles[ev.titleKey] = ev.titleName;
      } else if(topRods.length > 1){
        auction.round++;
        auction.tiedRods = topRods;
        auction.bids = {};
      } else {
        // никто не поставил ничего — повторяем раунд для тех же участников
        auction.round++;
        auction.tiedRods = eligibleRods;
        auction.bids = {};
      }
      render();
      await saveState(state);
      busy = false;
    };
  }
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
        } else if(ev.type==='auction'){
          const auction = state.auctions[ev.id];
          const bid = auction && auction.bids && auction.bids[name];
          if(bid === undefined) return `<div class="history-item"><span class="h-event">${ev.title}</span> — <span class="h-status">не участвовал</span></div>`;
          const status = auction.winner ? (auction.winner === name ? `получил титул «${ev.titleName}»` : 'проиграл торги') : 'ставка сделана, ждёт итогов';
          return `<div class="history-item"><span class="h-event">${ev.title}</span>: <span class="h-choice">ставка ${bid} зол.</span> <span class="h-status">${status}</span></div>`;
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
