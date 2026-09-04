let role = null;
let currentRod = null;
let busy = false;

function landingScreen() {
  return `
    <div class="landing">
      <h1>Бунташный век</h1>
      <p>Соберите род, переживите смуту, правьте мудро.</p>
      <div class="role-buttons">
        <button id="btn-enter-gm" class="role-btn">Я ведущий</button>
        <button id="btn-enter-rod" class="role-btn">Я игрок (род)</button>
      </div>
    </div>
  `;
}

function bindLanding() {
  const gmBtn = document.getElementById('btn-enter-gm');
  if (gmBtn) {
    gmBtn.onclick = () => {
      role = 'gm';
      render();
    };
  }

  const rodBtn = document.getElementById('btn-enter-rod');
  if (rodBtn) {
    rodBtn.onclick = () => {
      role = 'rod';
      render();
    };
  }
}

function rodJoinScreen() {
  const estateButtons = `
    <div class="estate-choice">
      <button class="estate-btn" data-estate="dvoryane">Дворянский род</button>
      <button class="estate-btn" data-estate="boyare">Боярский род</button>
    </div>
  `;

  return `
    <div class="rod-header">
      <span class="name">Выбор рода</span>
      <button id="btn-back-landing">← назад</button>
    </div>
    <div class="join-screen">
      <h2>Назовите ваш род</h2>
      <input type="text" id="rod-name-input" placeholder="Например: Романовы" maxlength="30">
      ${estateButtons}
      <button id="btn-create-rod" disabled>Создать род</button>
    </div>
  `;
}

function bindRodJoin() {
  const backBtn = document.getElementById('btn-back-landing');
  if (backBtn) {
    backBtn.onclick = () => {
      role = null;
      render();
    };
  }

  const input = document.getElementById('rod-name-input');
  const createBtn = document.getElementById('btn-create-rod');
  let selectedEstate = null;

  document.querySelectorAll('.estate-btn').forEach(btn => {
    btn.onclick = () => {
      document.querySelectorAll('.estate-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      selectedEstate = btn.dataset.estate;
      checkReady();
    };
  });

  if (input) {
    input.oninput = () => checkReady();
  }

  function checkReady() {
    if (!createBtn) return;
    const name = (input ? input.value.trim() : '').length > 0;
    createBtn.disabled = !(name && selectedEstate);
  }
  checkReady(); // сразу проверить при загрузке экрана

  if (createBtn) {
    createBtn.onclick = async () => {
      const name = input.value.trim();
      if (!name || !selectedEstate) return;
      
      if (typeof ensureRod === 'function') {
        ensureRod(name, selectedEstate);
      }
      currentRod = name;
      render();
      
      if (typeof saveState === 'function' && typeof state === 'object') {
        await saveState(state);
      }
    };
  }
}

async function render() {
  const app = document.getElementById('app');
  if (!app) return;

  // Если состояние ещё не загружено Firebase
  if (!state) {
    app.innerHTML = '<div class="ui" style="color:#eee;text-align:center;padding:40px;">Загрузка состояния...</div>';
    return;
  }

  // Инициализация полей безопасности
  if (!state.globalResults) state.globalResults = {};
  if (!state.rods) state.rods = {};

  let banner = '';
  if (typeof errorBanner === 'function') {
    banner = errorBanner();
  }

  // Логика экранов
  if (!role) {
    // ГЛАВНЫЙ ЭКРАН
    app.innerHTML = banner + landingScreen();
    bindLanding();
    return;
  }

  if (role === 'rod' && !currentRod) {
    // СОЗДАНИЕ РОДА
    app.innerHTML = banner + rodJoinScreen();
    bindRodJoin();
    return;
  }

  if (role === 'rod') {
    // ИГРОВОЙ ЭКРАН РОДА
    if (typeof rodScreen === 'function') {
      app.innerHTML = banner + rodScreen();
      if (typeof bindRodScreen === 'function') bindRodScreen();
    } else {
      app.innerHTML = banner + '<div class="error">Ошибка: функция rodScreen не найдена. Проверьте rod-view.js</div>';
    }
    return;
  }

  if (role === 'gm') {
    // ЭКРАН ВЕДУЩЕГО
    if (typeof gmScreen === 'function') {
      app.innerHTML = banner + gmScreen();
      if (typeof bindGmScreen === 'function') bindGmScreen();
    } else {
      app.innerHTML = banner + '<div class="error">Ошибка: функция gmScreen не найдена. Проверьте gm-view.js</div>';
    }
    return;
  }

  app.innerHTML = banner + '<div class="ui">Неизвестный режим (role = ' + String(role) + ')</div>';
}

async function boot() {
  // Сначала загружаем события из JSON (заглушка)
  const freshEvents = await loadEvents();
  if (!freshEvents || !Array.isArray(freshEvents)) {
    console.error('loadEvents вернул некорректные данные');
    // Даже если нет событий, продолжаем, чтобы показать экраны
  }

  // Слушаем Firebase
  if (stateRef) {
    stateRef.on('value', (snapshot) => {
      const data = snapshot.val();

      if (data) {
        state = { ...data };
        // Если событий нет в базе, берём из JSON
        if (!state.events || !Array.isArray(state.events)) {
          state.events = freshEvents || [];
        }
        if (!state.globalResults) state.globalResults = {};
        if (!state.rods) state.rods = {};
      } else {
        // База пуста — создаём начальное состояние
        state = initialState();
        state.events = freshEvents || [];
        // stateRef.set(state); // Можно раскомментировать, чтобы создать базу
      }

      // Теперь можно рендерить
      render();
    });
  } else {
    console.error('stateRef не определён! Проверьте firebase-init.js');
  }
}

// ЗАПУСК
boot();
