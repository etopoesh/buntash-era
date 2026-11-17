const firebaseConfig = {
  databaseURL: "https://buntash-era-default-rtdb.firebaseio.com"
};
firebase.initializeApp(firebaseConfig);
const db = firebase.database();
// Тестовый стенд (test.html?test=1) пишет в отдельную ветку и не трогает живую игру.
const TEST_MODE = typeof location !== 'undefined' && new URLSearchParams(location.search).has('test');
const stateRef = db.ref(TEST_MODE ? 'buntash-test' : 'buntash-state');

async function saveState(s){
  try {
    await stateRef.set(s);
    storageError = null;
  } catch(e) {
    storageError = 'Ошибка облака: ' + e.message;
    render();
  }
}

// Версия подставляется из ?v= у тега firebase-init.js — чтобы обновления текстов
// events.json не застревали в кэше браузера после правок описаний.
const DATA_VERSION = (function(){
  const src = (typeof document !== 'undefined' && document.currentScript && document.currentScript.src) || '';
  const m = src.match(/[?&]v=([^&]+)/);
  return m ? m[1] : '1';
})();

async function loadEvents() {
  try {
    const response = await fetch('events.json?v=' + DATA_VERSION);
    return await response.json();
  } catch (e) {
    console.error('Ошибка загрузки событий:', e);
    return [];
  }
}

// ТЗ 22: каталог построек читаются так же, как events.json. Если файл не загрузился —
// возвращаем null: окно «Постройки» не показывается, игра идёт дальше без ошибок.
async function loadBuildings() {
  try {
    const response = await fetch('plus/тз22/buildings.json?v=' + DATA_VERSION);
    if (!response.ok) return null;
    return await response.json();
  } catch (e) {
    console.error('Ошибка загрузки построек:', e);
    return null;
  }
}
