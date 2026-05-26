# Agent Sam Vite Code Battle

- Run ID: `vite_battle_20260525_124034`
- Created: `2026-05-25T12:45:29.901888+00:00`
- Rows: `5`
- Passed: `0`
- Estimated cost: `$0.095149`

## Ranking

| rank | contestant | type | passed | build | score | quality | ms | in | out | cost | app |
|---:|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---|
| 1 | `solo_gpt-5.4-mini` | `solo` | 0 | 0 | 0.685 | 1.000 | 31943 | 373 | 5439 | $0.010971 | `/Users/samprimeaux/inneranimalmedia/.agentsam_evals/vite_battle_20260525_124034/solo_gpt-5.4-mini/app` |
| 2 | `solo_gpt-5.3-codex` | `solo` | 0 | 0 | 0.685 | 1.000 | 44023 | 373 | 4346 | $0.043926 | `/Users/samprimeaux/inneranimalmedia/.agentsam_evals/vite_battle_20260525_124034/solo_gpt-5.3-codex/app` |
| 3 | `solo_gpt-5.4-nano` | `solo` | 0 | 0 | 0.000 | 0.000 | 42712 | 373 | 6500 | $0.002619 | `/Users/samprimeaux/inneranimalmedia/.agentsam_evals/vite_battle_20260525_124034/solo_gpt-5.4-nano/app` |
| 4 | `tagteam_5_4_mini_plus_5_4_nano` | `tagteam` | 0 | 0 | 0.000 | 0.000 | 64983 | 4542 | 10310 | $0.010527 | `/Users/samprimeaux/inneranimalmedia/.agentsam_evals/vite_battle_20260525_124034/tagteam_5_4_mini_plus_5_4_nano/app` |
| 5 | `tagteam_codex_plus_5_4_mini_plus_5_4_nano` | `tagteam` | 0 | 0 | 0.000 | 0.000 | 102204 | 8724 | 14031 | $0.027106 | `/Users/samprimeaux/inneranimalmedia/.agentsam_evals/vite_battle_20260525_124034/tagteam_codex_plus_5_4_mini_plus_5_4_nano/app` |

## Notes

- `validation_score` heavily rewards files present and successful `npm run build`.
- `quality_score` checks for required pages, model names, routing metrics, alpha/beta, styling, and responsive CSS.
- Tagteams are measured as one composite row plus per-call metrics inside `calls_json`.
