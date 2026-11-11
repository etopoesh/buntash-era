# AUDIT.md — «Бунташный век», ТЗ 20, этап 1 (явные поломки и неточности)

Документ фиксирует ход исправлений по ТЗ 20 «Этап 1»: что сделано, что отклонено от ТЗ, какие
данные не менялись и какие вопросы остались к владельцу проекта.

## 1. Итог этапа

По ТЗ 20 этап 1 выполнены:

1. Движок `state.js` приведён к схеме, согласованной с `plus/verify-vectors.json` (R1–R14):
   эффекты, посул, военный расчёт, сословный merge, majority, пороги знатности, тик экономики,
   доход с жизненным циклом, финальный ранжинг/вердикт.
2. `events.json` перестроен из 62 записей в целевые 64 (gate; ходы 1–25; gate; ходы 26–42;
   gate; ходы 43–60; gate final). Добавлены ход 1 (sobor-1), ход 60 (itogi-60); ход 17
   (staritsky-17) переведён в narrative; ход 29 (shuisky-trial-1605) — в normal.
3. Ходы 1–59 перегружены механиками из docx (эффекты, majorityBonus, income, bribe, military,
   effectByEstate, conditionalEffects, casualtyReduction).
4. Тексты событий очищены от механики (запрет паттернов) и поданы как narrative.
5. Добавлены вводы по сословиям для gate-события начала игры (assembly-start introByEstate).
6. `tools/lint-events.js` переписан; `tools/simulate.js` обновлён; проверочный скрипт
   `plus/verify-vectors.json` прогнан — все группы PASS.

## 2. Таблица проверок (п. 1.2–5 ТЗ)

| № п. ТЗ | Ожидалось | Получено | Файл / строка | Статус | Что исправлено |
|---|---|---|---|---|---|
| 1.1 | events.json — ожидаемая структура | 64 записи, gate; ходы 1–25; gate; ходы 26–42; gate; ходы 43–60; gate final; типы gate 4 / narrative 3 / normal 57 | `events.json` (массив из 64) | OK | Реструктуризация (batches `_tmp_restructure.js`, `_tmp_map*.js`): gates 0/26/44/63, final на последней; sobor-1, itogi-60; staritsky-17 → narrative; shuisky-trial-1605 → normal |
| 1.2 | Количество, порядок, типы | 64 / [0,26,44,63] / [1,25], [27,43], [45,62] / narrativeTurns 17,23,60 | `events.json`, `plus/verify-vectors.json` | OK | eventsLint теперь зелёный |
| 1.3 | Расчёты расходятся | все группы vec PASS (state.js: R1–R14) | `state.js`, `plus/verify-vectors.json` | OK | military/income/bribe/estateMerge/majority/milestones/tick/flight/soulsFloor/finality — PASS |
| 2 | Тексты без механики | 0 нарушений запретных паттернов | `events.json`, `tools/lint-events.js` | OK | Чистка outcomeText/description/label/narrative/outcomeTitle/outcomeTextOverride |
| 3 | Линтер events.json | LINT-OK | `tools/lint-events.js` | OK | Переписан по ТЗ 5 + vec; падает с понятным списком |
| 4 | Линтер events.json | LINT-OK | `tools/lint-events.js` | OK | Финальная версия: total, gate-индексы, turnRanges, narrativeTurns, типы, id, choices, тексты, flags, majority, effect-ключи, final gate |
| 5 | Формат AUDIT.md | таблица + неизменённые + вопросы | `AUDIT.md` | OK | Настоящий документ |

## 3. Результат прогона линтера до и после правок

**До (состояние перед реструктуризацией `events.json`, старый `tools/lint-events.js` и данные из 62 записей):**

```
LINT-ERRORS 1
ERROR eventsLintTotal: ожидалось 64 записей, найдено 62
```

Дополнительно группа eventsLint в `plus/verify-vectors.json` через check-скрипт падала:
`FAIL eventsLint :: total=62 gates=[0,28,31,61] narr=[ign-23:undefined] normals=56 rangesOk=false`.

**После (финальные `tools/lint-events.js` + перестроенный `events.json`):**

```
LINT-OK events.json
```

`plus/verify-vectors.json` (проверка `eventsLint` через check-скрипт): `SUMMARY failed=0 of 15` —
все группы PASS.

## 4. Девиации от ТЗ (оформлены в AUDIT, не молча)

1. **Схема `effectByEstate`** — ТЗ не фиксировал точную форму; по вектору `estateMerge`
   (п. «EstateMerge») эффект сословия — плоский объект с опциональным ключом `text`:
   `{slava: 1, text: "…"}`, а сословный доход — как ключ `income` внутри него.
   В `state.js`/`view-rod.js`/`events.json` реализовано это.
2. **`conditionalEffects`** — расширение схемы: условие (`requiresFlag`, `requiresEstate`,
   `minSlava`, default), `text`, `outcomeTextOverride`, `outcomeTitleOverride`; первый подходящий
   элемент имеет приоритет, условие без условий — значение по умолчанию.
3. **`resolveMajorityBonus(ev, {force})`** — во view-gm для принудительного пересчёта при финальном
   соборе; логика приведена к ТЗ (строгое большинство → nationalEffect).
4. **«Самый популярный выбор»** — в ТЗ обозначен как «plurality»; в движке реализовано через
   строгое большинство (`majorityBonus` на победивший выбор).
5. **Идиома «+1 знатность за каждого выставленного холопа + N»** — реализовано как шкала
   `scale: [{by:'fielded', every:1, effect:{slava:1}}]` + плоский `effect.slava = N` (N — от
   чина/льготы командира).
6. **«− 1 боевой холоп»** — заменено на `casualties: 0.01` (lost = max(1, round(…)) = 1).
7. **Безусловные мировые эффекты** (ходы 33/35: «−2 централизация» для всех вариантов) — зафиксированы
   как одинаковые `majorityBonus` на все варианты (победитель применяет).
8. **Доступность военной ветки narrative** — `staritsky-17` (ход 17): военная ветка
   (`requiresFlag: oprichnik`) теперь рендерится и применяется через `computeMilitary` с
   `casualtyReduction` рода.

## 5. Список вещей, решённых не менять в рамках этапа 1

- **§7 ТЗ (следующий этап)** — не реализовано (торги за титул, постройки, интриги, экономика).
- **Метка ресурсов** — в `view-rod.js` значение `slava` подписано как «Царская милость» (label-вариант).
  Было заменено на «Знатность» по решению владельца (см. §7, вопрос 1). GM-панель (`view-gm.js`):
  заголовок/сорт/ручная правка переведены на «Знатность»; milestone-строка в `view-rod.js`
  (turn summary) также переведена. state.js несёт эталонную метку `slava:'Знатность'`.
  Решено оставить как есть — вопрос к владельцу (см. §7).
- **`firebase-init (1).js`** — подключение во front `index.html` оставлено без правок; файл
  изменён вне зоны ТЗ.

## 6. Связи delayed-links.csv: проверка по событиям

Проверено **36** связей из `plus/delayed-links.csv` против `events.json`.

- **Реализовано (дизайн-замётки):** `Ход 16 → Ход 17`, `Ход 16 → Ход 23`, `Ход 21 → Ход 23`,
  `Ход 24 → Ход 25`, `Ход 29 → Ход 30`.
- **Не реализовано на этапе 1** (список отсутствующих связей для этапа 2):

```
Ход 1 → Ход 4; Ход 1 → Ход 4 → Ход 6; Ход 2 → Ход 8; Ход 3 → Ход 10; Ход 5 → Ходы 8 и 10;
Ход 6 → Ход 8; Ход 7 → Ходы 8 и далее; Ход 8 → Ход 10; Ход 9 → Ход 10; Ход 11 → Ход 12;
Ход 12 → Ход 15; Ход 13 → Ход 14; Ход 13 → Ход 17; Ход 15 → Ход 16; Ход 19 → Ход 20;
Ход 22 → Ход 23; Ход 34 → Ход 46; Ход 35 → Ход 36; Ход 36 → Ход 37; Ход 37 → Ход 38;
Ход 38 → Ход 39; Ход 40 → Ход 41; Ход 41 → Ход 42; Ход 44 → Ход 45; Ход 48 → Ход 49;
Ход 50 → Ход 52; Ход 52 → Ход 56; Ход 55 → Ход 56; Ход 56 → Ход 58; Ход 58 → Ход 59;
Ход 56 и Ход 6 → Ход 60
```

(итого: 31 не реализованная связь; 36 проверено — 5 уже заложены в data).

## 7. Вопросы к владельцу проекта

1. Метка ресурса `slava` в интерфейсе — «Царская милость» (view-rod.js, res-pill). **Решено пользователем
   12.11.2026: заменено на «Знатность»** (view-rod.js res-pill, view-gm.js сортировка/заголовок/ручная
   правка, view-rod.js milestone-строка). Вопрос закрыт.
2. `firebase-init (1).js` в `index.html` — подключение Firebase не из ТЗ; оставлено без правок.
3. Оставлено не реализованным: ~31 связь из delayed-links (см. §6) — фиксируются в отчёте,
   реализация переносится в следующий этап по ТЗ §7.

## 8. Файлы этапа 1

- `events.json` — 64 события, механики ходов 1–59.
- `state.js` — движок (R1–R14).
- `view-rod.js` — экран рода, narrative-военная ветка, outcome.
- `view-gm.js` — финальный собор, force recount.
- `tools/lint-events.js` — линтер (final).
- `tools/simulate.js` — симулятор (обновлён).
- `plus/verify-vectors.json`, `plus/delayed-links.csv` — эталон и сверка.
- `AUDIT.md` — настоящий документ.

## 9. Файлы плюса: delayed-worklist.json и doc-effects.json

Появились рабочие файлы из `plus/` (от мной, в рамках сверки с таблицей команды):

- `plus/delayed-worklist.json` — рабочий список отложенных последствий (sourceSideItems 48,
  targetSideItems 3). Дизайн-метки вида `tNNcK` (номер хода и варианта источника) связаны с
  внутренними флагами движка (`setFlags` у источника → условия у цели).
- `plus/doc-effects.json` — файл для сверки чисел с таблицей команды: 173 записи выбора с полями
  `immediate` (common/dvoryane/boyare/skipped) и тегами (`bribe`, `income`, `scale`, `casualties`,
  `penalty`, `delayed-in-target`).

Сверка delayed-worklist → events.json:

- Все design-метки источников связываются с событием соответствующего хода; те, у кого источник —
  narrative (например, дизайн `t23c1` → ход 23 `ign-23`), вариантная постановка меток в `setFlags`
  невозможна — последствия учитывались через narrative-ветки.
- Условия у цели для design-флагов `t24c1`/`t24c2` (`uglich-signed`/`uglich-demanded`) найдены в
  `conditionalEffects` у `godunov-25-1` — связь «ход 24 → ход 25» рабочий.
- Итог: 48 source-пунктов и 3 target-пункта сверены; расхождений, блокирующих этап 1, не выявлено.

Сверка doc-effects → events.json: структура (173 выбора, теги) использована для сверки чисел;
детальная сверка `plain` против `effect`+`effectByEstate` на этапе 1 выполнялась выборочно —
полный автоматический разбор не входит в зону ТЗ, итогы оформлены в отчёте.
