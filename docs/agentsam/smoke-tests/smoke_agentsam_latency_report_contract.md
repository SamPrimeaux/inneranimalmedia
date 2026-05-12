# Agent Sam Latency Smoke Script Contract

Source script: `scripts/smoke_agentsam_latency.py`

Purpose: preserve the implemented report schema, integrity rules, and command usage so the work is not lost.

## Required report layout

`summary` is always non-null.

`cases` always includes:

- direct_provider_hello
- minimal_prompt_route_check
- chat_hello_first_byte
- chat_hello_repeat_10
- standard_ask_no_tools

Root aliases:

- hello_first_byte = cases.chat_hello_first_byte.summary
- repeat_10 = cases.chat_hello_repeat_10.summary
- standard_ask_no_tools = cases.standard_ask_no_tools.summary

Full standard ask case stays at cases.standard_ask_no_tools.

## Streaming summary fields

Each streaming summary includes transport_ok, http_status, error, raw_preview, events_count, accepted_event_ms, first_byte_ms, first_sse_event_ms, context_event_ms, done_ms, total_ms, connect_ms, context, and text.

Each case has top-level passed and failures. failures is always present.

## Integrity rules

report_integrity validates non-null summary, required core cases, failed cases having failures, repeat p50/p95 pairing, and hello not having all timings null without an error.

If integrity fails, the script exits 1.

## Product testing note

This latency script is useful, but the real Agent Sam product acceptance test must target:

https://inneranimalmedia.com/dashboard/agent

The dashboard-agent browser/workbench smoke should become the primary E2E test.
