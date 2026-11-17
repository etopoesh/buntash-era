/* Полный automated-прогон игры через реальный UI.
 * Открыть: test.html?test=1  (пишет в Firebase-ветку buntash-test, живую игру не трогает).
 * Результат виден в панели слева и в window.__E2E_RESULT.
 */
(() => {
  const REPORT = document.getElementById('test-report');
  const results = [];
  let running = false;

  const $ = sel => document.querySelector(sel);
  const $$ = sel => Array.from(document.querySelectorAll(sel));
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const label = ev => ev ? `${ev.id} (${ev.type}${ev.final ? ', финал' : ''})` : 'нет события';

  function flush(){
    if(!REPORT) return;
    const bad = results.filter(r=>!r.ok);
    REPORT.innerHTML = `<strong>Полный тест ${running ? 'выполняется…' : 'завершён'}</strong> — ` +
      `PASS ${results.length - bad.length} / FAIL ${bad.length}<br>` +
      results.map(r => `<div style="color:${r.ok ? '#1b5e20' : '#b71c1c'}">${r.ok ? '✓' : '✗'} ${r.name}${r.details ? ' — ' + r.details : ''}</div>`).join('');
  }
  function check(name, ok, details){
    results.push({name, ok: !!ok, details: details || ''});
    flush();
    return !!ok;
  }
  async function waitFor(pred, timeout = 5000){
    const t0 = Date.now();
    while(Date.now() - t0 < timeout){
      try { if(pred()) return true; } catch(e) { /* state ещё грузится */ }
      await sleep(25);
    }
    return false;
  }
  const rodOf = name => state.rods && state.rods[name];
  const progressed = (name, from) => {
    const r = rodOf(name);
    return !!r && r.progress === from + 1;
  };
  // Firebase-слушатель обновляет state раньше, чем обработчик клика сбрасывает busy.
  // Клик во время busy игнорируется — это защита игры от двойных нажатий, в тесте её надо уважать.
  const idle = () => waitFor(() => busy === false, 5000);
  // После remove()/массовых записей Firebase может прислать запоздавший старый снимок.
  // Ждём, пока ключевые поля перестанут меняться, чтобы проверки не ловили переходное состояние.
  const settle = async (quiet = 250, timeout = 6000) => {
    const snap = () => JSON.stringify({
      rods: Object.keys((state && state.rods) || {}).sort(),
      national: state && state.national,
      mb: state && state.majorityBonusResolved
    });
    let prev = snap(), last = Date.now();
    const t0 = Date.now();
    while(Date.now() - t0 < timeout){
      await sleep(50);
      const cur = snap();
      if(cur !== prev){ prev = cur; last = Date.now(); }
      else if(Date.now() - last >= quiet) return true;
    }
    return false;
  };

  async function clickAndWait(sel, pred, what){
    await idle();
    const el = $(sel);
    if(!el){ check(what, false, 'кнопка не найдена: ' + sel); return false; }
    el.click();
    const ok = await waitFor(pred);
    check(what, ok, ok ? '' : 'нет реакции после клика');
    return ok;
  }

  // ---- подготовка -----------------------------------------------------------
  async function prepare(){
    const ok = await waitFor(() => state && state.events && state.events.length && state.buildings);
    if(!ok){ check('загрузка events.json / buildings.json', false); return false; }
    check('загрузка events.json / buildings.json', true, `событий: ${state.events.length}`);
    await stateRef.remove();
    const fresh = await waitFor(() => state && state.events && state.events.length > 0 && Object.keys(state.rods || {}).length === 0);
    check('тестовая ветка Firebase очищена', fresh);
    return fresh;
  }

  // ---- окно построек --------------------------------------------------------
  async function handleBuild(name, ev, buy){
    await idle();
    const r = rodOf(name);
    if(buildPhase === 'confirm'){
      const goldBefore = r.resources.zoloto;
      const builtBefore = Object.values(r.buildings || {}).reduce((a,b)=>a+b, 0);
      const btn = $('#btn-build-confirm-yes');
      if(!btn){ check('постройка: подтверждение', false, 'нет кнопки «Построить»'); return true; }
      // двойной клик — вторая заявка должна быть проигнорирована (busy + транзакция)
      btn.click(); btn.click();
      const gotResult = await waitFor(() => buildPhase === 'result' && !!$('#btn-build-continue'));
      const r2 = rodOf(name);
      const builtAfter = Object.values(r2.buildings || {}).reduce((a,b)=>a+b, 0);
      check('окно постройки: информационное окно после покупки', gotResult,
        gotResult ? '' : 'после постройки нет окна «Результат» / «Продолжить»');
      check('постройка: здание куплено ровно один раз', builtAfter === builtBefore + 1,
        `было ${builtBefore}, стало ${builtAfter}`);
      check('постройка: деньги списаны один раз', r2.resources.zoloto < goldBefore,
        `было ${goldBefore}, стало ${r2.resources.zoloto}`);
      if(gotResult){
        $('#btn-build-continue').click();
        await waitFor(() => buildPhase === 'choose' && !$('#build-result-root'));
      }
      return true;
    }
    if(buildPhase === 'result' || buildPhase === 'skip'){
      const btn = $('#btn-build-continue');
      if(btn) btn.click();
      await waitFor(() => buildPhase === 'choose');
      return true;
    }
    if(ev.buildWindow && state.buildings && (r.buildWindows || {})[ev.id] === undefined){
      if(!buy){
        const skip = $('#btn-build-skip');
        if(!skip){ check('окно постройки: кнопка «Пропустить»', false); return true; }
        skip.click();
        await waitFor(() => buildPhase === 'skip');
        check('окно постройки: пропуск', true);
        return true;
      }
      const btn = $('.build-card:not(.build-card-built) .build-btn[data-bid]:not([disabled])');
      if(!btn){
        // нет доступных зданий — пропускаем окно
        const skip = $('#btn-build-skip');
        check('окно постройки: нет доступных зданий, кнопка «Пропустить»', !!skip,
          `золото: ${r.resources.zoloto}`);
        if(skip) skip.click();
        await waitFor(() => buildPhase === 'skip');
        return true;
      }
      const bid = btn.dataset.bid;
      const card = btn.closest('.build-card');
      // Клик по всей карточке открывает детальную карточку, клик по кнопке «Построить» — сразу подтверждение.
      // Проверяем оба пути: сначала детализацию (основной путь игрока).
      if(card) card.click();
      await waitFor(() => !!$('#btn-build-detail-yes') || buildPhase === 'confirm');
      const detailYes = $('#btn-build-detail-yes');
      if(detailYes){
        check('постройка: детальная карточка', true, bid);
        detailYes.click();
        await waitFor(() => buildPhase === 'confirm' && !!$('#btn-build-confirm-yes'));
      } else {
        // нажали встроенную кнопку «Построить» — детальная карточка не нужна
        check('постройка: детальная карточка', buildPhase === 'confirm',
          buildPhase === 'confirm' ? 'кнопка «Построить» ведёт сразу к подтверждению' : 'нет детализации');
      }
      check('постройка: подтверждение', buildPhase === 'confirm' && !!$('#btn-build-confirm-yes'), bid);
      return true;
    }
    return false;
  }

  // ---- проход одногорода ----------------------------------------------------
  async function playRod(name, estate, buy){
    const made = await ensureRod(name, estate);
    check(`создание рода «${name}»`, !!made || !!rodOf(name));
    await waitFor(() => !!rodOf(name));

    currentRod = name;
    role = 'rod';
    buildPhase = 'choose';
    buildResultInfo = null;
    buildSelId = null;
    buildConfirmingId = null;
    detailBuildingId = null;
    detailSource = null;
    render();

    let guard = 0;
    let sawBuildResult = false;
    while(guard++ < 160){
      await idle();
      const r = rodOf(name);
      if(!r) { check('род исчез из базы', false); return; }
      const idx = r.progress;
      const ev = state.events[idx];
      if(!ev){ check(`событие ${idx} не найдено`, false); return; }
      if(ev.final){
        check(`финал «${name}»: экран завершения`, !$('#btn-next-event') && document.getElementById('app').innerText.includes('Игра завершена'));
        return;
      }

      if(await handleBuild(name, ev, buy)){ continue; }

      if($('#btn-ack-reveal')){
        const evId = $('#btn-ack-reveal').dataset.ev;
        await clickAndWait('#btn-ack-reveal', () => !!rodOf(name).seenReveal[evId], ` итоги глобального события ${evId}`);
        continue;
      }
      if($('.btn-ack-arrival')){
        const b = $('.btn-ack-arrival');
        const key = b.dataset.ev + ':' + b.dataset.idx;
        await clickAndWait('.btn-ack-arrival', () => !!rodOf(name).seenArrivalBonus[key] || !!rodOf(name).seenArrivalBonus[b.dataset.ev], ` бонус прибытия ${ev.id}`);
        continue;
      }
      if($('#btn-rumor-continue')){
        await clickAndWait('#btn-rumor-continue', () => !!rodOf(name).seenRumors[ev.id], ` слухи ${ev.id}`);
        continue;
      }

      if(ev.type === 'assembly'){
        if(!(state.releasedAssemblies || {})[ev.id]){
          await dbSet('releasedAssemblies/' + ev.id, true);
          await waitFor(() => (state.releasedAssemblies || {})[ev.id]);
        }
        await idle();
        const gateBtn = $('#btn-next-event');
        if(!gateBtn){ check(`ворота ${ev.id}: кнопка «Далее»`, false); return; }
        gateBtn.click();
        if(!await waitFor(() => progressed(name, idx), 5000)){
          check(`ворота ${ev.id}: переход`, false); return;
        }
        check(`ворота ${ev.id}: переход на следующий ход`, true);
        continue;
      }

      if(ev.type === 'auction'){
        const auction = (state.auctions || {})[ev.id] || {};
        if(auction.winner){
          await clickAndWait('#btn-next-event', () => progressed(name, idx), `аукцион ${ev.id}: продолжить`);
          continue;
        }
        if($('#btn-submit-bid')){
          const bid = Math.max(1, Math.min(10, rodOf(name).resources.zoloto));
          const input = $('#bid-input');
          if(!input){ check(`аукцион ${ev.id}: поле ставки`, false); return; }
          input.value = String(bid);
          await idle();
          // двойной клик по ставке: списаться должен только один раз
          $('#btn-submit-bid').click(); $('#btn-submit-bid').click();
          const ok = await waitFor(() => ((state.auctions || {})[ev.id] || {}).bids && (state.auctions[ev.id].bids[name] !== undefined));
          check(`аукцион ${ev.id}: ставка принята один раз`, ok);
          continue;
        }
        // ждём/проводим раунд из панели GM
        role = 'gm';
        state.currentIndex = idx;
        render();
        const resolve = $('#btn-resolve-auction');
        if(!resolve){ check(`аукцион ${ev.id}: кнопка решения GM`, false); return; }
        await idle();
        resolve.click();
        await waitFor(() => {
          const a = (state.auctions || {})[ev.id] || {};
          return !!a.winner || !!a.tiedRods;
        });
        role = 'rod';
        currentRod = name;
        render();
        continue;
      }

      // Сюжетные события не имеют вариантов выбора: эффект применяется по «Далее →».
      if(ev.type === 'narrative'){
        const beforeRes = Object.assign({}, r.resources);
        const beforeNat = Object.assign({}, state.national || {});
        await idle();
        const narrBtn = $('#btn-next-event');
        if(!narrBtn){ check(`сюжет ${ev.id}: кнопка «Далее →»`, false, label(ev)); return; }
        narrBtn.click();
        // progress пишется первой транзакцией, эффект — следующей; ждём полного завершения обработчика
        await waitFor(() => busy === true, 1500);
        await idle();
        const narrOk = progressed(name, idx);
        check(`сюжет ${ev.id}: «Далее →» продвинул ровно на 1`, narrOk, label(ev));
        if(narrOk){
          const nowRes = rodOf(name).resources;
          const nowNat = state.national || {};
          const resChanged = ['slava','zoloto','krestyane'].some(k => nowRes[k] !== beforeRes[k]);
          const natChanged = ['stability','centralization'].some(k => nowNat[k] !== beforeNat[k]);
          const declaresRes = !!(ev.effect && Object.keys(ev.effect).length) || !!ev.effectByEstate || !!ev.conditionalEffects;
          const declaresNat = !!ev.nationalEffect || !!ev.nationalSet;
          if(declaresRes){
            check(`сюжет ${ev.id}: показатели изменились`, resChanged,
              `было ${JSON.stringify(beforeRes)}, стало ${JSON.stringify(nowRes)}`);
          } else if(declaresNat){
            check(`сюжет ${ev.id}: общероссийский эффект применён`, true,
              natChanged ? 'стабильность/централизация изменились' : 'уже применён в этой партии');
          } else {
            check(`сюжет ${ev.id}: эффекта нет, только переход`, true);
          }
        }
        continue;
      }

      const answered = ev.type === 'normal' ? (r.answers || {})[ev.id] : (r.votes || {})[ev.id];
      if(!answered){
        const choices = $$('[data-key]');
        if(!choices.length){ check(`выбор ${ev.id}: кнопки вариантов`, false, label(ev)); return; }
        const btn = choices[0];
        const key = btn.dataset.key;
        const choice = (ev.choices || []).find(c => c.key === key);
        const before = Object.assign({}, r.resources);
        await idle();
        // двойной клик: эффект не должен примениться дважды
        btn.click(); btn.click();
        const got = await waitFor(() => {
          const rr = rodOf(name);
          return !!(rr.answers[ev.id] || rr.votes[ev.id]);
        });
        const rr = rodOf(name);
        const rec = (rr.answers && rr.answers[ev.id]) || (rr.votes && rr.votes[ev.id]);
        if(!rec){ check(`выбор ${ev.id}: ответ зафиксирован`, false, label(ev)); continue; }
        const choiceKey = typeof rec === 'string' ? rec : rec.choiceKey;
        check(`выбор ${ev.id}: записан один вариант`, got && choiceKey === key, label(ev));
        if(got && typeof rec === 'object' && rec.outcome && rec.outcome.deltas){
          const d = rec.outcome.deltas;
          const exp = applyEffect(before, d);
          // ответ и ресурсы пишутся разными транзакциями — ждём обновления показателей
          await waitFor(() => ['slava','zoloto','krestyane'].every(k => rodOf(name).resources[k] === exp[k]));
          const now = rodOf(name).resources;
          const okRes = ['slava','zoloto','krestyane'].every(k => exp[k] === now[k]);
          check(`выбор ${ev.id}: показатели изменились ровно по эффекту`, okRes,
            okRes ? '' : `ожд. ${JSON.stringify(exp)}, факт ${JSON.stringify(now)}`);
        }
        if(ev.type === 'global'){
          if(typeof resolveGlobalEvent === 'function') await resolveGlobalEvent(ev);
          await waitFor(() => !!(state.globalResults || {})[ev.id]);
        } else if(ev.type === 'normal'){
          if(typeof resolveMajorityBonus === 'function') await resolveMajorityBonus(ev);
        }
        render();
        continue;
      }

      if($('#btn-next-event')){
        await idle();
        const nextBtn = $('#btn-next-event'); // за idle могли перерисовать экран
        if(!nextBtn) continue;
        nextBtn.click();
        const again = $('#btn-next-event');
        if(again) again.click();
        if(!await waitFor(() => progressed(name, idx))){
          check(`ход ${ev.turn || idx}: «Далее →» продвинул ровно на 1`, false, label(ev)); return;
        }
        const rr = rodOf(name);
        check(`ход ${ev.turn || idx}: «Далее →» продвинул ровно на 1`, rr.progress === idx + 1);
        continue;
      }
      check(`неизвестный экран на ${label(ev)}`, false);
      return;
    }
    check(`проход «${name}»: достигнут финал за 160 шагов`, false, `остановился на ${rodOf(name).progress}`);
  }

  // ---- проверки «не срабатывает дважды» на уровне базы ----------------------
  async function idempotency(){
    const path = 'testFlags/oneShot';
    const a = await dbClaim(path, 'x');
    const b = await dbClaim(path, 'y');
    check('dbClaim: вторая запись не проходит', a === true && b === false);
    await stateRef.child('testFlags').remove();

    const rr = await dbTx('testCounter', cur => (cur || 0) + 1);
    const rr2 = await dbTx('testCounter', cur => (cur || 0) + 1);
    check('dbTx: счётчик увеличен ровно дважды', rr2.value === 2, `значение ${rr2.value}`);
    await stateRef.child('testCounter').remove();
  }

  // ---- проверки кнопок GM --------------------------------------------------
  async function gmButtons(){
    role = 'gm';
    state.currentIndex = 1;
    render();
    await idle();
    await sleep(60);
    check('GM: панель организатора открывается', document.getElementById('app').innerText.includes('Панель организатора'));
    const sortBtns = $$('.sort-tabs button');
    if(sortBtns.length){
      await idle();
      sortBtns[sortBtns.length - 1].click();
      check('GM: сортировка таблицы родов', !!$('.sort-tabs button.active'));
    } else check('GM: сортировка таблицы родов', false, 'нет кнопок');
    const tl = $('.tl-item[data-jump]');
    if(tl){ await idle(); tl.click(); await sleep(60); check('GM: переход по ленте событий', true); }
    else check('GM: переход по ленте событий', false, 'нет пунктов');
    const seating = $('#btn-toggle-seating');
    if(seating){ await idle(); seating.click(); check('GM: кнопка рассадки', !!$('#btn-toggle-seating')); }
    const prev = $('#btn-prev'), next = $('#btn-next');
    if(prev && next){ await idle(); next.click(); await sleep(120); check('GM: кнопки ←/→', true); }
    else check('GM: кнопки ←/→', false);
    role = 'rod';
  }

  // ---- автоматический подсчёт большинства на трёх родах ---------------------
  // В живой игре каждый род голосует на своём устройстве, а ORGANIZATOR (role=gm)
  // получает обновление Firebase и сам подводит итог — без нажатия «Огласить итоги».
  // Проверяем именно этот путь: 2:1 применяет nationalEffect победителя, 1:1:1 — ничего.
  async function majorityAuto(){
    await stateRef.remove();
    await waitFor(() => state && Object.keys(state.rods || {}).length === 0);
    await settle();
    const names = ['МБ-1', 'МБ-2', 'МБ-3'];
    // Повторяем создание: запоздавший снимок может на время убрать род из локального state.
    for(let attempt = 0; attempt < 3; attempt++){
      for(const n of names) if(!rodOf(n)) await ensureRod(n, 'boyare');
      if(await waitFor(() => names.every(n => !!rodOf(n)), 3000)) break;
      await sleep(300);
    }
    await settle();
    const rodsReady = names.every(n => !!rodOf(n));
    check('большинство: созданы три рода', rodsReady,
      names.map(n => `${n}:${!!rodOf(n)}`).join(', '));

    await setNational({stability: 10, centralization: 10});
    await waitFor(() => state.national && state.national.centralization === 10 && state.national.stability === 10);
    // Включаем роль организатора: авто-подсчёт в main.js работает только в ней.
    role = 'gm';
    render();
    await idle();

    const evWin = state.events.find(e => e.id === 'kazan-2');
    const winKey = 'kazan-2-1';   // majorityBonus: centralization +1
    const loseKey = 'kazan-2-3';  // majorityBonus: centralization -1
    const winNat = evWin.choices.find(c => c.key === winKey).majorityBonus.nationalEffect;
    const loseNat = evWin.choices.find(c => c.key === loseKey).majorityBonus.nationalEffect;
    check('большинство: событие с национальным эффектом найдено',
      !!evWin && !!winNat && !!loseNat, `kazan-2 → ${JSON.stringify(winNat)} / ${JSON.stringify(loseNat)}`);

    const baseC = state.national.centralization;
    const baseS = state.national.stability;
    // Первые два голоса — по одному за разных кандидатов: большинства нет.
    await dbSet(`rods/${names[0]}/answers/kazan-2`, {choiceKey: winKey});
    await waitFor(() => !!rodOf(names[0]).answers['kazan-2']);
    await dbSet(`rods/${names[1]}/answers/kazan-2`, {choiceKey: loseKey});
    await waitFor(() => !!rodOf(names[1]).answers['kazan-2']);
    await sleep(200);
    check('большинство: при 1:1 эффект не применяется (ждём третьего рода)',
      !state.majorityBonusResolved['kazan-2'] && state.national.centralization === baseC,
      `централизация ${state.national.centralization}, метка ${JSON.stringify(state.majorityBonusResolved['kazan-2'])}`);

    // Третий голос создаёт большинство 2:1 — итог должен подвестись САМ.
    await dbSet(`rods/${names[2]}/answers/kazan-2`, {choiceKey: winKey});
    const autoOk = await waitFor(() =>
      !!(state.majorityBonusResolved || {})['kazan-2'] && state.national.centralization === baseC + winNat.centralization,
      6000);
    check('большинство: авто-подсчёт сработал без нажатия «Огласить итоги»', autoOk,
      `метка ${JSON.stringify(state.majorityBonusResolved['kazan-2'])}, централизация ${state.national.centralization}`);
    check('большинство: победивший вариант зафиксирован',
      (state.majorityBonusResolved['kazan-2'] || {}).majorityKey === winKey,
      `ожд. ${winKey}, факт ${(state.majorityBonusResolved['kazan-2'] || {}).majorityKey}`);
    check('большинство: применён эффект победителя, а не меньшинства',
      state.national.centralization === baseC + winNat.centralization &&
      state.national.centralization !== baseC + loseNat.centralization,
      `centralization ${baseC} → ${state.national.centralization}; победитель ${winNat.centralization}, меньшинство ${loseNat.centralization}`);
    check('большинство: чужие показатели не тронуты', state.national.stability === baseS,
      `стабильность ${baseS} → ${state.national.stability}`);

    // Повторный подсчёт не должен удвоить эффект.
    const beforeRepeat = state.national.centralization;
    await resolveMajorityBonus(evWin);
    await sleep(150);
    check('большинство: повторный подсчёт не применяет эффект дважды',
      state.national.centralization === beforeRepeat,
      `было ${beforeRepeat}, стало ${state.national.centralization}`);

    // Равенство 1:1:1 — большинства нет, национальные показатели не меняются.
    const evTie = state.events.find(e => e.id === 'sudebnik-4');
    const tieKeys = evTie.choices.slice(0, 3).map(c => c.key);
    const baseC2 = state.national.centralization;
    const baseS2 = state.national.stability;
    for(let i = 0; i < 3; i++) await dbSet(`rods/${names[i]}/answers/sudebnik-4`, {choiceKey: tieKeys[i]});
    const tieOk = await waitFor(() => !!(state.majorityBonusResolved || {})['sudebnik-4'], 6000);
    check('большинство: при 1:1:1 итог подведён, но большинства нет',
      tieOk && (state.majorityBonusResolved['sudebnik-4'] || {}).majorityKey === 'none',
      `метка ${JSON.stringify(state.majorityBonusResolved['sudebnik-4'])}`);
    check('большинство: при равенстве национальные показатели не изменились',
      state.national.centralization === baseC2 && state.national.stability === baseS2,
      `centralization ${baseC2} → ${state.national.centralization}, stability ${baseS2} → ${state.national.stability}`);

    role = 'rod';
  }

  // ---- запуск ---------------------------------------------------------------
  async function run(){
    if(running) return;
    running = true;
    flush();
    try {
      if(!await prepare()) return;
      await idempotency();
      await ensureRod('ТЕСТ-БОЯРЕ', 'boyare');
      await ensureRod('ТЕСТ-ДВОРЯНЕ', 'dvoryane');
      await waitFor(() => Object.keys(state.rods || {}).length === 2);
      await gmButtons();
      // один род покупает здания, другой пропускает окна — проверяем оба пути
      await playRod('ТЕСТ-БОЯРЕ', 'boyare', true);
      await playRod('ТЕСТ-ДВОРЯНЕ', 'dvoryane', false);
      const r1 = rodOf('ТЕСТ-БОЯРЕ'), r2 = rodOf('ТЕСТ-ДВОРЯНЕ');
      const finalIdx = state.events.length - 1;
      check('итог: оба рода дошли до финала', r1 && r2 && r1.progress === finalIdx && r2.progress === finalIdx,
        r1 && r2 ? `${r1.progress}/${finalIdx}, ${r2.progress}/${finalIdx}` : 'нет рода');
      check('итог: рейтинг и итоги по родам считаются', typeof finalRanking === 'function' && typeof finalBestRod === 'function');
      // Отдельный блок: три рода и автоматический подсчёт большинства.
      await majorityAuto();
    } catch(e){
      check('непредвиденная ошибка теста', false, String(e && e.stack || e));
    } finally {
      running = false;
      window.__E2E_RESULT = {
        total: results.length,
        failed: results.filter(r=>!r.ok),
        ok: results.every(r=>r.ok)
      };
      flush();
    }
  }

  window.__E2E_RUN = run;
  window.__E2E_MAJORITY = majorityAuto;
  const start = async () => {
    for(let i=0;i<200 && !(state && state.events && state.events.length); i++) await sleep(50);
    if(new URLSearchParams(location.search).get('only') === 'majority'){
      running = true;
      flush();
      try { await majorityAuto(); }
      catch(e){ check('непредвиденная ошибка теста большинства', false, String(e && e.stack || e)); }
      finally {
        running = false;
        window.__E2E_RESULT = {total: results.length, failed: results.filter(r=>!r.ok), ok: results.every(r=>r.ok)};
        flush();
      }
    } else await run();
  };
  start();
})();
