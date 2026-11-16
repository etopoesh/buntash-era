const firebaseConfig = {
  databaseURL: "https://buntash-era-default-rtdb.firebaseio.com"
};
firebase.initializeApp(firebaseConfig);
const db = firebase.database();
const stateRef = db.ref('buntash-state');

async function saveState(s){
  try {
    await stateRef.set(s);
    storageError = null;
  } catch(e) {
    storageError = 'Ошибка облака: ' + e.message;
    render();
  }
}

async function loadEvents() {
  try {
    const response = await fetch('events.json');
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
    const response = await fetch('plus/тз22/buildings.json');
    if (!response.ok) return null;
    return await response.json();
  } catch (e) {
    console.error('Ошибка загрузки построек:', e);
    return null;
  }
}
