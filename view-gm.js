// Черновик поля «Рода» и сообщение об ошибках сохраняются между перерисовками (render() пересоздаёт DOM)
let gmRodsDraft = '';
let gmRodsMsg = '';
let gmSeatingOpen = {}; // id assembly-события → показана ли рассадка

function gmScreen(){
  const ev = state.events[state.currentIndex];
  const allRodNames = Object.keys(state.rods);
  const rodNames = allRodNames.slice().sort((a,b)=> state.rods[b].resources[sortBy] - state.rods[a].resources[sortBy]);

  const sortLabels = {slava:'Милость', krestyane:'Крестьяне', zoloto:'Золото'};
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
    else if(e.type === 'narrative') done = allRodNames.filter(n=>(state.rods[n].progress||0) > i).length;
    else if(e.type === 'assembly') done = allRodNames.filter(n=>(state.rods[n].progress||0) >= i).length;
    else if(e.type === 'auction') done = (state.auctions[e.id] && state.auctions[e.id].winner) ? allRodNames.length : (state.auctions[e.id] ? Object.keys(state.auctions[e.id].bids).length : 0);
    return `<div class="tl-item ${i===state.currentIndex?'active':''}" data-jump="${i}">
      <div class="tl-dot"></div>
      <div class="tl-title">${e.title}</div>
      <div class="tl-count">${done}/${allRodNames.length}</div>
    </div>`;
  }).join('');

  // Блок «Ворота»: ближайшее ещё не открытое assembly-событие
  const gateIdx = state.events.findIndex(e => e.type === 'assembly' && !(state.releasedAssemblies && state.releasedAssemblies[e.id]));
  let gateHtml = '';
  if(gateIdx >= 0){
    const g = state.events[gateIdx];
    const reached = allRodNames.filter(n=>(state.rods[n].progress||0) >= gateIdx).length;
    gateHtml = `
      <div class="gm-panel" style="margin-bottom:12px;">
        <strong>Ворота: ${g.title}</strong>
        <p class="small-note">Дошли ${reached} из ${allRodNames.length} команд</p>
        ${g.final
          ? `<p class="small-note">Финальное событие — ворота не открываются, игра завершается здесь.</p>`
          : `<button class="reveal-btn" id="btn-release-assembly" data-ev="${g.id}">Открыть следующий раунд</button>`}
      </div>`;
  }

  // Блок «Рода»: создание списком и удаление нетронутых
  const estateLabelGm = {boyare:'боярский', dvoryane:'дворянский'};
  const rodListHtml = allRodNames.map((n,i)=>{
    const r = state.rods[n];
    return `<div class="vote-row"><span>${escapeHtml(n)} · ${estateLabelGm[r.estate] || 'дворянский'}</span>${canDeleteRod(r) ? `<button class="btn-del-rod" data-idx="${i}">Удалить</button>` : `<span class="small-note">уже играет</span>`}</div>`;
  }).join('');
  const rodsBlock = `
    <div class="manual-adjust">
      <strong style="display:block;margin-bottom:6px;font-size:12px;">Рода (по строке: «Имя, боярский» или «Имя, дворянский»)</strong>
      <textarea id="rods-input" rows="5" style="width:100%;box-sizing:border-box;" placeholder="Волковы, боярский&#10;Лисины, дворянский">${escapeHtml(gmRodsDraft)}</textarea>
      <button id="btn-create-rods">Создать рода</button>
      ${gmRodsMsg ? `<div class="ui" style="color:var(--danger);font-size:13px;margin-top:6px;">${gmRodsMsg}</div>` : ''}
      <div class="vote-tally" style="margin-top:8px;">${rodListHtml || '<p class="small-note">Родов пока нет</p>'}</div>
    </div>`;

  // Темп: отстающие сверху
  const totalEvents = state.events.length;
  const paceRows = allRodNames.slice().sort((a,b)=>{
    const d = (state.rods[a].progress||0) - (state.rods[b].progress||0);
    return d !== 0 ? d : a.localeCompare(b, 'ru');
  }).map(n=>{
    const turn = (state.rods[n].progress||0) + 1;
    const pct = Math.min(100, Math.round(turn / Math.max(1, totalEvents) * 100));
    return `<tr><td>${escapeHtml(n)}</td><td>${turn} из ${totalEvents}</td><td style="width:90px;"><div style="height:6px;background:rgba(0,0,0,0.12);border-radius:3px;"><div style="width:${pct}%;height:100%;background:var(--seal);border-radius:3px;"></div></div></td></tr>`;
  }).join('');

  // Ожидают подсчёта: итог большинства ещё не подсчитан, но хотя бы одна команда уже ответила
  const pendingCount = state.events.filter(e=>{
    if(e.type === 'global') return !state.globalResults[e.id] && allRodNames.some(n=>state.rods[n].votes[e.id]);
    if(e.type === 'normal') return (e.choices || []).some(c=>c.majorityBonus) && !(state.majorityBonusResolved && state.majorityBonusResolved[e.id]) && allRodNames.some(n=>state.rods[n].answers[e.id]);
    return false;
  });
  const pendingRows = pendingCount.map(e=>{
    const answered = allRodNames.filter(n=> e.type === 'global' ? state.rods[n].votes[e.id] : state.rods[n].answers[e.id]).length;
    return `<div class="vote-row"><span>${e.title} · ответили ${answered} из ${allRodNames.length}</span><button class="btn-count-now" data-ev="${e.id}">Подсчитать сейчас</button></div>`;
  }).join('');

  const pacePendingHtml = `
    <div class="gm-panel" style="margin-bottom:12px;">
      <strong>Темп</strong>
      <table class="summary">
        <tr><th>Род</th><th>Ход</th><th></th></tr>
        ${paceRows || '<tr><td colspan="3" style="color:var(--ink-soft);padding:6px 0;">Ещё никто не присоединился</td></tr>'}
      </table>
    </div>
    ${pendingRows ? `<div class="gm-panel" style="margin-bottom:12px;"><strong>Ожидают подсчёта</strong><div class="vote-tally">${pendingRows}</div></div>` : ''}`;

  // Рассадка: по знатности, затем по крестьянам, затем по имени; сословие — кроме финала
  let seatingHtml = '';
  if(ev.type === 'assembly' && ev.seating){
    if(gmSeatingOpen[ev.id]){
      const seated = allRodNames.slice().sort((a,b)=>{
        const ra = state.rods[a].resources, rb = state.rods[b].resources;
        return (rb.slava - ra.slava) || (rb.krestyane - ra.krestyane) || a.localeCompare(b, 'ru');
      });
      const estLbl = {boyare:'боярский', dvoryane:'дворянский'};
      seatingHtml = `
        ${pendingCount.length ? `<p class="small-note" style="color:var(--danger);">Рейтинг может измениться после подсчёта</p>` : ''}
        <ol>${seated.map(n=>`<li>${escapeHtml(n)} — знатность ${state.rods[n].resources.slava}${ev.final ? '' : ` · ${estLbl[state.rods[n].estate] || 'дворянский'}`}</li>`).join('')}</ol>
        <button class="reveal-btn" id="btn-toggle-seating">Скрыть рассадку</button>`;
    } else {
      seatingHtml = `<button class="reveal-btn" id="btn-toggle-seating">Показать рассадку</button>`;
    }
  }

  let rightPanel = '';
  if(ev.type === 'narrative'){
    const passedN = allRodNames.filter(n=>(state.rods[n].progress||0) > state.currentIndex).length;
    const effB = fmtDelta(ev.effect || {});
    const effD = ev.effectByEstate && ev.effectByEstate.boyare ? fmtDelta(ev.effectByEstate.boyare) : '';
    const effW = ev.effectByEstate && ev.effectByEstate.dvoryane ? fmtDelta(ev.effectByEstate.dvoryane) : '';
    rightPanel = `
      <span class="era-badge">${ev.era || ''}</span><span class="type-badge normal">Хроника</span>
      <h2 class="event-title">${ev.title}</h2>
      <p class="event-desc">${ev.description}</p>
      ${effB ? `<p class="small-note">Всем: ${effB}</p>` : ''}
      ${effD ? `<p class="small-note">Бояре: ${effD}</p>` : ''}
      ${effW ? `<p class="small-note">Дворяне: ${effW}</p>` : ''}
      <p class="ui" style="font-size:13px;color:var(--ink-soft);">Прошли дальше: ${passedN} из ${allRodNames.length} родов</p>
    `;
  } else if(ev.type === 'assembly'){
    const evIdx = state.currentIndex;
    const reachedHere = allRodNames.filter(n=>(state.rods[n].progress||0) >= evIdx).length;
    const releasedHere = !!(state.releasedAssemblies && state.releasedAssemblies[ev.id]);
    rightPanel = `
      <span class="type-badge global">Очный собор</span>
      <h2 class="event-title">${ev.title}</h2>
      <p class="event-desc">${ev.description}</p>
      ${ev.seating ? `<p class="small-note">Нужна рассадка по рейтингу.</p>` : ''}
      <p class="ui" style="font-size:13px;color:var(--ink-soft);">Дошли: ${reachedHere} из ${allRodNames.length} родов${ev.final ? ' · финал' : (releasedHere ? ' · ворота открыты' : ' · ворота закрыты')}</p>
      ${seatingHtml}
    `;
  } else if(ev.type === 'normal'){
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
        : `<button class="reveal-btn" id="btn-reveal" style="background:transparent;color:var(--danger);border:2px solid var(--danger);">⚠️ Огласить досрочно</button>`
      }
    `;
  }

  return `
    <div class="rod-header">
      <span class="name">Панель организатора</span>
      <button id="btn-leave-gm">выйти</button>
    </div>
    <div class="timeline">${timeline}</div>
    ${gateHtml}
    ${pacePendingHtml}
    <div class="gm-grid">
      <div class="gm-panel">
        <div class="gm-nav">
          <button id="btn-prev" ${state.currentIndex===0?'disabled':''}>← пред.</button>
          <span class="pos ui">Событие ${state.currentIndex+1} / ${state.events.length}</span>
          <button id="btn-next" ${state.currentIndex===state.events.length-1?'disabled':''}>след. →</button>
        </div>
        ${sortTabs}
        <table class="summary">
          <tr><th>#</th><th>Род</th><th>Милость</th><th>Крест.</th><th>Золото</th></tr>
          ${summaryRows || '<tr><td colspan="5" style="color:var(--ink-soft);padding:10px 0;">Ещё никто не присоединился</td></tr>'}
        </table>
        <div id="history-slot"></div>
        ${rodsBlock}
        <div class="manual-adjust">
          <strong style="display:block;margin-bottom:6px;font-size:12px;">Ручная правка ресурсов</strong>
          <select id="adjust-rod">${rodNames.map(n=>`<option value="${n}">${n}</option>`).join('')}</select>
          <select id="adjust-resource">
            <option value="slava">Милость</option>
            <option value="zoloto">Золото</option>
            <option value="krestyane">Крестьяне (%)</option>
          </select>
          <input type="number" id="adjust-amount" placeholder="+/- число">
          <button id="btn-manual-adjust">Применить</button>
        </div>
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
      await dbSet('currentIndex', parseInt(item.dataset.jump, 10));
      busy = false;
    };
  });
  const rodsInput = document.getElementById('rods-input');
  if(rodsInput) rodsInput.oninput = ()=>{ gmRodsDraft = rodsInput.value; };
  const createRodsBtn = document.getElementById('btn-create-rods');
  if(createRodsBtn){
    createRodsBtn.onclick = async ()=>{
      if(busy) return;
      const errors = [];
      const failed = [];
      let created = 0;
      const toCreate = [];
      rodsInput.value.split('\n').forEach(raw=>{
        const line = raw.trim();
        if(!line) return;
        const fail = msg => { errors.push(`«${escapeHtml(line)}»: ${msg}`); failed.push(raw); };
        const ci = line.lastIndexOf(',');
        if(ci < 0) return fail('нужен формат «Имя, боярский» или «Имя, дворянский»');
        const name = line.slice(0, ci).trim();
        const word = line.slice(ci + 1).trim().toLowerCase();
        const estate = word === 'боярский' ? 'boyare' : (word === 'дворянский' ? 'dvoryane' : null);
        if(!name) return fail('не указано имя');
        if(!estate) return fail('сословие должно быть «боярский» или «дворянский»');
        if(/[.$#\[\]\/]/.test(name)) return fail('в имени нельзя использовать символы . $ # [ ] /');
        if(Object.prototype.hasOwnProperty.call(state.rods, name)) return fail('такой род уже есть');
        toCreate.push({name, estate});
      });
      busy = true;
      // Каждый род пишется отдельным путём rods/<имя> транзакцией «только если ещё нет»
      for(const r of toCreate){
        if(await ensureRod(r.name, r.estate)) created++;
        else { errors.push(`«${escapeHtml(r.name)}»: такой род уже есть`); failed.push(r.name + ', ' + (r.estate === 'boyare' ? 'боярский' : 'дворянский')); }
      }
      gmRodsDraft = failed.join('\n');
      gmRodsMsg = errors.join('<br>');
      render();
      busy = false;
    };
  }
  document.querySelectorAll('.btn-del-rod').forEach(btn=>{
    btn.onclick = async ()=>{
      if(busy) return;
      const name = Object.keys(state.rods)[parseInt(btn.dataset.idx, 10)];
      if(!name || !canDeleteRod(state.rods[name])) return;
      if(!confirm(`Удалить род «${name}»?`)) return;
      busy = true;
      // Удаляется только путь rods/<имя>, и только если род всё ещё нетронут (проверка внутри транзакции)
      await dbTx('rods/' + name, cur => (cur && canDeleteRod(patchRod(cur))) ? null : undefined);
      busy = false;
    };
  });
  document.querySelectorAll('.btn-count-now').forEach(btn=>{
    btn.onclick = async ()=>{
      if(busy) return;
      const evx = state.events.find(e => e.id === btn.dataset.ev);
      if(!evx) return;
      busy = true;
      // Повторный подсчёт запрещён: если запись об итоге уже есть, эффекты не применяются заново
      if(evx.type === 'global') await resolveGlobalEvent(evx);
      else if(evx.type === 'normal') await resolveMajorityBonus(evx);
      busy = false;
    };
  });
  const seatingBtn = document.getElementById('btn-toggle-seating');
  if(seatingBtn){
    seatingBtn.onclick = ()=>{
      const cur = state.events[state.currentIndex];
      gmSeatingOpen[cur.id] = !gmSeatingOpen[cur.id];
      render();
    };
  }
  const releaseBtn = document.getElementById('btn-release-assembly');
  if(releaseBtn){
    releaseBtn.onclick = async ()=>{
      if(busy) return;
      const gIdx = state.events.findIndex(e => e.id === releaseBtn.dataset.ev);
      const names = Object.keys(state.rods);
      const reached = names.filter(n=>(state.rods[n].progress||0) >= gIdx).length;
      if(reached < names.length && !confirm(`Дошли только ${reached} из ${names.length} команд. Открыть следующий раунд всё равно?`)) return;
      busy = true;
      await dbSet('releasedAssemblies/' + releaseBtn.dataset.ev, true);
      busy = false;
    };
  }
  document.getElementById('btn-prev').onclick = async ()=>{
    if(busy || state.currentIndex<=0) return;
    busy = true;
    await dbSet('currentIndex', state.currentIndex - 1); busy = false;
  };
  document.getElementById('btn-next').onclick = async ()=>{
    if(busy || state.currentIndex>=state.events.length-1) return;
    busy = true;
    await dbSet('currentIndex', state.currentIndex + 1); busy = false;
  };
  const revealBtn = document.getElementById('btn-reveal');
  if(revealBtn){
    revealBtn.onclick = async ()=>{
      if(busy) return;
      if(!confirm('Огласить итоги досрочно, не дожидаясь голосов всех родов? Это форс-оверрайд обычного автоматического оглашения, отменить будет нельзя.')) return;
      busy = true;
      const ev = state.events[state.currentIndex];
      await resolveGlobalEvent(ev);
      busy = false;
    };
  }
  document.getElementById('btn-reset').onclick = async ()=>{
    if(!confirm('Сбросить всю игру и ресурсы всех родов?')) return;
    busy = true;
    // Сброс — единственное место, где организатор пишет состояние целиком (пустое)
    try { await stateRef.set(initialState()); storageError = null; } catch(e){ dbFail(e); }
    busy = false;
  };
  const adjustBtn = document.getElementById('btn-manual-adjust');
  if(adjustBtn){
    adjustBtn.onclick = async ()=>{
      if(busy) return;
      const rodName = document.getElementById('adjust-rod').value;
      const resource = document.getElementById('adjust-resource').value;
      const amount = parseInt(document.getElementById('adjust-amount').value, 10);
      if(!rodName || isNaN(amount) || amount === 0) return;
      busy = true;
      await txResources(rodName, res => applyEffect(res, {[resource]: amount}));
      busy = false;
    };
  }
  const resolveBtn = document.getElementById('btn-resolve-auction');
  if(resolveBtn){
    resolveBtn.onclick = async ()=>{
      if(busy) return;
      busy = true;
      const ev = state.events[state.currentIndex];
      // Раунд считается транзакцией по актуальным ставкам; победителю титул пишется отдельным путём
      let winnerName = null;
      const r = await dbTx('auctions/' + ev.id, cur => {
        const base = patchAuction(cur || {round:1, bids:{}, tiedRods:null, winner:null});
        if(base.winner) return undefined;
        const res = computeAuctionRound(base, Object.keys(state.rods), ev);
        winnerName = res.winnerName;
        return res.auction;
      });
      if(r.committed && winnerName) await dbSet(`rods/${winnerName}/titles/${ev.titleKey}`, ev.titleName);
      busy = false;
    };
  }
  document.querySelectorAll('.rod-row').forEach(row=>{
    row.onclick = ()=>{
      const name = row.dataset.rod;
      const slot = document.getElementById('history-slot');
      const rod = state.rods[name];
      const items = state.events.map(ev=>{
        if(ev.type==='assembly' || ev.type==='narrative') return ''; // у них нет выбора
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
