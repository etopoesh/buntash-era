// ТЗ 22: состояние экранов построек (окно «Постройки», подтверждение, результат, детальная карточка, «Усадьба»)
let buildPhase = 'choose'; // 'choose' | 'confirm' | 'result' | 'skip'
let buildConfirmingId = null;
let buildResultInfo = null;
let buildSelId = null;
let buildCat = null;
let buildEventId = null;
let detailSource = null; // 'window' | 'estate'
let detailBuildingId = null;
let estateOpen = false;

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

// ТЗ 22: закрытие детальной карточки по клавише Esc
document.addEventListener('keydown', e => {
  if(e.key === 'Escape' && detailBuildingId){
    closeBuildDetail();
  }
});

function escapeHtml(t){
  return String(t).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ТЗ 22: закрытие детальной карточки
function closeBuildDetail(){
  detailBuildingId = null;
  detailSource = null;
  render();
}

// Блок «Хозяйство за ход» + строки наград за знатность. resources — ресурсы, по которым считается прикидка;
// rod и turn — чьи прибавки к доходу и тик какого хода имеется в виду (R4/R6).
function turnSummaryHtml(resources, estate, rod, turn){
  const t = computeEconomyTick(resources, estate, state.national, activeIncomeMods(rod, turn), fleeReductionOf(rod));
  const lines = [];
  if(t.fleeCentralPct) lines.push(`Бегство из-за низкой централизации: −${t.fleeCentralPct}%`);
  if(t.fleeStabilityPct) lines.push(`Бегство из-за низкой стабильности: −${t.fleeStabilityPct}%`);
  if(t.fleeCentralPct || t.fleeStabilityPct) lines.push(t.krestyaneDelta < 0 ? `Крестьяне: ≈ −${-t.krestyaneDelta}` : 'Крестьяне: ≈ 0');
  lines.push(`Рубли: +${t.zolotoDelta}`);
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
        <h2 class="event-title">${ev.title}</h2>
        <div class="outcome-box">
          <div class="otitle">Итоги подсчёта</div>
          <div class="otext">${ev.description}</div>
        </div>
      </div>`
    : `<button class="choice-btn" id="btn-next-event">Далее →</button>`;

  const titleBadges = Object.values(rod.titles||{}).map(t=>`<span class="title-badge">${t}</span>`).join('');
  const header = `
    <div class="rod-header">
      <span class="name">${rod.estate === 'boyare' ? 'Боярский' : 'Дворянский'} род «${currentRod}» ${titleBadges}</span>
      <button id="btn-estate">Усадьба <span class="build-count">${builtCountOf(rod)}</span></button>
      <button id="btn-leave">перейти к выбору рода</button>
    </div>
    <div class="resource-bar">
      <div class="res-pill"><div class="val">${res.slava}</div><div class="lab">Знатность</div></div>
      <div class="res-pill"><div class="val">${res.zoloto}</div><div class="lab">Рубли</div></div>
      <div class="res-pill"><div class="val">${res.krestyane}</div><div class="lab">Крестьяне</div></div>
      <div class="res-pill"><div class="val">${Math.floor(res.krestyane/20)}</div><div class="lab">Боевые холопы</div></div>
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

  // ТЗ 22: окно «Постройки» — появляется перед слухами и содержимым хода, один раз на событие.
  // Пока окно не решено (rod.buildWindows[ev.id] нет), оно показывается вместо содержимого хода.
  if(buildPhase === 'confirm'){
    return `${header}${renderBuildConfirm(rod)}`;
  }
  if(buildPhase === 'result'){
    return `${header}${renderBuildResult()}`;
  }
  if(buildPhase === 'skip'){
    return `${header}${renderBuildWindowHtml(rod, ev)}`;
  }
  if(ev.buildWindow && state.buildings && buildPhase === 'choose' && rod.buildWindows && rod.buildWindows[ev.id] === undefined){
    buildEventId = ev.id;
    return `${header}${historyToggle}${historyPanel}${renderBuildWindowHtml(rod, ev)}`;
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
            <div class="waiting-box">Ставка принята: ${auction.bids[currentRod]} рублей. Ждите оглашения итогов.</div>
          </div>`;
      } else {
        body = `
          <div class="event-card">
            <span class="era-badge">${ev.era}</span><span class="type-badge auction">Торги за титул</span>
            <h2 class="event-title">${ev.title}</h2>
            <p class="event-desc">${ev.description}</p>
            ${auction.round > 1 ? `<p class="small-note">Второй раунд: ваша ставка сравнялась с другим родом. Новая ставка — из оставшихся рублей.</p>` : ''}
            <div class="bid-row">
              <input type="number" id="bid-input" min="0" max="${res.zoloto}" placeholder="Рублей (макс. ${res.zoloto})">
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
          ${ev.choices.some(c=>c.druzhinaTiers) ? `<p class="event-desc">Ваши боевые холопы: <strong>${druzhinaOf(rod.resources)}</strong></p>` : ''}
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
              ${inc ? `<div class="effect-line ${inc.amount > 0 ? 'pos' : 'neg'}">${inc.amount > 0 ? 'Увеличение дохода' : 'Уменьшение дохода'}: ${inc.amount > 0 ? '+' : '-'}${Math.abs(inc.amount)} в ход</div>` : ''}
            </div>
            ${turnSummaryHtml(rod.resources, rod.estate, rod, ev.turn)}
            ${waitNote}
            ${nextBtnHtml}
          </div>`;
      }
    }
  }

  let out = `${header}${historyToggle}${historyPanel}${revealBanner}${arrivalBonusBanner}${body}`;
  if(estateOpen) out += renderEstateOverlay(rod);
  if(detailBuildingId) out += renderBuildDetail(rod);
  return out;
}

// ---------------------------------------------------------------------------
// ТЗ 22: окно «Постройки» (Что построить) и экран «Ваша усадьба».
// ---------------------------------------------------------------------------
function buildCardHtml(b, rod, ctx){
  const built = rod.buildings || {};
  const count = built[b.id] || 0;
  const alreadyBuilt = b.maxCount === 1 ? count >= 1 : (b.maxCount !== null && b.maxCount !== undefined && count >= b.maxCount);
  const price = b.price || 0;
  const gold = rod.resources.zoloto || 0;
  const insufficient = gold < price;
  const selMismatch = !!(ctx.selId) && ctx.selId !== b.id;
  const disabled = alreadyBuilt || insufficient || selMismatch;
  const label = alreadyBuilt ? 'Построено' : selMismatch ? 'Выбор сделан' : (insufficient ? `Не хватает ${price - gold} руб.` : 'Построить');
  const img = `<div class="build-card-img"><img src="${b.image}" alt="${b.name}" onerror="this.parentNode.classList.add('missing')"><div class="build-card-fallback">${b.emoji}</div></div>`;
  const pills = (b.bonusText || []).map(t => `<span class="build-bonus">${t}</span>`);
  if(b.oneTime) pills.push('<span class="build-bonus">Единоразово</span>');
  const btn = alreadyBuilt
    ? `<div class="build-ribbon">Построено</div>`
    : `<button class="build-btn" data-bid="${b.id}" ${disabled ? 'disabled' : ''}>${label}</button>`;
  const cls = 'build-card' + (disabled ? ' build-card-disabled' : '') + (alreadyBuilt ? ' build-card-built' : '');
  return `<div class="${cls}" data-bid="${b.id}">
    ${img}
    <div class="build-card-name">${b.name}</div>
    <div class="build-bonus-row">${pills.join('')}</div>
    <div class="build-short">${b.short || ''}</div>
    <div class="build-price ${insufficient ? 'low' : ''}">${price} руб.</div>
    ${btn}
  </div>`;
}

function renderBuildWindowHtml(rod, ev){
  const buildings = buildingsList();
  const cats = (state.buildings && Array.isArray(state.buildings.categories)) ? state.buildings.categories : [];
  const gold = rod.resources.zoloto || 0;
  const wide = (typeof window !== 'undefined') && typeof window.matchMedia === 'function' && window.matchMedia('(min-width: 1100px)').matches;
  const phase = buildPhase;
  const selId = buildSelId || buildConfirmingId;

  if(phase === 'skip'){
    return `<div class="build-window event-card">
      <span class="era-badge">${ev.era || ''}</span>
      <h2 class="build-title">Ваша усадьба: что построить</h2>
      <div class="outcome-box"><div class="otitle">Окно закрыто</div><div class="otext">Построек на этот ход не было.</div></div>
      <button class="choice-btn" id="btn-build-continue">Продолжить</button>
    </div>`;
  }
  if(phase === 'result'){
    const info = buildResultInfo || {};
    const lines = info.lines || [];
    return `<div class="build-window event-card">
      <span class="era-badge">${ev.era || ''}</span>
      <h2 class="build-title">Ваша усадьба: что построить</h2>
      <div class="outcome-box">
        <div class="otitle">Построено: ${info.name || ''}</div>
        <div class="otext">${info.short || ''}</div>
        ${lines.map(l => `<div>${l}</div>`).join('')}
      </div>
      <button class="choice-btn" id="btn-build-continue">Продолжить</button>
    </div>`;
  }

  let catsHtml = '';
  if(wide){
    cats.forEach(c => {
      const list = buildings.filter(b => b.category === c.id);
      catsHtml += `<div class="build-cat"><h3 class="build-cat-title">${c.name}</h3><div class="build-grid">${list.map(b => buildCardHtml(b, rod, {selId: selId})).join('')}</div></div>`;
    });
  } else {
    const cat = cats.find(c => c.id === buildCat) || cats[0];
    const list = cat ? buildings.filter(b => b.category === cat.id) : [];
    const tabs = `<div class="build-tabs">${cats.map(c => `<button class="build-tab ${cat && cat.id === c.id ? 'active' : ''}" data-build-cat="${c.id}">${c.name}</button>`).join('')}</div>`;
    catsHtml = `${tabs}<div class="build-cat"><h3 class="build-cat-title">${cat ? cat.name : ''}</h3><div class="build-grid">${list.map(b => buildCardHtml(b, rod, {selId: selId})).join('')}</div></div>`;
  }
  return `<div class="build-window event-card" id="build-window-root">
    <span class="era-badge">${ev.era || ''}</span>
    <h2 class="build-title">Ваша усадьба: что построить</h2>
    <p class="build-subtitle">Выберите одно здание или пропустите</p>
    <div class="build-gold">В казне: <strong>${gold}</strong> руб.</div>
    ${catsHtml}
    <button class="choice-btn" id="btn-build-skip">Пропустить</button>
  </div>`;
}

// ТЗ 22 §5: детальная карточка здания (поверх экрана). source — откуда открыта: 'window' (с кнопкой
// «Построить») или 'estate' (только «Закрыть», для чтения).
function renderBuildDetail(rod){
  const b = buildingById(detailBuildingId);
  if(!b) return '';
  const fromWindow = detailSource === 'window';
  const gold = rod.resources.zoloto || 0;
  const built = rod.buildings || {};
  const count = built[b.id] || 0;
  const alreadyBuilt = b.maxCount === 1 ? count >= 1 : (b.maxCount !== null && b.maxCount !== undefined && count >= b.maxCount);
  const insufficient = gold < (b.price || 0);
  const disabled = alreadyBuilt || insufficient;
  const label = alreadyBuilt ? 'Построено' : (insufficient ? `Не хватает ${(b.price || 0) - gold} руб.` : 'Построить');
  const pills = (b.bonusText || []).map(t => `<span class="build-bonus">${t}</span>`);
  if(b.oneTime) pills.push('<span class="build-bonus">Единоразово</span>');
  const foot = fromWindow
    ? `<button class="build-btn" id="btn-build-detail-yes" ${disabled ? 'disabled' : ''}>${label}</button>`
    : `<button class="build-btn" id="btn-build-detail-close">Закрыть</button>`;
  return `<div class="build-overlay" id="build-detail-root">
    <div class="build-modal build-detail">
      <div class="build-card-img build-detail-img"><img src="${b.image}" alt="${b.name}" onerror="this.parentNode.classList.add('missing')"><div class="build-card-fallback">${b.emoji}</div></div>
      <h2 class="build-detail-name">${b.name}</h2>
      <div class="build-bonus-row">${pills.join('')}</div>
      <div class="build-desc">${b.description || ''}</div>
      <div class="build-price">${b.price} руб.</div>
      <div class="build-modal-actions">${foot}</div>
    </div>
  </div>`;
}

// ТЗ 22 §3: подтверждение покупки — нижняя панель на телефоне или окно по центру на большом экране
function renderBuildConfirm(rod){
  const b = buildingById(buildConfirmingId);
  if(!b) return '';
  const price = b.price || 0;
  const gold = rod.resources.zoloto || 0;
  const lines = [];
  const eff = resourceEffect(b.onBuild);
  const labels = {slava: 'Знатность', krestyane: 'Души', zoloto: 'Рубли'};
  Object.keys(eff).forEach(k => {
    const v = eff[k];
    if(typeof v !== 'number' || !labels[k]) return;
    lines.push(`<div class="effect-line ${v > 0 ? 'pos' : 'neg'}">${labels[k]} ${v > 0 ? '+' : ''}${v}</div>`);
  });
  if(b.perTurn && typeof b.perTurn.income === 'number') lines.push(`<div class="effect-line pos">Доход: +${b.perTurn.income} руб. в ход</div>`);
  if(b.perTurn && typeof b.perTurn.fleeReduction === 'number') lines.push(`<div class="effect-line pos">Бегство крестьян: −${b.perTurn.fleeReduction} п. п.</div>`);
  lines.push(`<div class="effect-line neg">Рубли −${price}</div>`);
  return `<div class="build-overlay" id="build-confirm-root">
    <div class="build-modal build-confirm">
      <div class="build-modal-title">Подтверждение</div>
      <div class="build-confirm-text">Построить «${b.name}» за ${price} руб.? Останется ${gold - price} руб.</div>
      <div class="outcome-box">${lines.map(l => `<div>${l}</div>`).join('')}</div>
      <div class="build-modal-actions">
        <button class="build-btn" id="btn-build-confirm-yes">Построить</button>
        <button class="build-btn build-btn-ghost" id="btn-build-confirm-no">Отмена</button>
      </div>
    </div>
  </div>`;
}

// ТЗ 22 §3: панель результата после покупки
function renderBuildResult(){
  const info = buildResultInfo || {};
  const lines = info.lines || [];
  return `<div class="build-overlay" id="build-result-root">
    <div class="build-modal build-result">
      <div class="build-modal-title">Результат</div>
      <div class="outcome-box">
        <div class="otitle">Построено: ${info.name || ''}</div>
        <div class="otext">${info.short || ''}</div>
        ${lines.map(l => `<div>${l}</div>`).join('')}
      </div>
      <div class="build-modal-actions">
        <button class="choice-btn" id="btn-build-continue">Продолжить</button>
      </div>
    </div>
  </div>`;
}

// ТЗ 22 §4: экран «Ваша усадьба» — оверлей со списком построек и постоянными бонусами
function renderEstateOverlay(rod){
  const buildings = buildingsList();
  const nonVillage = buildings.filter(b => b.id !== 'votchina');
  const built = rod.buildings || {};
  const count = builtCountOf(rod);
  const rows = builtBonusRows(rod);
  const sum = key => rows.filter(r => r.kind === key).reduce((a, r) => a + r.value, 0);
  const totalSlava = sum('slava');
  const totalIncome = sum('income');
  const totalFlee = sum('fleeReduction');
  const bonuses = `
    <div class="outcome-box">
      <div class="otitle">Постоянные бонусы</div>
      ${totalSlava ? `<div class="effect-line pos">Знатность за постройки: +${totalSlava}</div>` : ''}
      ${totalIncome ? `<div class="effect-line pos">Доход: +${totalIncome} руб. в ход</div>` : ''}
      ${totalFlee ? `<div class="effect-line pos">Бегство крестьян: −${totalFlee} п. п.</div>` : ''}
      ${!totalSlava && !totalIncome && !totalFlee ? `<div class="otext">Пока ничего не построено. Следующая возможность появится позже</div>` : ''}
    </div>`;
  const grid = nonVillage.map(b => {
    const isBuilt = (built[b.id] || 0) > 0;
    return `<div class="build-estate-item ${isBuilt ? 'built' : ''}" data-bid="${b.id}">
      <div class="build-estate-icon">${b.emoji}</div>
      <div class="build-estate-name">${isBuilt ? b.name : ''}</div>
    </div>`;
  }).join('');
  return `<div class="build-overlay" id="build-estate-root">
    <div class="build-modal build-estate">
      <div class="build-modal-head">
        <h2 class="build-title">Ваша усадьба</h2>
        <div class="build-modal-sub">Построено: ${count} из ${nonVillage.length}</div>
      </div>
      <div class="build-estate-grid">${grid}</div>
      ${bonuses}
      <button class="choice-btn" id="btn-build-estate-close">Закрыть</button>
    </div>
  </div>`;
}

function bindRodScreen(){
  document.getElementById('btn-leave').onclick = ()=>{ currentRod=null; render(); };
  const rod = state.rods[currentRod];
  const idx = Math.min(rod.progress || 0, state.events.length - 1);
  const ev = state.events[idx];

  const historyBtn = document.getElementById('btn-toggle-history');
  if(historyBtn){
    historyBtn.onclick = ()=>{ showHistory = !showHistory; render(); };
  }

  // ТЗ 22: кнопка «Усадьба» в шапке экрана рода
  const estateBtn = document.getElementById('btn-estate');
  if(estateBtn){
    estateBtn.onclick = ()=>{ estateOpen = true; render(); };
  }

  // ТЗ 22: окно «Постройки» — пропуск
  const bwSkip = document.getElementById('btn-build-skip');
  if(bwSkip){
    bwSkip.onclick = async ()=>{
      if(busy) return;
      buildPhase = 'skip';
      render();
    };
  }
  document.querySelectorAll('[data-build-cat]').forEach(btn=>{
    btn.onclick = ()=>{
      if(busy) return;
      buildCat = btn.dataset.buildCat;
      render();
    };
  });
  document.querySelectorAll('.build-card').forEach(card=>{
    card.onclick = ()=>{
      if(busy) return;
      if(buildPhase !== 'choose') return;
      const bid = card.dataset.bid;
      const b = buildingById(bid);
      if(!b) return;
      const rodObj = state.rods[currentRod];
      const count = (rodObj.buildings || {})[bid] || 0;
      const alreadyBuilt = b.maxCount === 1 ? count >= 1 : (b.maxCount !== null && b.maxCount !== undefined && count >= b.maxCount);
      const gold = rodObj.resources.zoloto || 0;
      const insufficient = gold < (b.price || 0);
      if(alreadyBuilt || insufficient) return;
      detailSource = 'window';
      detailBuildingId = bid;
      render();
    };
  });
  const bwContinue = document.getElementById('btn-build-continue');
  if(bwContinue){
    bwContinue.onclick = async ()=>{
      if(busy) return;
      if(buildPhase === 'skip'){
        const rodObj = state.rods[currentRod];
        if(!rodObj.buildWindows) rodObj.buildWindows = {};
        rodObj.buildWindows[buildEventId] = 'skipped';
        await dbSet(`rods/${currentRod}/buildWindows/${buildEventId}`, 'skipped');
        buildPhase = 'choose';
        render();
      } else if(buildPhase === 'result'){
        buildPhase = 'choose';
        buildResultInfo = null;
        buildConfirmingId = null;
        buildSelId = null;
        render();
      }
    };
  }

  // ТЗ 22: подтверждение покупки
  const buildConfirmRoot = document.getElementById('build-confirm-root');
  if(buildConfirmRoot){
    buildConfirmRoot.onclick = e => { if(e.target === buildConfirmRoot) buildPhase = 'choose'; buildSelId = null; buildConfirmingId = null; render(); };
  }
  const btnBuildConfirmYes = document.getElementById('btn-build-confirm-yes');
  if(btnBuildConfirmYes){
    btnBuildConfirmYes.onclick = async ()=>{
      if(busy) return;
      busy = true;
      const r = await buyBuilding(currentRod, buildEventId, buildConfirmingId);
      busy = false;
      if(r.ok){
        const nb = buildingById(buildConfirmingId);
        const eff2 = resourceEffect(nb.onBuild);
        const labels2 = {slava: 'Знатность', krestyane: 'Души', zoloto: 'Рубли'};
        const lines = [];
        Object.keys(eff2).forEach(k => { const v = eff2[k]; if(typeof v !== 'number' || !labels2[k]) return; lines.push(`<div class="effect-line ${v > 0 ? 'pos' : 'neg'}">${labels2[k]} ${v > 0 ? '+' : ''}${v}</div>`); });
        if(nb.perTurn && typeof nb.perTurn.income === 'number') lines.push(`<div class="effect-line pos">Доход: +${nb.perTurn.income} руб. в ход</div>`);
        if(nb.perTurn && typeof nb.perTurn.fleeReduction === 'number') lines.push(`<div class="effect-line pos">Бегство крестьян: −${nb.perTurn.fleeReduction} п. п.</div>`);
        lines.push(`<div class="effect-line neg">Рубли −${nb.price || 0}</div>`);
        buildPhase = 'result';
        buildResultInfo = {buildingId: buildConfirmingId, name: nb.name, short: nb.short, lines: lines};
        state.rods[currentRod] = r.value;
        render();
      } else {
        buildPhase = 'choose';
        render();
      }
    };
  }
  const btnBuildConfirmNo = document.getElementById('btn-build-confirm-no');
  if(btnBuildConfirmNo){
    btnBuildConfirmNo.onclick = ()=>{
      buildPhase = 'choose';
      buildSelId = null;
      buildConfirmingId = null;
      render();
    };
  }

  // ТЗ 22: детальная карточка — «Построить» из окна или «Закрыть» из усадьбы
  const buildDetailRoot = document.getElementById('build-detail-root');
  if(buildDetailRoot){
    buildDetailRoot.onclick = e => { if(e.target === buildDetailRoot) closeBuildDetail(); };
  }
  const btnBuildDetailYes = document.getElementById('btn-build-detail-yes');
  if(btnBuildDetailYes){
    btnBuildDetailYes.onclick = ()=>{
      if(busy) return;
      buildPhase = 'confirm';
      buildConfirmingId = detailBuildingId;
      buildSelId = detailBuildingId;
      render();
    };
  }
  const btnBuildDetailClose = document.getElementById('btn-build-detail-close');
  if(btnBuildDetailClose){
    btnBuildDetailClose.onclick = ()=>{ closeBuildDetail(); };
  }

  // ТЗ 22: экран «Ваша усадьба» — клик по построенному иконке открывает детальную карточку (только для чтения)
  const buildEstateRoot = document.getElementById('build-estate-root');
  if(buildEstateRoot){
    buildEstateRoot.onclick = e => { if(e.target === buildEstateRoot) estateOpen = false; render(); };
  }
  document.querySelectorAll('.build-estate-item').forEach(item=>{
    item.onclick = ()=>{
      if(busy) return;
      if(!item.classList.contains('built')) return;
      detailSource = 'estate';
      detailBuildingId = item.dataset.bid;
      render();
    };
  });
  const btnBuildEstateClose = document.getElementById('btn-build-estate-close');
  if(btnBuildEstateClose){
    btnBuildEstateClose.onclick = ()=>{ estateOpen = false; render(); };
  }

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
