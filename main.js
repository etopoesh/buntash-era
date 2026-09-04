async function render() {
  const app = document.getElementById('app');
  if (!app) return; // защита, если контейнер ещё не создан

  // Заглушка, если state не инициализирован
  if (!state) {
    app.innerHTML = '<div class="ui" style="color:#eee;text-align:center;padding:40px;">Загрузка...</div>';
    return;
  }

  // Инициализация полей, если их нет
  if (!state.globalResults) state.globalResults = {};
  if (!state.rods) {
    state.rods = {};
  } else {
    Object.keys(state.rods).forEach(name => {
      if (!state.rods[name]) state.rods[name] = {};
      patchRod(state.rods[name]);
    });
  }

  const banner = errorBanner(); // теперь это строка, а не JSX

  if (!role) {
    const screen = landingScreen();
    if (!screen) {
      app.innerHTML = banner + '<div class="ui">Ошибка: landingScreen вернул пустоту</div>';
      return;
    }
    app.innerHTML = banner + screen;
    bindLanding();
    return;
  }

  if (role === 'rod' && !currentRod) {
    const screen = rodJoinScreen();
    if (!screen) {
      app.innerHTML = banner + '<div class="ui">Ошибка: rodJoinScreen вернул пустоту</div>';
      return;
    }
    app.innerHTML = banner + screen;
    bindRodJoin();
    return;
  }

  if (role === 'rod') {
    const screen = rodScreen();
    if (!screen) {
      app.innerHTML = banner + '<div class="ui">Ошибка: rodScreen вернул пустоту</div>';
      return;
    }
    app.innerHTML = banner + screen;
    bindRodScreen();
    return;
  }

  if (role === 'gm') {
    const screen = gmScreen();
    if (!screen) {
      app.innerHTML = banner + '<div class="ui">Ошибка: gmScreen вернул пустоту</div>';
      return;
    }
    app.innerHTML = banner + screen;
    bindGmScreen();
    return;
  }

  // fallback, если role не распознан
  app.innerHTML = banner + '<div class="ui">Неизвестный режим (role = ' + String(role) + ')</div>';
}

async function boot() {
  // Сначала загружаем события из JSON — это «шаблон» событий
  const freshEvents = await loadEvents();
  if (!freshEvents || !Array.isArray(freshEvents)) {
    console.error('loadEvents вернул некорректные данные');
    return;
  }

  stateRef.on('value', (snapshot) => {
    const data = snapshot.val();

    if (data) {
      // Копируем данные, чтобы не мутировать snapshot напрямую
      state = { ...data };

      // ВАЖНО: не перезаписываем events каждый раз из freshEvents,
      // иначе прогресс по событиям будет сбрасываться.
      // Оставляем events из базы, если они есть.
      if (!state.events || !Array.isArray(state.events)) {
        state.events = freshEvents;
      }

      if (!state.globalResults) state.globalResults = {};

      if (!state.rods) {
        state.rods = {};
      } else {
        Object.keys(state.rods).forEach(name => {
          if (!state.rods[name]) state.rods[name] = {};
          patchRod(state.rods[name]);
        });
      }
    } else {
      // Если в базе пусто — создаём начальное состояние с событиями из JSON
      state = initialState();
      state.events = freshEvents;
      stateRef.set(state);
    }

    render();
  });
}

boot();
