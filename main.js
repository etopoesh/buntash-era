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
  if (gmBtn) gmBtn.onclick = () => { role = 'gm'; render(); };

  const rodBtn = document.getElementById('btn-enter-rod');
  if (rodBtn) rodBtn.onclick = () => { role = 'rod'; render(); };
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
  document.getElementById('btn-back-landing').onclick = () => {
    role = null;
    render();
  };

  const input = document.getElementById('rod-name-input');
  const createBtn = document.getElementById('btn-create-rod');
  let selectedEstate = null;

  document.querySelectorAll('.estate-btn').forEach(btn => {
    btn.onclick = () => {
      document.querySelectorAll('.estate-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      selectedEstate = btn.dataset.estate;
