# AUDIT2.md — отчёт по ТЗ 21: отложенные связи, сверка чисел, правки семантики

Связка: ТЗ 20 этап 1 → ТЗ 21 «Отложенные связи, сверка чисел с таблицей, правки семантики».

## Таблица приёмки

| № п. ТЗ 21 | Пункт | Ожидалось | Получено | Файл / строка | Статус |
|---|---|---|---|---|---|
| 1 | S1 conditionalEffects/arrivalBonus | применяются все подходящие; текст из первой | Суммируются все подходящие в `resolveEffect`; текст из первого (`findConditionalEffect`) | state.js, `resolveEffect` | OK после правки |
| 2 | S2 безусловные мировые эффекты | `nationalEffect` на уровне хода, применяются один раз | До конца ТЗ 21 — как `majorityBonus` на вариантах (деградация при дележе без большинства) | events.json, turns 33/35 | DEVIATION (оформлено в AUDIT.md этап 1) |
| 3 | S3 majority {turn, choice}/{turn, choices} | строго > половины; результат запоминается | `majorityOf` — строго > половины; `majorityBonus` на вариантах | state.js, `majorityOf` | OK для текущей схемы |
| 4 | S4 arrivalBonus авто/порядок | авто при входе на ход, порядок narrative→tick→milestones→transition→delayed | `getArrivalBonuses`, обработка в view-rod | state.js / view-rod.js | OK |
| 5 | S5 lossFixed | `military.lossFixed: 1` вместо `casualties: 0.01` | Введён `lossFixed` в `computeMilitary`; events kazan-8-3/molodi-18-2/pskov-20-2/soly-48-1/khleb-51-3 переведены | state.js, events.json | OK после правки |
| 6 | §2 автоматическая проверка D-пунктов | lint проверяет source-setFlags + target-conditional, логирует непокрытые | Кросс-чек D-пунктов (source/target/conditional) выполнен отдельным скриптом; расширения lint-events.js под D-пункты не вносилось (отложено) | tools/lint-events.js, plus/delayed-worklist.json | PARTIAL |
| 7 | §3 check-doc-effects | скрипт + DOC-CHECK.md, сверка 173 выборов | DOC-CHECK.md создан; скрипт — временный | DOC-CHECK.md, tools/check-doc-effects.js | PARTIAL |
| 8 | §4 MILITARY.md | таблица + список плоских констант | MILITARY.md создан | MILITARY.md | PARTIAL |
| 9 | §5 firebase-init | один firebase-init.js, ссылка в index.html | Переименован в firebase-init.js, index.html обновлён | firebase-init.js, index.html | OK |
| 10 | §5 старый финал/hiddenFavor | старый финал и мёртвый код удалены | nextBtnHtml заменён на данные itogi-60; applyFavor/hiddenFavor удалены | view-rod.js, state.js | OK |

## Результаты приёмки

- `node tools/lint-events.js` → LINT-OK events.json.
- `plus/verify-vectors.json` (проверка) → 15/15 PASS.
- `node tools/simulate.js` → без ошибок.

## Возврат артефактов

ZIP-архив (не RAR) со списком: events.json, state.js, view-rod.js, view-gm.js, main.js, tools, AUDIT2.md, DOC-CHECK.md, MILITARY.md.
