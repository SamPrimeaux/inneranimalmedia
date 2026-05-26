# Agent Sam GPT Dynamic Thompson Eval

- Run ID: `agentsam_eval_20260525_123232`
- Created: `2026-05-25T12:35:10.660893+00:00`
- Rows: `33`
- Passed: `31`
- Failed: `2`
- Estimated cost: `$0.052974`
- Artifact dir: `/Users/samprimeaux/inneranimalmedia/.agentsam_evals/agentsam_eval_20260525_123232`

## Models

- `gpt-5.4-mini`
- `gpt-5.3-codex`
- `gpt-5.4-nano`
- `gpt-4.1-mini`
- `gpt-4.1-nano`
- `gpt-4.1`
- `gpt-5.4`
- `o4-mini`
- `gpt-3.5-turbo`
- `gpt-3.5-turbo-0125`
- `gpt-3.5-turbo-1106`
- `gpt-3.5-turbo-16k`

## Tasks

- `simple_router` → `orchestrator` / `simple_router`
- `d1_audit` → `d1-auditor` / `d1_audit`
- `code_review` → `code-reviewer` / `code_review`
- `spawn_contract` → `implementer` / `spawn_contract`
- `validation_gate` → `implementer` / `post_write_validation`

## Model Summary

| model | runs | pass rate | avg ms | input tok | output tok | est cost |
|---|---:|---:|---:|---:|---:|---:|
| `gpt-4.1` | 5 | 100.0% | 3036 | 327 | 1559 | $0.013126 |
| `gpt-4.1-mini` | 5 | 100.0% | 6721 | 327 | 1885 | $0.003147 |
| `gpt-4.1-nano` | 5 | 100.0% | 2553 | 327 | 1479 | $0.000624 |
| `gpt-5.3-codex` | 5 | 80.0% | 7057 | 322 | 2030 | $0.020702 |
| `gpt-5.4` | 3 | 66.7% | 5670 | 200 | 1028 | $0.010530 |
| `gpt-5.4-mini` | 5 | 100.0% | 4772 | 322 | 1963 | $0.004006 |
| `gpt-5.4-nano` | 5 | 100.0% | 3985 | 322 | 2054 | $0.000838 |

## Raw Rows

| model | task | passed | ms | in | out | cost | output |
|---|---|---:|---:|---:|---:|---:|---|
| `gpt-5.4-mini` | `simple_router` | 1 | 2391 | 48 | 28 | $0.000068 | `/Users/samprimeaux/inneranimalmedia/.agentsam_evals/agentsam_eval_20260525_123232/outputs/obs_4a59b893b72182dbd002.txt` |
| `gpt-5.4-mini` | `d1_audit` | 1 | 4322 | 69 | 435 | $0.000887 | `/Users/samprimeaux/inneranimalmedia/.agentsam_evals/agentsam_eval_20260525_123232/outputs/obs_93460348d7199b783e18.txt` |
| `gpt-5.4-mini` | `code_review` | 1 | 6359 | 83 | 500 | $0.001021 | `/Users/samprimeaux/inneranimalmedia/.agentsam_evals/agentsam_eval_20260525_123232/outputs/obs_4f41c09410700e3782db.txt` |
| `gpt-5.4-mini` | `spawn_contract` | 1 | 3836 | 65 | 500 | $0.001016 | `/Users/samprimeaux/inneranimalmedia/.agentsam_evals/agentsam_eval_20260525_123232/outputs/obs_898f898db9dc0962ffd8.txt` |
| `gpt-5.4-mini` | `validation_gate` | 1 | 6953 | 57 | 500 | $0.001014 | `/Users/samprimeaux/inneranimalmedia/.agentsam_evals/agentsam_eval_20260525_123232/outputs/obs_5fb51f4fad5c1f99f6e5.txt` |
| `gpt-5.3-codex` | `simple_router` | 1 | 1561 | 48 | 30 | $0.000360 | `/Users/samprimeaux/inneranimalmedia/.agentsam_evals/agentsam_eval_20260525_123232/outputs/obs_4f29ef2c71aa15b5956c.txt` |
| `gpt-5.3-codex` | `d1_audit` | 0 | 6048 | 69 | 500 | $0.005086 | `/Users/samprimeaux/inneranimalmedia/.agentsam_evals/agentsam_eval_20260525_123232/outputs/obs_653c67055b1563cb1e35.txt` |
| `gpt-5.3-codex` | `code_review` | 1 | 9424 | 83 | 500 | $0.005104 | `/Users/samprimeaux/inneranimalmedia/.agentsam_evals/agentsam_eval_20260525_123232/outputs/obs_4ab56cb54c480f4a8ee2.txt` |
| `gpt-5.3-codex` | `spawn_contract` | 1 | 11305 | 65 | 500 | $0.005081 | `/Users/samprimeaux/inneranimalmedia/.agentsam_evals/agentsam_eval_20260525_123232/outputs/obs_a9f5403c1680d401adc8.txt` |
| `gpt-5.3-codex` | `validation_gate` | 1 | 6948 | 57 | 500 | $0.005071 | `/Users/samprimeaux/inneranimalmedia/.agentsam_evals/agentsam_eval_20260525_123232/outputs/obs_88a61f1d4d680013c949.txt` |
| `gpt-5.4-nano` | `simple_router` | 1 | 1664 | 48 | 54 | $0.000024 | `/Users/samprimeaux/inneranimalmedia/.agentsam_evals/agentsam_eval_20260525_123232/outputs/obs_590289141188b6e99528.txt` |
| `gpt-5.4-nano` | `d1_audit` | 1 | 4228 | 69 | 500 | $0.000203 | `/Users/samprimeaux/inneranimalmedia/.agentsam_evals/agentsam_eval_20260525_123232/outputs/obs_0aa34179e641bc4ebbca.txt` |
| `gpt-5.4-nano` | `code_review` | 1 | 4134 | 83 | 500 | $0.000204 | `/Users/samprimeaux/inneranimalmedia/.agentsam_evals/agentsam_eval_20260525_123232/outputs/obs_ead37057b289bdeb3a89.txt` |
| `gpt-5.4-nano` | `spawn_contract` | 1 | 5793 | 65 | 500 | $0.000203 | `/Users/samprimeaux/inneranimalmedia/.agentsam_evals/agentsam_eval_20260525_123232/outputs/obs_27010398075ef861783e.txt` |
| `gpt-5.4-nano` | `validation_gate` | 1 | 4109 | 57 | 500 | $0.000203 | `/Users/samprimeaux/inneranimalmedia/.agentsam_evals/agentsam_eval_20260525_123232/outputs/obs_f22f5045691095bd5205.txt` |
| `gpt-4.1-mini` | `simple_router` | 1 | 1758 | 49 | 40 | $0.000084 | `/Users/samprimeaux/inneranimalmedia/.agentsam_evals/agentsam_eval_20260525_123232/outputs/obs_ab18c8a2c51f841011a4.txt` |
| `gpt-4.1-mini` | `d1_audit` | 1 | 6066 | 70 | 500 | $0.000828 | `/Users/samprimeaux/inneranimalmedia/.agentsam_evals/agentsam_eval_20260525_123232/outputs/obs_0af82a312e1697760fe8.txt` |
| `gpt-4.1-mini` | `code_review` | 1 | 6957 | 84 | 473 | $0.000790 | `/Users/samprimeaux/inneranimalmedia/.agentsam_evals/agentsam_eval_20260525_123232/outputs/obs_5c95742826fb3bc19612.txt` |
| `gpt-4.1-mini` | `spawn_contract` | 1 | 11243 | 66 | 500 | $0.000826 | `/Users/samprimeaux/inneranimalmedia/.agentsam_evals/agentsam_eval_20260525_123232/outputs/obs_6f13a9d235f0069625cb.txt` |
| `gpt-4.1-mini` | `validation_gate` | 1 | 7584 | 58 | 372 | $0.000618 | `/Users/samprimeaux/inneranimalmedia/.agentsam_evals/agentsam_eval_20260525_123232/outputs/obs_7cfe577378a224bb592b.txt` |
| `gpt-4.1-nano` | `simple_router` | 1 | 1834 | 49 | 39 | $0.000021 | `/Users/samprimeaux/inneranimalmedia/.agentsam_evals/agentsam_eval_20260525_123232/outputs/obs_5430d0614c745479c86a.txt` |
| `gpt-4.1-nano` | `d1_audit` | 1 | 2879 | 70 | 271 | $0.000115 | `/Users/samprimeaux/inneranimalmedia/.agentsam_evals/agentsam_eval_20260525_123232/outputs/obs_86f4a7edfbb2e6433c6d.txt` |
| `gpt-4.1-nano` | `code_review` | 1 | 2551 | 84 | 266 | $0.000115 | `/Users/samprimeaux/inneranimalmedia/.agentsam_evals/agentsam_eval_20260525_123232/outputs/obs_d18b8a214ad825b3a1fd.txt` |
| `gpt-4.1-nano` | `spawn_contract` | 1 | 2768 | 66 | 500 | $0.000207 | `/Users/samprimeaux/inneranimalmedia/.agentsam_evals/agentsam_eval_20260525_123232/outputs/obs_ddc53844c652594269aa.txt` |
| `gpt-4.1-nano` | `validation_gate` | 1 | 2737 | 58 | 403 | $0.000167 | `/Users/samprimeaux/inneranimalmedia/.agentsam_evals/agentsam_eval_20260525_123232/outputs/obs_717ad8b5a9cb9c7db7b0.txt` |
| `gpt-4.1` | `simple_router` | 1 | 876 | 49 | 36 | $0.000386 | `/Users/samprimeaux/inneranimalmedia/.agentsam_evals/agentsam_eval_20260525_123232/outputs/obs_7910d9b011646d4dce3c.txt` |
| `gpt-4.1` | `d1_audit` | 1 | 4799 | 70 | 500 | $0.004140 | `/Users/samprimeaux/inneranimalmedia/.agentsam_evals/agentsam_eval_20260525_123232/outputs/obs_c71dbe0464ef4b2d8a11.txt` |
| `gpt-4.1` | `code_review` | 1 | 3983 | 84 | 340 | $0.002888 | `/Users/samprimeaux/inneranimalmedia/.agentsam_evals/agentsam_eval_20260525_123232/outputs/obs_77964e63425acbb33b0f.txt` |
| `gpt-4.1` | `spawn_contract` | 1 | 2978 | 66 | 362 | $0.003028 | `/Users/samprimeaux/inneranimalmedia/.agentsam_evals/agentsam_eval_20260525_123232/outputs/obs_f79c57e79499c78d272a.txt` |
| `gpt-4.1` | `validation_gate` | 1 | 2544 | 58 | 321 | $0.002684 | `/Users/samprimeaux/inneranimalmedia/.agentsam_evals/agentsam_eval_20260525_123232/outputs/obs_5a46bd216c630a968d8d.txt` |
| `gpt-5.4` | `simple_router` | 1 | 1312 | 48 | 28 | $0.000340 | `/Users/samprimeaux/inneranimalmedia/.agentsam_evals/agentsam_eval_20260525_123232/outputs/obs_d8d062ed4e4496601ef9.txt` |
| `gpt-5.4` | `d1_audit` | 0 | 6790 | 69 | 500 | $0.005086 | `/Users/samprimeaux/inneranimalmedia/.agentsam_evals/agentsam_eval_20260525_123232/outputs/obs_809dd877beb72086860a.txt` |
| `gpt-5.4` | `code_review` | 1 | 8909 | 83 | 500 | $0.005104 | `/Users/samprimeaux/inneranimalmedia/.agentsam_evals/agentsam_eval_20260525_123232/outputs/obs_fd0d5f2c3fb66b05dbf5.txt` |
