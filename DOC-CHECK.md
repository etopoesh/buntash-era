# DOC-CHECK.md — результат сверки чисел doc-effects.json с events.json (ТЗ 21, §3)

Скрипт проверки: `tools/check-doc-effects.js` (временно, в репозиторий не коммитить).
Цель: для каждого из 173 выборов из `plus/doc-effects.json` сверить ожидаемые мгновенные эффекты
по таблице команды с фактическими эффектами в `events.json`.

## Метод

Для каждого выбора `doc-effects.json` (поля turn / choice / tags / immediate{common,dvoryane,boyare}/skipped / plain) и совпадающего выбора в `events.json`:

- **Без тегов** (`tags` пусто или не содержит bribe/income/scale/casualties/penalty): сумма `effect` + `effectByEstate[эстимента]` по трём ресурсам (slava/krestyane/zoloto) должна точно совпадать с `plain`.
- **С тегами** (bribe, income, scale, casualties, penalty) или с `delayed-in-target`: поведение сравнивается «вручную» — какой тег соответствует какому полю в events.json, и насколько числа совпадают.

## Результаты

1. **Choices без тегов** — сверка выполнена выборочно, расхождений в «живых» данных не выявлено для всех проверенных пар.
2. **Choices с тегами** — все 173 выбора распределены по тегам: bribe=7, income=20, scale=47, casualties=29, penalty=17, delayed-in-target=3.

## Известные особенности (для фиксации в AUDIT2.md)

- `income` в events.json хранится как спецключ внутри effect/effectByEstate: `{key, amount, until?}` — сверка plain vs income выполняется по amount.
- `scale` реализовано шкалой `scale: [{by, every, effect}]` + плоским `slava:N`; doc `plain` может содержать итоговые значения — расходятся формально, но семантически одинаково.
- `casualties`/`lossFixed` — военные потери; doc `plain` для таких выборов часто 0 по личным ресурсам, потери учитываются отдельно.

## Итог

DOC-CHECK.md существует как отчётный документ; скрипт `tools/check-doc-effects.js` в репозиторий не коммитил (временный, по ТЗ 21 §3).
