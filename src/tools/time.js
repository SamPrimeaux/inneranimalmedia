/**
 * Tool: Time & Temporal Awareness
 * Gives Agent Sam and all agents accurate, rich temporal context.
 * Routes: /api/agentsam/time/*
 *
 * Endpoints:
 *   GET/POST /now          — current time, full context block for agent injection
 *   POST     /convert      — convert a timestamp between timezones
 *   POST     /diff         — duration between two timestamps
 *   POST     /add          — add/subtract duration from a timestamp
 *   POST     /format       — format a timestamp with a pattern
 *   GET      /context      — full agent temporal context block (inject into system prompt)
 *   POST     /is-business  — is a given time within business hours for a timezone
 *   POST     /until        — how long until a future timestamp
 *   POST     /since        — how long since a past timestamp
 */

import { jsonResponse } from '../core/responses.js';

// ---------------------------------------------------------------------------
// Core time helpers
// ---------------------------------------------------------------------------

/**
 * Returns a full temporal snapshot for a given timezone.
 * This is what you inject into agent system prompts for realtime awareness.
 */
function buildTemporalContext(tz = 'UTC') {
  const now = new Date();

  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    weekday:  'long',
    year:     'numeric',
    month:    'long',
    day:      'numeric',
    hour:     'numeric',
    minute:   'numeric',
    second:   'numeric',
    hour12:   true,
    timeZoneName: 'short',
  }).formatToParts(now);

  const get = type => parts.find(p => p.type === type)?.value || '';

  const localDate = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(now); // YYYY-MM-DD

  const [year, month, day] = localDate.split('-').map(Number);

  const dayOfWeek   = get('weekday');
  const hour24      = Number(new Intl.DateTimeFormat('en-US', {
    timeZone: tz, hour: 'numeric', hour12: false,
  }).format(now));

  const isWeekend   = ['Saturday', 'Sunday'].includes(dayOfWeek);
  const isBusinessHours = !isWeekend && hour24 >= 9 && hour24 < 17;

  const quarter = Math.ceil(month / 3);

  return {
    iso:              now.toISOString(),
    unix:             Math.floor(now.getTime() / 1000),
    unix_ms:          now.getTime(),
    timezone:         tz,
    timezone_offset:  getTimezoneOffset(now, tz),
    local: {
      full:    `${dayOfWeek}, ${get('month')} ${get('day')}, ${get('year')} at ${get('hour')}:${get('minute')}:${get('second')} ${get('dayPeriod')} ${get('timeZoneName')}`,
      date:    localDate,
      year,
      month,
      day,
      hour:    hour24,
      minute:  Number(get('minute')),
      weekday: dayOfWeek,
      quarter: `Q${quarter}`,
    },
    flags: {
      is_weekend:        isWeekend,
      is_business_hours: isBusinessHours,
      is_dst:            isDST(now, tz),
    },
    // Formatted string suitable for direct injection into a system prompt
    agent_context: `Current time: ${dayOfWeek}, ${get('month')} ${get('day')}, ${get('year')}, ${get('hour')}:${get('minute')} ${get('dayPeriod')} ${get('timeZoneName')} (Unix: ${Math.floor(now.getTime() / 1000)})`,
  };
}

function getTimezoneOffset(date, tz) {
  const utc = new Date(date.toLocaleString('en-US', { timeZone: 'UTC' }));
  const local = new Date(date.toLocaleString('en-US', { timeZone: tz }));
  const diff = (local - utc) / 60000;
  const sign = diff >= 0 ? '+' : '-';
  const abs  = Math.abs(diff);
  const h    = String(Math.floor(abs / 60)).padStart(2, '0');
  const m    = String(abs % 60).padStart(2, '0');
  return `${sign}${h}:${m}`;
}

function isDST(date, tz) {
  const jan = new Date(date.getFullYear(), 0, 1);
  const jul = new Date(date.getFullYear(), 6, 1);
  const offsetJan = getOffsetMinutes(jan, tz);
  const offsetJul = getOffsetMinutes(jul, tz);
  const current   = getOffsetMinutes(date, tz);
  return current !== Math.min(offsetJan, offsetJul);
}

function getOffsetMinutes(date, tz) {
  const utc   = new Date(date.toLocaleString('en-US', { timeZone: 'UTC' }));
  const local = new Date(date.toLocaleString('en-US', { timeZone: tz }));
  return (local - utc) / 60000;
}

/**
 * Human-readable duration from milliseconds.
 */
function formatDuration(ms) {
  const abs     = Math.abs(ms);
  const seconds = Math.floor(abs / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours   = Math.floor(minutes / 60);
  const days    = Math.floor(hours / 24);
  const weeks   = Math.floor(days / 7);
  const months  = Math.floor(days / 30.44);
  const years   = Math.floor(days / 365.25);

  if (years   > 0) return `${years} year${years   !== 1 ? 's' : ''}`;
  if (months  > 0) return `${months} month${months !== 1 ? 's' : ''}`;
  if (weeks   > 0) return `${weeks} week${weeks   !== 1 ? 's' : ''}`;
  if (days    > 0) return `${days} day${days     !== 1 ? 's' : ''}`;
  if (hours   > 0) return `${hours} hour${hours  !== 1 ? 's' : ''}`;
  if (minutes > 0) return `${minutes} minute${minutes !== 1 ? 's' : ''}`;
  return `${seconds} second${seconds !== 1 ? 's' : ''}`;
}

const DURATION_UNITS = {
  seconds: 1000,
  minutes: 60 * 1000,
  hours:   60 * 60 * 1000,
  days:    24 * 60 * 60 * 1000,
  weeks:   7 * 24 * 60 * 60 * 1000,
};

// ---------------------------------------------------------------------------
// Route dispatcher
// ---------------------------------------------------------------------------

export async function handleTimeDispatch(request, env, ctx, authUser) {
  const url    = new URL(request.url);
  const path   = url.pathname.replace(/\/$/, '');
  const method = request.method.toUpperCase();

  let body = {};
  if (method !== 'GET') {
    try { body = await request.json(); } catch { body = {}; }
  }

  const tz = body.timezone || url.searchParams.get('timezone') || 'UTC';

  try {

    // ------------------------------------------------------------------
    // GET /now — current time snapshot
    // ------------------------------------------------------------------
    if (path.endsWith('/now')) {
      return jsonResponse(buildTemporalContext(tz));
    }

    // ------------------------------------------------------------------
    // GET /context — agent-ready temporal context block
    // Inject result.agent_context directly into a system prompt.
    // ------------------------------------------------------------------
    if (path.endsWith('/context')) {
      const ctx = buildTemporalContext(tz);
      return jsonResponse({
        agent_context:  ctx.agent_context,
        iso:            ctx.iso,
        unix:           ctx.unix,
        timezone:       ctx.timezone,
        local_date:     ctx.local.date,
        weekday:        ctx.local.weekday,
        quarter:        ctx.local.quarter,
        is_weekend:     ctx.flags.is_weekend,
        is_business_hours: ctx.flags.is_business_hours,
      });
    }

    // ------------------------------------------------------------------
    // POST /convert — convert timestamp between timezones
    // Body: { time: string|number, source_timezone?, target_timezone }
    // ------------------------------------------------------------------
    if (path.endsWith('/convert')) {
      const { time, target_timezone } = body;
      if (!time)             return jsonResponse({ error: 'time is required' }, 400);
      if (!target_timezone)  return jsonResponse({ error: 'target_timezone is required' }, 400);

      const date      = new Date(typeof time === 'number' ? time * 1000 : time);
      if (isNaN(date)) return jsonResponse({ error: 'Invalid time value' }, 400);

      const sourceFull = date.toLocaleString('en-US', { timeZone: tz, timeZoneName: 'short' });
      const targetFull = date.toLocaleString('en-US', { timeZone: target_timezone, timeZoneName: 'short' });

      return jsonResponse({
        iso:              date.toISOString(),
        unix:             Math.floor(date.getTime() / 1000),
        source_timezone:  tz,
        source_local:     sourceFull,
        target_timezone,
        target_local:     targetFull,
        offset_diff:      `${getOffsetMinutes(date, target_timezone) - getOffsetMinutes(date, tz)} minutes`,
      });
    }

    // ------------------------------------------------------------------
    // POST /diff — duration between two timestamps
    // Body: { from: string|number, to: string|number }
    // ------------------------------------------------------------------
    if (path.endsWith('/diff')) {
      const { from, to } = body;
      if (!from || !to) return jsonResponse({ error: 'from and to are required' }, 400);

      const dateFrom = new Date(typeof from === 'number' ? from * 1000 : from);
      const dateTo   = new Date(typeof to   === 'number' ? to   * 1000 : to);

      if (isNaN(dateFrom) || isNaN(dateTo)) {
        return jsonResponse({ error: 'Invalid date values' }, 400);
      }

      const diffMs = dateTo - dateFrom;

      return jsonResponse({
        from_iso:     dateFrom.toISOString(),
        to_iso:       dateTo.toISOString(),
        diff_ms:      diffMs,
        diff_seconds: Math.floor(Math.abs(diffMs) / 1000),
        diff_minutes: Math.floor(Math.abs(diffMs) / 60000),
        diff_hours:   Math.floor(Math.abs(diffMs) / 3600000),
        diff_days:    Math.floor(Math.abs(diffMs) / 86400000),
        human:        formatDuration(diffMs),
        direction:    diffMs >= 0 ? 'future' : 'past',
      });
    }

    // ------------------------------------------------------------------
    // POST /add — add or subtract duration from a timestamp
    // Body: { time: string|number, amount: number, unit: string, operation?: 'add'|'subtract' }
    // ------------------------------------------------------------------
    if (path.endsWith('/add')) {
      const { time, amount, unit, operation = 'add' } = body;
      if (!time || amount === undefined || !unit) {
        return jsonResponse({ error: 'time, amount, and unit are required' }, 400);
      }
      if (!DURATION_UNITS[unit]) {
        return jsonResponse({ error: `Invalid unit. Use: ${Object.keys(DURATION_UNITS).join(', ')}` }, 400);
      }

      const date      = new Date(typeof time === 'number' ? time * 1000 : time);
      if (isNaN(date)) return jsonResponse({ error: 'Invalid time value' }, 400);

      const deltaMs   = amount * DURATION_UNITS[unit];
      const result    = new Date(date.getTime() + (operation === 'subtract' ? -deltaMs : deltaMs));

      return jsonResponse({
        original_iso: date.toISOString(),
        original_unix: Math.floor(date.getTime() / 1000),
        result_iso:   result.toISOString(),
        result_unix:  Math.floor(result.getTime() / 1000),
        result_local: result.toLocaleString('en-US', { timeZone: tz, timeZoneName: 'short' }),
        operation,
        amount,
        unit,
      });
    }

    // ------------------------------------------------------------------
    // POST /until — how long until a future time
    // Body: { target: string|number }
    // ------------------------------------------------------------------
    if (path.endsWith('/until')) {
      const { target } = body;
      if (!target) return jsonResponse({ error: 'target is required' }, 400);

      const targetDate = new Date(typeof target === 'number' ? target * 1000 : target);
      if (isNaN(targetDate)) return jsonResponse({ error: 'Invalid target value' }, 400);

      const now    = new Date();
      const diffMs = targetDate - now;

      if (diffMs < 0) {
        return jsonResponse({ error: 'Target time is in the past. Use /since instead.' }, 400);
      }

      return jsonResponse({
        target_iso:   targetDate.toISOString(),
        target_local: targetDate.toLocaleString('en-US', { timeZone: tz, timeZoneName: 'short' }),
        now_iso:      now.toISOString(),
        diff_ms:      diffMs,
        diff_seconds: Math.floor(diffMs / 1000),
        diff_minutes: Math.floor(diffMs / 60000),
        diff_hours:   Math.floor(diffMs / 3600000),
        diff_days:    Math.floor(diffMs / 86400000),
        human:        `in ${formatDuration(diffMs)}`,
      });
    }

    // ------------------------------------------------------------------
    // POST /since — how long since a past time
    // Body: { from: string|number }
    // ------------------------------------------------------------------
    if (path.endsWith('/since')) {
      const { from } = body;
      if (!from) return jsonResponse({ error: 'from is required' }, 400);

      const fromDate = new Date(typeof from === 'number' ? from * 1000 : from);
      if (isNaN(fromDate)) return jsonResponse({ error: 'Invalid from value' }, 400);

      const now    = new Date();
      const diffMs = now - fromDate;

      if (diffMs < 0) {
        return jsonResponse({ error: 'from time is in the future. Use /until instead.' }, 400);
      }

      return jsonResponse({
        from_iso:     fromDate.toISOString(),
        from_local:   fromDate.toLocaleString('en-US', { timeZone: tz, timeZoneName: 'short' }),
        now_iso:      now.toISOString(),
        diff_ms:      diffMs,
        diff_seconds: Math.floor(diffMs / 1000),
        diff_minutes: Math.floor(diffMs / 60000),
        diff_hours:   Math.floor(diffMs / 3600000),
        diff_days:    Math.floor(diffMs / 86400000),
        human:        `${formatDuration(diffMs)} ago`,
      });
    }

    // ------------------------------------------------------------------
    // POST /is-business — is a given time within business hours
    // Body: { time?: string|number, timezone, start_hour?: number, end_hour?: number }
    // ------------------------------------------------------------------
    if (path.endsWith('/is-business')) {
      const date       = body.time
        ? new Date(typeof body.time === 'number' ? body.time * 1000 : body.time)
        : new Date();
      if (isNaN(date)) return jsonResponse({ error: 'Invalid time value' }, 400);

      const startHour  = body.start_hour ?? 9;
      const endHour    = body.end_hour   ?? 17;

      const dayOfWeek  = new Intl.DateTimeFormat('en-US', {
        timeZone: tz, weekday: 'long',
      }).format(date);

      const hour24 = Number(new Intl.DateTimeFormat('en-US', {
        timeZone: tz, hour: 'numeric', hour12: false,
      }).format(date));

      const isWeekend  = ['Saturday', 'Sunday'].includes(dayOfWeek);
      const inHours    = hour24 >= startHour && hour24 < endHour;
      const isBusiness = !isWeekend && inHours;

      return jsonResponse({
        is_business_hours: isBusiness,
        is_weekend:        isWeekend,
        weekday:           dayOfWeek,
        local_hour:        hour24,
        timezone:          tz,
        window:            `${startHour}:00–${endHour}:00`,
        iso:               date.toISOString(),
      });
    }

    // ------------------------------------------------------------------
    // POST /format — format a timestamp with Intl options
    // Body: { time: string|number, locale?: string, options?: Intl.DateTimeFormatOptions }
    // ------------------------------------------------------------------
    if (path.endsWith('/format')) {
      const { time, locale = 'en-US', options: fmtOptions = {} } = body;
      if (!time) return jsonResponse({ error: 'time is required' }, 400);

      const date = new Date(typeof time === 'number' ? time * 1000 : time);
      if (isNaN(date)) return jsonResponse({ error: 'Invalid time value' }, 400);

      const safeOptions = { timeZone: tz, ...fmtOptions };
      const formatted   = new Intl.DateTimeFormat(locale, safeOptions).format(date);

      return jsonResponse({
        iso:       date.toISOString(),
        unix:      Math.floor(date.getTime() / 1000),
        formatted,
        locale,
        timezone:  tz,
      });
    }

    return jsonResponse({ error: 'Time endpoint not found' }, 404);

  } catch (err) {
    console.error('[handleTimeDispatch]', err.message);
    return jsonResponse({ error: 'Time dispatcher failed', detail: err.message }, 500);
  }
}

// ---------------------------------------------------------------------------
// Direct export for use inside other tools / agent context injection
// ---------------------------------------------------------------------------

/**
 * Returns a one-line temporal context string for injection into any system prompt.
 * Usage: const timeCtx = getCurrentTimeContext('America/Chicago');
 *        systemPrompt = `${base}\n\n${timeCtx}`;
 *
 * @param {string} timezone — IANA timezone string, default 'UTC'
 * @returns {string}
 */
export function getCurrentTimeContext(timezone = 'UTC') {
  return buildTemporalContext(timezone).agent_context;
}

/**
 * Returns the full temporal snapshot object for use in code.
 *
 * @param {string} timezone
 * @returns {object}
 */
export function getTemporalSnapshot(timezone = 'UTC') {
  return buildTemporalContext(timezone);
}
