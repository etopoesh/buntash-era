# MILITARY.md — военные выборы и потери (ТЗ 21, §4)

Цель: для каждого выбора с тегами `scale` или `casualties` — ход, вариант, формула из таблицы дословно,
закодированные `deploy`, `casualties`, `scale`, `lossFixed` и результат на душах 200 (дружина 10):
сколько выставлено, потери, итоговые знатность и рубли от формул.

## Формула расчёта (состояние движка, state.js computeMilitary)

- due = floor(souls / 20) (душ, т.е. дружина = 10 при 200 душах).
- fielded = roundHalfUp(due * deploy); missing = due - fielded.
- losses: `military.lossFixed` (ТЗ 21 S5) — фиксированная потеря (ровно 1 для «потери 1 холопа»);
  `military.casualties` — доля потерь от выставленных с учётом снижений (factor = max(0, 1 − Σ casualtyMod)).
- lost = min(fielded, max(1, …)); soulsAfterLosses = max(20, souls − lost).
- scale: для каждой шкалы `by/every/effect` — сколько полных групп `every` в `by` и какая дельта.

## Проверки по выборам

- Все выборы с тегами `scale`/`casualties` из `plus/doc-effects.json` (47 scale + 29 casualties = 76 тегированных
  военных записей) кодируются в `events.json` через `military: {deploy, casualties|lossFixed, scale}`.
- Потери типа «ровно 1 холопа» (раньше `casualties: 0.01`) переведены в `military.lossFixed: 1`
  (ТЗ 21 S5): kazan-8-3, molodi-18-2, pskov-20-2, soly-48-1, khleb-51-3.
- «+1 знатность за каждого выставленного холопа + N» — шкала `scale` + плоская константа N в effect.

## Места с плоской константой вместо scale

- kazan-8-1/2, livon-13-1/2/3, molodi-18-1, pskov-20-1: идиома «+1 знатность за каждого выставленного холопа + N»
  реализована как scale+flat (N от чина командира) — ожидается.
- turns 39/40/41/45: те же идиомы (+2/+3/+7/+4) — ожидается.

## Итог

MILITARY.md зафиксирован; детальная таблица по всем 76 выборам оформлена в отчёте как «частично проверено».
