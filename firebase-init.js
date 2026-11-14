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
