  const answered = ev.type === 'normal'
    ? rod.answers[ev.id]
    : (rod.votes[ev.id] ? { choiceKey: rod.votes[ev.id] } : null);

  const typeLabel = ev.type === 'normal' ? 'Обычное событие' : 'Глобальное событие';
  const typeClass = ev.type === 'normal' ? 'normal' : 'global';

  let body = '';
  if (!answered) {
    body = `
      <div class="event-card">
        <span class="era-badge">${ev.era}</span>
        <span class="type-badge ${typeClass}">${typeLabel}</span>
        <h2 class="event-title">${ev.title}</h2>
        <p class="event-desc">${ev.description}</p>
        ${ev.choices.map(c =>
          `<button class="choice-btn" data-key="${c.key}">${c.label}</button>`
        ).join('')}
      </div>
    `;
  } else {
    const choice = ev.choices.find(c => c.key === answered.choiceKey);
    const waitNote = ev.type === 'global'
      ? '<p class="small-note">Итоги этого решения придут позже, на Земском соборе.</p>'
      : '';
    body = `
      <div class="event-card">
        <span class="era-badge">${ev.era}</span>
        <span class="type-badge ${typeClass}">${typeLabel}</span>
        <h2 class="event-title">${ev.title}</h2>
        <p class="event-desc" style="opacity:0.75">Ваш выбор: ${choice ? choice.label : ''}</p>
        <div class="outcome-box">
          <div class="otitle">${choice.outcomeTitle}</div>
          <div class="otext">${choice.outcomeText}</div>
          ${fmtDelta(choice.effect)}
        </div>
        ${waitNote}
        ${nextBtnHtml}
      </div>
    `;
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

function bindRodScreen() {
  document.getElementById('btn-leave').onclick = () => {
    currentRod = null;
    render();
  };

  const rod = state.rods[currentRod];
  const idx = Math.min(rod.progress || 0, state.events.length - 1);

  document.querySelectorAll('[data-key]').forEach(btn => {
    btn.onclick = async () => {
      if (busy) return;
      busy = true;
      const ev = state.events[idx];
      const choice = ev.choices.find(c => c.key === btn.dataset.key);

      if (ev.type === 'normal') {
        rod.answers[ev.id] = { choiceKey: choice.key };
      } else {
        rod.votes[ev.id] = choice.key;
        rod.answers[ev.id] = { choiceKey: choice.key };
      }

      rod.resources = applyEffect(rod.resources, choice.effect || {});
      render();
      await saveState(state);
      busy = false;
    };
  });

  const ackBtn = document.getElementById('btn-ack-reveal');
  if (ackBtn) {
    ackBtn.onclick = async () => {
      if (busy) return;
      busy = true;
      rod.seenReveal[ackBtn.dataset.ev] = true;
      render();
      await saveState(state);
      busy = false;
    };
  }

  const nextBtn = document.getElementById('btn-next-event');
  if (nextBtn) {
    nextBtn.onclick = async () => {
      if (busy) return;
      busy = true;
      if (rod.progress < state.events.length - 1) rod.progress++;
      render();
      await saveState(state);
      busy = false;
    };
  }
  
