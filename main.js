async function render(){
  const app = document.getElementById('app');
  if(!state){ app.innerHTML = '<div class="ui" style="color:#eee;text-align:center;padding:40px;">Загрузка...</div>'; return; }

  if (!state.globalResults) state.globalResults = {};
  if (!state.rods) {
    state.rods = {};
  } else {
    Object.keys(state.rods).forEach(name => {
      if (!state.rods[name]) state.rods[name] = {};
      patchRod(state.rods[name]);
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

async function boot(){
  const freshEvents = await loadEvents(); // Сначала загружаем события из JSON

  stateRef.on('value', (snapshot) => {
    const data = snapshot.val();
    if (data) {
      state = data;
      state.events = freshEvents;
      if (!state.globalResults) state.globalResults = {};

      // Предохранитель для списка родов
      if (!state.rods) {
        state.rods = {};
      } else {
        // Восстанавливаем пустые поля рода, если Firebase удалил их из-за пустоты.
        Object.keys(state.rods).forEach(name => {
          patchRod(state.rods[name]);
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
