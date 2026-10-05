async function render(){
  const app = document.getElementById('app');
  if(!state){ app.innerHTML = '<div class="ui" style="color:#eee;text-align:center;padding:40px;">Загрузка...</div>'; return; }

  if (!state.globalResults) state.globalResults = {};
  if (!state.auctions) state.auctions = {};
  if (!state.national) state.national = {stability: 0, centralization: 0};
  if (!state.majorityBonusResolved) state.majorityBonusResolved = {};
  if (!state.rods) {
    state.rods = {};
  } else {
    Object.keys(state.rods).forEach(name => {
      if (!state.rods[name]) state.rods[name] = {};
      patchRod(state.rods[name]);
    });
  }
  Object.keys(state.auctions || {}).forEach(id => patchAuction(state.auctions[id]));

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

async function boot(){
  const freshEvents = await loadEvents(); // Сначала загружаем события из JSON

  stateRef.on('value', (snapshot) => {
    const data = snapshot.val();
    if (data) {
      state = data;
      state.events = freshEvents;
      if (!state.globalResults) state.globalResults = {};
      if (!state.auctions) state.auctions = {};
      if (!state.national) state.national = {stability: 0, centralization: 0};
      if (!state.majorityBonusResolved) state.majorityBonusResolved = {};

      // Предохранитель для списка родов
      if (!state.rods) {
        state.rods = {};
      } else {
        // Восстанавливаем пустые поля рода, если Firebase удалил их из-за пустоты.
        Object.keys(state.rods).forEach(name => {
          patchRod(state.rods[name]);
        });
      }
      Object.keys(state.auctions || {}).forEach(id => patchAuction(state.auctions[id]));

      // Автооглашение global-событий: как только все рода проголосовали, ведущему
      // не нужно жать "Огласить итоги" — подводим итог сами (форс-кнопка остаётся для оверрайда).
      // Та же логика для majorityBonus на choice у type:"normal" событий — только nationalEffect,
      // без личных эффектов (они уже применены каждому роду индивидуально при ответе).
      if (role === 'gm') {
        const rodNames = Object.keys(state.rods);
        if (rodNames.length > 0) {
          state.events.forEach(ev => {
            if (ev.type === 'global' && !state.globalResults[ev.id]) {
              const allVoted = rodNames.every(n => state.rods[n].votes && state.rods[n].votes[ev.id]);
              if (allVoted) {
                resolveGlobalEvent(ev);
                saveState(state);
              }
            }
            if (ev.type === 'normal' && !state.majorityBonusResolved[ev.id]) {
              const allAnswered = rodNames.every(n => state.rods[n].answers && state.rods[n].answers[ev.id]);
              if (allAnswered) {
                resolveMajorityBonus(ev);
                saveState(state);
              }
            }
          });
        }
      }

    } else {
      state = initialState();
      state.events = freshEvents;
      // На самом первом запуске initialState() ещё не видел state.events (его тогда не было),
      // поэтому startIndex() там вернул 0 — пересчитываем теперь, когда события уже на месте.
      state.currentIndex = startIndex();
      stateRef.set(state);
    }
    render();
  });
}
boot();
