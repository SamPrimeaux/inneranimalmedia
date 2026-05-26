import React, { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeSlug from 'rehype-slug';
import {
  ArrowRight,
  BadgeAlert,
  BrainCircuit,
  CheckCheck,
  ClipboardList,
  Copy,
  Gauge,
  MessageSquareText,
  Sparkles,
  Zap,
} from 'lucide-react';
import { useLaunchDeskStream, type LaunchDeskInput } from './launch-desk/useLaunchDeskStream';
import './launch-desk/launch-desk.css';

const SAMPLE: LaunchDeskInput = {
  brief:
    'Ship a self-serve workspace import flow that helps new teams connect data, preview the result, and complete onboarding without support intervention.',
  audience: 'Engineering managers and ops leads at mid-sized product teams.',
  launchDate: '2026-06-12',
  constraints:
    'Must not break the existing onboarding funnel; rollout needs feature flags; legal copy must be reviewed; support only has two people on launch day.',
  availableAssets:
    'Landing page draft, two screenshots, an onboarding FAQ draft, and an internal demo video.',
};

function splitLines(value: string) {
  return value
    .split(/\n|;|•|,/g)
    .map((part) => part.replace(/^\s*[-*]\s*/, '').trim())
    .filter(Boolean);
}

function fieldMissingSummary(input: LaunchDeskInput) {
  const missing = [];
  if (!input.brief.trim()) missing.push('brief');
  if (!input.audience.trim()) missing.push('audience');
  if (!input.launchDate.trim()) missing.push('launch date');
  if (!splitLines(input.constraints).length) missing.push('constraints');
  if (!splitLines(input.availableAssets).length) missing.push('assets');
  return missing;
}

function formatEventLabel(event: string) {
  switch (event) {
    case 'tool_progress':
      return 'tool progress';
    case 'text_delta':
      return 'model delta';
    case 'final_output':
      return 'final output';
    case 'agent_update':
      return 'agent updated';
    case 'status':
      return 'status';
    case 'error':
      return 'error';
    default:
      return event.replace(/_/g, ' ');
  }
}

export function LaunchDeskPage() {
  const [input, setInput] = useState<LaunchDeskInput>(SAMPLE);
  const {
    run,
    cancel,
    events,
    renderedText,
    isStreaming,
    error,
    lastToolName,
    sawToolEvent,
    sawTextDelta,
  } = useLaunchDeskStream();

  const missing = useMemo(() => fieldMissingSummary(input), [input]);

  const copySnippet = useMemo(() => {
    if (!renderedText.trim()) return 'The plan will appear here as the agent streams.';
    return renderedText.slice(0, 240).trim();
  }, [renderedText]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    await run(input);
  };

  return (
    <div className="launch-desk-shell">
      <div className="launch-desk-backdrop" aria-hidden="true" />
      <div className="launch-desk-grid">
        <motion.aside
          className="launch-desk-panel launch-desk-intake"
          initial={{ opacity: 0, x: -24 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.5, ease: 'easeOut' }}
        >
          <div className="launch-desk-kicker">
            <Sparkles size={14} />
            <span>Launch Desk</span>
          </div>
          <h1>Turn a rough launch idea into a ship-ready release plan.</h1>
          <p className="launch-desk-lead">
            Enter the product brief, audience, launch date, constraints, and assets. The agent will return a prioritized
            plan, risk register, owner checklist, launch copy, and follow-up questions when details are missing.
          </p>

          <div className="launch-desk-actions">
            <button
              type="button"
              className="launch-desk-secondary-btn"
              onClick={() => setInput(SAMPLE)}
            >
              Load example
            </button>
            <Link to="/dashboard/overview" className="launch-desk-ghost-link">
              Back to dashboard
            </Link>
          </div>

          <form onSubmit={submit} className="launch-desk-form">
            <label>
              <span>Product brief</span>
              <textarea
                value={input.brief}
                onChange={(e) => setInput((prev) => ({ ...prev, brief: e.target.value }))}
                placeholder="What is shipping?"
                rows={7}
              />
            </label>

            <div className="launch-desk-two-col">
              <label>
                <span>Audience</span>
                <input
                  value={input.audience}
                  onChange={(e) => setInput((prev) => ({ ...prev, audience: e.target.value }))}
                  placeholder="Who is this for?"
                />
              </label>
              <label>
                <span>Launch date</span>
                <input
                  type="date"
                  value={input.launchDate}
                  onChange={(e) => setInput((prev) => ({ ...prev, launchDate: e.target.value }))}
                />
              </label>
            </div>

            <label>
              <span>Constraints</span>
              <textarea
                value={input.constraints}
                onChange={(e) => setInput((prev) => ({ ...prev, constraints: e.target.value }))}
                placeholder="List blockers, compliance items, dependencies, or hard no-go items."
                rows={5}
              />
            </label>

            <label>
              <span>Available assets</span>
              <textarea
                value={input.availableAssets}
                onChange={(e) => setInput((prev) => ({ ...prev, availableAssets: e.target.value }))}
                placeholder="Screenshots, demos, docs, landing pages, legal copy..."
                rows={4}
              />
            </label>

            <div className="launch-desk-form-footer">
              <div className="launch-desk-pills">
                <span className={`launch-desk-pill ${missing.length ? 'warn' : 'ok'}`}>
                  <BadgeAlert size={12} />
                  {missing.length ? `${missing.length} missing` : 'Intake complete'}
                </span>
                <span className={`launch-desk-pill ${sawToolEvent ? 'ok' : ''}`}>
                  <ClipboardList size={12} />
                  Tool activity
                </span>
                <span className={`launch-desk-pill ${sawTextDelta ? 'ok' : ''}`}>
                  <MessageSquareText size={12} />
                  Streaming text
                </span>
              </div>
              <div className="launch-desk-form-buttons">
                {isStreaming ? (
                  <button type="button" className="launch-desk-stop-btn" onClick={cancel}>
                    Stop run
                  </button>
                ) : null}
                <button type="submit" className="launch-desk-primary-btn" disabled={isStreaming}>
                  <Zap size={14} />
                  {isStreaming ? 'Planning...' : 'Generate plan'}
                </button>
              </div>
            </div>
          </form>

          <div className="launch-desk-mini-grid">
            <div className="launch-desk-mini-card">
              <span>Latest tool</span>
              <strong>{lastToolName || 'Waiting for a tool call'}</strong>
            </div>
            <div className="launch-desk-mini-card">
              <span>Live event count</span>
              <strong>{events.length}</strong>
            </div>
          </div>

          {missing.length > 0 ? (
            <div className="launch-desk-warning-box">
              <h3>Missing details</h3>
              <ul>
                {missing.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>
          ) : null}
        </motion.aside>

        <div className="launch-desk-workflow">
          <motion.section
            className="launch-desk-panel launch-desk-stream"
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.55, ease: 'easeOut', delay: 0.05 }}
          >
            <div className="launch-desk-panel-head">
              <div>
                <div className="launch-desk-panel-label">
                  <BrainCircuit size={14} />
                  Streaming run
                </div>
                <h2>Progress feed</h2>
              </div>
              <div className="launch-desk-status">
                <Gauge size={14} />
                {isStreaming ? 'Running' : 'Idle'}
              </div>
            </div>

            <div className="launch-desk-events">
              {events.length === 0 ? (
                <div className="launch-desk-empty-state">
                  The stream will show tool calls, raw model deltas, and the final response.
                </div>
              ) : (
                events.map((entry, idx) => (
                  <div key={`${entry.event}-${idx}`} className={`launch-desk-event ${entry.event}`}>
                    <div className="launch-desk-event-top">
                      <span>{formatEventLabel(entry.event)}</span>
                      {entry.payload?.name ? <strong>{String(entry.payload.name)}</strong> : null}
                    </div>
                    <pre>{JSON.stringify(entry.payload, null, 2)}</pre>
                  </div>
                ))
              )}
            </div>
          </motion.section>

          <motion.section
            className="launch-desk-panel launch-desk-document"
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.55, ease: 'easeOut', delay: 0.12 }}
          >
            <div className="launch-desk-panel-head">
              <div>
                <div className="launch-desk-panel-label">
                  <CheckCheck size={14} />
                  Agent output
                </div>
                <h2>Release plan</h2>
              </div>
              <button
                type="button"
                className="launch-desk-copy-btn"
                onClick={() => navigator.clipboard?.writeText(renderedText).catch(() => {})}
              >
                <Copy size={13} />
                Copy text
              </button>
            </div>

            <div className="launch-desk-document-body">
              {error ? <div className="launch-desk-error">{error}</div> : null}
              {!renderedText.trim() ? (
                <div className="launch-desk-empty-document">
                  <h3>What you will get</h3>
                  <ul>
                    <li>Prioritized launch plan</li>
                    <li>Risk register with go/no-go blockers</li>
                    <li>Owner checklist and execution sequence</li>
                    <li>Launch copy suggestions by channel</li>
                    <li>Follow-up questions for missing details</li>
                  </ul>
                </div>
              ) : (
                <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeSlug]}>
                  {renderedText}
                </ReactMarkdown>
              )}
            </div>

            <div className="launch-desk-snippet">
              <span>Live snippet</span>
              <p>{copySnippet}</p>
            </div>
          </motion.section>
        </div>
      </div>
    </div>
  );
}

export default LaunchDeskPage;
