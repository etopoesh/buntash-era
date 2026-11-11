function landingScreen(){
  return `
  <button class="gm-tiny-link" id="btn-gm">вход для организатора</button>
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

function escapeHtml(t){
  return String(t).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// Блок «Хозяйство за ход» + строки наград за знатность. resources — ресурсы, по которым считается прикидка;
// rod и turn — чьи прибавки к доходу и тик какого хода имеется в виду (R4/R6).
function turnSummaryHtml(resources, estate, rod, turn){
  const t = computeEconomyTick(resources, estate, state.national, activeIncomeMods(rod, turn));
  const lines = [];
  if(t.fleeCentralPct) lines.push(`Бегство из-за низкой централизации: −${t.fleeCentralPct}%`);
  if(t.fleeStabilityPct) lines.push(`Бегство из-за низкой стабильности: −${t.fleeStabilityPct}%`);
  if(t.fleeCentralPct || t.fleeStabilityPct) lines.push(t.krestyaneDelta < 0 ? `Крестьяне: ≈ −${-t.krestyaneDelta}` : 'Крестьяне: ≈ 0');
  lines.push(`Золото: +${t.zolotoDelta}`);
  const rewards = pendingMilestones(currentRodObject(), resources.slava)
    .map(m => `<div class="effect-line pos">Знатность: вам жалуют землю с крестьянами, +${m.krestyane}</div>`).join('');
  return `
    <div class="outcome-box">
      <strong style="font-size:12px;">Хозяйство за ход</strong> <span class="small-note">по текущим данным</span>
      ${lines.map(l => `<div>${l}</div>`).join('')}
      ${rewards}
    </div>`;
}
function currentRodObject(){ return state.rods[currentRod]; }

function rodJoinScreen(){
  const names = Object.keys(state.rods);
  const estateLabel = {boyare:'боярский', dvoryane:'дворянский'};
  const list = names.length
    ? `<div class="chip-row" id="chip-row">${names.map((n,i)=>`<button class="chip" data-idx="${i}">${escapeHtml(n)} · ${estateLabel[state.rods[n].estate] || 'дворянский'}</button>`).join('')}</div>`
    : `<p class="small-note">Организатор ещё не создал рода</p>`;
  return `
  <div class="center-screen">
    <div class="landing-card">
      <div class="crest">Р</div>
      <h1 class="title" style="font-size:22px;">Выберите свой род</h1>
      ${list}
      <div class="top-link" id="btn-back-landing" style="margin-top:14px;">← назад</div>
    </div>
  </div>`;
}
function bindRodJoin(){
  const chipRow = document.getElementById('chip-row');
  if(chipRow){
    const names = Object.keys(state.rods);
    chipRow.querySelectorAll('.chip').forEach(btn=>{
      btn.onclick = ()=>{ currentRod = names[parseInt(btn.dataset.idx, 10)]; render(); };
    });
  }
  document.getElementById('btn-back-landing').onclick = ()=>{ role=null; render(); };
}

function rodScreen(){
  const rod = state.rods[currentRod];
  const idx = Math.min(rod.progress || 0, state.events.length - 1);
  const ev = state.events[idx];
  const res = rod.resources;
  const nat = state.national || {stability: 0, centralization: 0};
  const isLast = idx >= state.events.length - 1;
  const nextBtnHtml = isLast
    ? `<div class="event-card">
        <span class="type-badge global">Игра завершена</span>
        <h2 class="event-title">Созывается Земский собор</h2>
        <div class="outcome-box">
          <div class="otitle">Приглашение получено</div>
          <div class="otext">Династия Рюриковичей пресеклась. Борис Годунов созывает знатные рода на Земский собор — решать судьбу престола. Отложите планшеты: дальнейшее решится вживую, лицом к лицу.</div>
        </div>
      </div>`
    : `<button class="choice-btn" id="btn-next-event">Далее →</button>`;

  const titleBadges = Object.values(rod.titles||{}).map(t=>`<span class="title-badge">${t}</span>`).join('');
  const header = `
    <div class="rod-header">
      <span class="name">${rod.estate === 'boyare' ? 'Боярский' : 'Дворянский'} род «${currentRod}» ${titleBadges}</span>
      <button id="btn-leave">перейти к выбору рода</button>
    </div>
    <div class="resource-bar">
      <div class="res-pill"><div class="val">${res.slava}</div><div class="lab">Знатность</div></div>
      <div class="res-pill"><div class="val">${res.zoloto}</div><div class="lab">Золото</div></div>
      <div class="res-pill"><div class="val">${res.krestyane}</div><div class="lab">Крестьяне</div></div>
      <div class="res-pill"><div class="val">${Math.floor(res.krestyane/20)}</div><div class="lab">Дружина</div></div>
    </div>
    <div class="resource-bar national-bar">
      <div class="res-pill"><div class="val">${nat.centralization}</div><div class="lab">Централизация</div></div>
      <div class="res-pill"><div class="val">${nat.stability}</div><div class="lab">Стабильность державы</div></div>
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
          ${out.nationalEffect ? fmtNationalDelta(out.nationalEffect) : ''}
        </div>
        <button class="choice-btn" id="btn-ack-reveal" data-ev="${pendingEv.id}">Понятно</button>
      </div>`;
  }

  // Бонусы по прибытии — объект или массив объектов; показываются все сработавшие по флагам и ещё не показанные
  let arrivalBonusBanner = '';
  getArrivalBonuses(ev).forEach((bonus, i)=>{
    const key = arrivalBonusKey(ev, i);
    if(bonus && bonus.requiresFlag && rod.flags && rod.flags[bonus.requiresFlag] && !rod.seenArrivalBonus[key]){
      arrivalBonusBanner += `
      <div class="event-card">
        <span class="type-badge global">Особое обстоятельство</span>
        <h2 class="event-title">${bonus.title || ev.title}</h2>
        <div class="outcome-box">
          <div class="otext">${bonus.narrative || ''}</div>
          ${fmtDelta(bonus.effect)}
        </div>
        <button class="choice-btn btn-ack-arrival" data-ev="${ev.id}" data-idx="${i}">Понятно</button>
      </div>`;
    }
  });

  // Панель истории — что род уже выбирал раньше и к чему это привело (без слухов, с датами)
  const historyToggle = `<button class="top-link" id="btn-toggle-history">${showHistory ? 'Скрыть историю ▲' : 'История ▼'}</button>`;
  let historyPanel = '';
  if(showHistory){
    const items = state.events.slice(0, idx).filter(e=>e.type !== 'assembly' && e.type !== 'narrative').map(e=>{
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

  // Строка о роде на событии с showRodCard: true (вместо прежнего стартового окна)
  const rodCardLine = ev.showRodCard
    ? `<p class="event-desc">Ваш род — <strong>${currentRod}</strong>, ${rod.estate === 'boyare' ? 'боярский' : 'дворянский'}.</p>`
    : '';

  // Вводная по сословию на первом соборе (ТЗ 20 §2): род видит только свой блок, чужой не показывается
  const estateIntro = ev.introByEstate && ev.introByEstate[rod.estate]
    ? `<div class="outcome-box">
        <div class="otitle">${ev.introByEstate[rod.estate].title || ''}</div>
        <div class="otext">${ev.introByEstate[rod.estate].text || ''}</div>
      </div>`
    : '';

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
  if(ev.type === 'assembly'){
    // Очный собор: ворота между раундами. Род стоит, пока организатор не откроет их (state.releasedAssemblies).
    const released = !!(state.releasedAssemblies && state.releasedAssemblies[ev.id]);
    let assemblyAction;
    if(ev.final) assemblyAction = `<p class="small-note">Игра завершена</p>`;
    else if(released) assemblyAction = `<button class="choice-btn" id="btn-next-event">Далее →</button>`;
    else assemblyAction = `<p class="small-note">Ждите указаний организатора</p>`;
    body = `
      <div class="event-card">
        <span class="type-badge global">Очный собор</span>
        <h2 class="event-title">${ev.title}</h2>
        <p class="event-desc">${ev.description}</p>
        ${rodCardLine}
        ${estateIntro}
        ${assemblyAction}
      </div>`;
  } else if(ev.type === 'narrative'){
    // Событие без выбора: эффект применяется по клику «Далее →» (см. bindRodScreen)
    const branch = findConditionalEffect(ev, rod);
    const eff = resolveEffect(ev, rod); // общий + сословие + условная ветка (опричники/земцы на ходе 17)
    // Военная ветка (опричники на ходе 17): расчёт по душам на момент показа, с накопленными снижениями потерь
    const mil = branch && branch.military ? computeMilitary(rod.resources.krestyane, branch.military, rod.casualtyReduction ? [rod.casualtyReduction] : []) : null;
    const effShown = Object.assign({}, eff);
    if(mil){
      for(const k in mil.scaleEffect) effShown[k] = (effShown[k] || 0) + mil.scaleEffect[k];
      if(mil.lost) effShown.krestyane = (effShown.krestyane || 0) - mil.lost;
    }
    const narrativeEffect = fmtDelta(effShown);
    const afterNarrative = applyEffect(rod.resources, effShown); // эффект события для прикидки уже учтён
    body = `
      <div class="event-card">
        <span class="era-badge">${ev.era || ''}</span><span class="type-badge normal">Хроника</span>
        <h2 class="event-title">${ev.title}</h2>
        <p class="event-desc">${ev.description}</p>
        ${branch && branch.text ? `<div class="outcome-box"><div class="otext">${branch.text}</div></div>` : ''}
        ${narrativeEffect ? `<div class="outcome-box">${narrativeEffect}</div>` : ''}
        ${mil ? `<div class="outcome-box"><div class="effect-line">Боевые холопы: выставлено ${mil.fielded}, погибло ${mil.lost}</div></div>` : ''}
        ${rodCardLine}
        ${turnSummaryHtml(afterNarrative, rod.estate, rod, ev.turn)}
        ${nextBtnHtml}
      </div>`;
  } else if(ev.type === 'auction'){
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
          ${turnSummaryHtml(rod.resources, rod.estate, rod, ev.turn)}
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
      const availableChoices = ev.choices.filter(c=>!c.requiresEstate || c.requiresEstate === rod.estate);
      body = `
        <div class="event-card">
          <span class="era-badge">${ev.era}</span><span class="type-badge ${typeClass}">${typeLabel}</span>
          <h2 class="event-title">${ev.title}</h2>
          <p class="event-desc">${ev.description}</p>
          ${rodCardLine}
          ${ev.choices.some(c=>c.druzhinaTiers) ? `<p class="event-desc">Ваша дружина: <strong>${druzhinaOf(rod.resources)}</strong></p>` : ''}
          ${availableChoices.map(c=>`<button class="choice-btn" data-key="${c.key}">${c.label}</button>`).join('')}
        </div>`;
    } else {
      const choice = ev.choices.find(c=>c.key===answered.choiceKey);
      const waitNote = ev.type === 'global' ? `<p class="small-note">Итоги этого решения придут позже, на Земском соборе.</p>` : '';
      if(ev.type === 'global'){
        // У выбора global-события нет outcomeTitle/outcomeText/effect по дизайну (итог решает resolveGlobalEvent
        // после Земского собора) — поэтому для него нет outcome-box, только факт принятия решения.
        body = `
          <div class="event-card">
            <span class="era-badge">${ev.era}</span><span class="type-badge ${typeClass}">${typeLabel}</span>
            <h2 class="event-title">${ev.title}</h2>
            <p class="event-desc" style="opacity:0.75">Ваш выбор: ${choice ? choice.label : ''}</p>
            ${turnSummaryHtml(rod.resources, rod.estate, rod, ev.turn)}
            ${waitNote}
            ${nextBtnHtml}
          </div>`;
      } else {
        // Снимок исхода записан в момент клика (ТЗ 1.1, R7/R8): чистые тексты и готовые числа,
        // посчитанные по ресурсам до выбора. Старые сохранения без снимка — лучшая попытка по текущим ресурсам.
        const snap = answered.outcome;
        const title = snap && snap.title !== undefined ? snap.title : choice.outcomeTitle;
        const text = snap && snap.text !== undefined ? snap.text : choice.outcomeText;
        const estateText = snap ? (snap.estateText || '') : '';
        const deltas = snap ? snap.deltas : resolveEffect(choice, rod, answered.druzhina);
        const mil = snap && snap.military;
        const inc = snap && snap.income;
        body = `
          <div class="event-card">
            <span class="era-badge">${ev.era}</span><span class="type-badge ${typeClass}">${typeLabel}</span>
            <h2 class="event-title">${ev.title}</h2>
            <p class="event-desc" style="opacity:0.75">Ваш выбор: ${choice ? choice.label : ''}</p>
            <div class="outcome-box">
              <div class="otitle">${title}</div>
              <div class="otext">${text}</div>
              ${estateText ? `<div class="otext">${estateText}</div>` : ''}
              ${fmtDelta(deltas)}
              ${mil ? `<div class="effect-line">Боевые холопы: выставлено ${mil.fielded}, погибло ${mil.lost}</div>` : ''}
              ${inc ? `<div class="effect-line pos">Доход: +${inc.amount} в ход</div>` : ''}
            </div>
            ${turnSummaryHtml(rod.resources, rod.estate, rod, ev.turn)}
            ${waitNote}
            ${nextBtnHtml}
          </div>`;
      }
    }
  }

  return `${header}${historyToggle}${historyPanel}${revealBanner}${arrivalBonusBanner}${body}`;
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
      await dbSet(`rods/${currentRod}/seenRumors/${rumorBtn.dataset.ev}`, true);
      busy = false;
    };
    return; // на экране слухов больше нечего привязывать
  }

  document.querySelectorAll('[data-key]').forEach(btn=>{
    btn.onclick = async ()=>{
      if(busy) return;
      busy = true;
      const rodName = currentRod;
      const choice = ev.choices.find(c=>c.key===btn.dataset.key);
      // R7/R8: все формулы — по ресурсам на момент клика, до любых изменений этим выбором
      const res0 = rod.resources;
      const druzhina = druzhinaOf(res0);
      const eff = choice.effect || {};
      // Сословный эффект — плоский объект: {slava/krestyane/zoloto, text?, income?} (см. vec estateMerge)
      const estateObj = choice.effectByEstate && choice.effectByEstate[rod.estate];
      // Прибавка к доходу может быть общей (effect.income) или сословной (effectByEstate[сословие].income)
      const incSpec = eff.income || (estateObj && estateObj.income) || null;
      // Посул: от знатности до выбора (R7)
      const bribePaid = eff.bribe !== undefined ? bribeCost(eff.bribe, res0.slava) : 0;
      // Военный расчёт (R9): от душ до выбора, со снижениями потерь, накопленными родом ранее
      const reductions = rod.casualtyReduction ? [rod.casualtyReduction] : [];
      const mil = choice.military ? computeMilitary(res0.krestyane, choice.military, reductions) : null;
      // Флаги, которые ставит выбор, — сразу видны условным эффектам
      const flagsAfter = Object.assign({}, rod.flags);
      (choice.setFlags || []).forEach(flag => { flagsAfter[flag] = true; });
      const rodForConds = {flags: flagsAfter, estate: rod.estate, resources: res0};
      // Слияние (R8): общий эффект + эффект сословия + условная добавка + военные эффекты + посул — один раз
      let combined = resolveEffect(choice, rodForConds, druzhina);
      if(mil){
        for(const k in mil.scaleEffect) combined[k] = (combined[k] || 0) + mil.scaleEffect[k];
        if(mil.lost) combined.krestyane = (combined.krestyane || 0) - mil.lost;
      }
      if(bribePaid) combined.zoloto = (combined.zoloto || 0) - bribePaid;
      // Снимок исхода (ТЗ 1.1): только чистые тексты и готовые числа, без формул и механики
      const ce = findConditionalEffect(choice, rodForConds);
      let estateText = estateObj && estateObj.text ? estateObj.text : '';
      if(ce && ce.text) estateText = estateText ? estateText + ' ' + ce.text : ce.text;
      const answerRecord = {
        choiceKey: choice.key,
        outcome: {
          title: ce && ce.outcomeTextOverride ? (ce.outcomeTitleOverride || choice.outcomeTitle) : choice.outcomeTitle,
          text: ce && ce.outcomeTextOverride ? ce.outcomeTextOverride : choice.outcomeText,
          estateText: estateText,
          deltas: combined,
          ...(mil ? {military: {due: mil.due, fielded: mil.fielded, lost: mil.lost}} : {}),
          ...(incSpec ? {income: {amount: incSpec.amount, ...(incSpec.until !== undefined ? {until: incSpec.until} : {})}} : {})
        }
      };
      // Ответ ставится транзакцией «только если ещё нет»: с двух устройств одного рода эффект применится один раз
      const claimed = await dbClaim(`rods/${rodName}/answers/${ev.id}`, answerRecord);
      if(claimed){
        const updates = {};
        if(ev.type !== 'normal') updates[`rods/${rodName}/votes/${ev.id}`] = choice.key;
        (choice.setFlags || []).forEach(flag => {
          updates[`rods/${rodName}/flags/${flag}`] = true;
        });
        if(Object.keys(updates).length) await dbUpdate(updates);
        // Все эффекты применяются один раз; пол душ — внутри applyEffect (R8)
        await txResources(rodName, res => applyEffect(res, combined));
        // Постоянная прибавка к доходу / отмена (R6): одинаковый ключ перезаписывает, отмена убирает сразу
        if(incSpec) await dbSet(`rods/${rodName}/incomeMods/${incSpec.key}`, {amount: incSpec.amount, ...(incSpec.until !== undefined ? {until: incSpec.until} : {})});
        if(eff.incomeEnd){
          const ends = Array.isArray(eff.incomeEnd) ? eff.incomeEnd : [eff.incomeEnd];
          for(const k of ends) await dbSet(`rods/${rodName}/incomeMods/${k}`, null);
        }
        // Снижение потерь на будущее накапливается (для последующих военных ходов)
        if(eff.casualtyReduction) await dbTx(`rods/${rodName}/casualtyReduction`, cur => (cur || 0) + eff.casualtyReduction);
        if(choice.hiddenFavor){
          await dbTx(`rods/${rodName}/favor/${choice.hiddenFavor.track}`, cur => (cur || 0) + choice.hiddenFavor.value);
        }
      }
      busy = false;
    };
  });
  const ackBtn = document.getElementById('btn-ack-reveal');
  if(ackBtn){
    ackBtn.onclick = async ()=>{
      if(busy) return;
      busy = true;
      await dbSet(`rods/${currentRod}/seenReveal/${ackBtn.dataset.ev}`, true);
      busy = false;
    };
  }
  document.querySelectorAll('.btn-ack-arrival').forEach(ackArrivalBtn=>{
    ackArrivalBtn.onclick = async ()=>{
      if(busy) return;
      busy = true;
      const rodName = currentRod;
      const arrivalEv = state.events.find(e => e.id === ackArrivalBtn.dataset.ev);
      const idxB = parseInt(ackArrivalBtn.dataset.idx, 10);
      const bonus = getArrivalBonuses(arrivalEv)[idxB];
      const key = arrivalBonusKey(arrivalEv, idxB);
      // Бонус выдаётся ровно один раз: метка «показано» ставится транзакцией «только если ещё нет»
      if(bonus && await dbClaim(`rods/${rodName}/seenArrivalBonus/${key}`, true)){
        const bonusEffect = bonus.effect || {};
        await txResources(rodName, res => applyEffect(res, bonusEffect));
      }
      busy = false;
    };
  });
  const bidBtn = document.getElementById('btn-submit-bid');
  if(bidBtn){
    bidBtn.onclick = async ()=>{
      if(busy) return;
      const input = document.getElementById('bid-input');
      let amount = parseInt(input.value, 10);
      if(isNaN(amount) || amount <= 0){ alert('Введите сумму ставки больше нуля'); return; }
      if(amount > rod.resources.zoloto) amount = rod.resources.zoloto;
      busy = true;
      const rodName = currentRod;
      // Ставка пишется в свой ключ аукциона один раз; золото списывается транзакцией
      if(await dbClaim(`auctions/${ev.id}/bids/${rodName}`, amount)){
        await txResources(rodName, res => applyEffect(res, {zoloto: -amount}));
      }
      busy = false;
    };
  }
  const nextBtn = document.getElementById('btn-next-event');
  if(nextBtn){
    nextBtn.onclick = async ()=>{
      if(busy) return;
      const leavingAssembly = ev.type === 'assembly';
      // С assembly-события не уйти, пока организатор не открыл ворота; финальное не покидается вовсе
      if(leavingAssembly && (ev.final || !(state.releasedAssemblies && state.releasedAssemblies[ev.id]))) return;
      busy = true;
      const rodName = currentRod;
      const fromIdx = idx;
      if(fromIdx < state.events.length - 1){
        // Переход — транзакция по progress: «Далее →» с двух устройств одного рода не пройдёт дважды
        const step = await dbTx(`rods/${rodName}/progress`, cur => (cur === null ? 0 : cur) === fromIdx ? fromIdx + 1 : undefined);
        // Уход с assembly — не игровой ход: ни тика, ни наград
        if(step.committed && !leavingAssembly){
          const isNarrative = ev.type === 'narrative';
          // Мировой эффект narrative-события (стабильность/централизация) — один раз на всю игру (R14)
          if(isNarrative && ev.nationalEffect){
            if(await dbClaim('nationalEffects/' + ev.id, true)) await txNational(ev.nationalEffect);
          }
          // Отмена прибавок к доходу (R6): снимаются до тика этого же хода, в БД — навсегда
          if(isNarrative && ev.incomeEnd){
            const ends = Array.isArray(ev.incomeEnd) ? ev.incomeEnd : [ev.incomeEnd];
            for(const k of ends) await dbSet(`rods/${rodName}/incomeMods/${k}`, null);
          }
          // 1) эффект narrative-события, 2) тик экономики хода ev.turn — одной транзакцией по актуальным ресурсам.
          // Прибавки к доходу берутся из локальной копии без отменённых ключей, чтобы тик этого хода их уже не считал.
          const applied = await txResources(rodName, res => {
            const modsNow = Object.assign({}, rod.incomeMods);
            if(isNarrative && ev.incomeEnd){
              (Array.isArray(ev.incomeEnd) ? ev.incomeEnd : [ev.incomeEnd]).forEach(k => delete modsNow[k]);
            }
            let res2 = res;
            if(isNarrative){
              const eff = resolveEffect(ev, rod);
              // Военная ветка narrative-события (опричники на ходе 17): расчёт по душам на момент применения (R9)
              const branch = findConditionalEffect(ev, rod);
              if(branch && branch.military){
                const mil = computeMilitary(res.krestyane, branch.military, rod.casualtyReduction ? [rod.casualtyReduction] : []);
                for(const k in mil.scaleEffect) eff[k] = (eff[k] || 0) + mil.scaleEffect[k];
                if(mil.lost) eff.krestyane = (eff.krestyane || 0) - mil.lost;
              }
              res2 = applyEffect(res2, eff);
            }
            const shim = {resources: res2, estate: rod.estate, incomeMods: modsNow};
            applyEconomyTick(shim, ev.turn);
            return shim.resources;
          });
          // 3) награды за пересечённые пороги знатности: каждый порог выдаётся один раз (метка ставится транзакцией)
          const slavaNow = applied.value ? applied.value.slava : rod.resources.slava;
          let reward = 0;
          for(const m of pendingMilestones(rod, slavaNow)){
            if(await dbClaim(`rods/${rodName}/seenMilestones/${m.threshold}`, true)) reward += m.krestyane;
          }
          if(reward) await txResources(rodName, res => ({...res, krestyane: res.krestyane + reward}));
        }
      }
      busy = false;
    };
  }
}
