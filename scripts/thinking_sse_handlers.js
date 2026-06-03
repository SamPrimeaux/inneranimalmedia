// Paste these handlers into your SSE event dispatch block:
// Uses formatThinkingStepName — see dashboard/features/agent-chat/formatThinkingStepName.ts

      if (ev.type === 'thinking_start') {
        thinkingStartRef.current = Date.now();
        setThinkingState({ steps: [], thinkingText: '', status: 'thinking', startedAt: Date.now() });
      }
      if (ev.type === 'thinking') {
        setThinkingState(prev => prev
          ? { ...prev, status: 'thinking', thinkingText: (prev.thinkingText || '') + (ev.text || '') }
          : { steps: [], thinkingText: ev.text || '', status: 'thinking', startedAt: Date.now() });
      }
      if (ev.type === 'tool_start') {
        const stepId = ev.tool_name || ev.node_key || String(Date.now());
        const stepName = formatThinkingStepName(ev);
        setThinkingState(prev => {
          const base = prev ?? { steps: [], thinkingText: '', status: 'working', startedAt: Date.now() };
          const exists = base.steps.find(s => s.id === stepId);
          if (exists) return base;
          return { ...base, status: 'working', steps: [...base.steps, { id: stepId, name: stepName, status: 'running' }] };
        });
      }
      if (ev.type === 'browser_live_view_ready') {
        setThinkingState(prev => {
          const base = prev ?? { steps: [], thinkingText: '', status: 'working', startedAt: Date.now() };
          const steps = upsertStep(base.steps, {
            id: 'browser_live_view',
            name: 'Live browser ready',
            status: 'done',
            preview: ev.url || ev.title || undefined,
          });
          return { ...base, status: 'working', steps };
        });
      }
      if (ev.type === 'browser_human_input_required') {
        setThinkingState(prev => {
          const base = prev ?? { steps: [], thinkingText: '', status: 'blocked', startedAt: Date.now() };
          const steps = upsertStep(base.steps, {
            id: 'browser_human_input',
            name: 'Waiting for you in the live browser',
            status: 'blocked',
            preview: ev.reason || 'Complete the step, then click Continue.',
          });
          return { ...base, status: 'blocked', steps };
        });
      }
      if (ev.type === 'tool_done' || ev.type === 'workflow_step') {
        const stepId = ev.tool_name || ev.node_key || '';
        const stepName = stepId ? formatThinkingStepName(ev) : 'Working';
        const preview = String(ev.output_preview || ev.result || '').slice(0, 120);
        setThinkingState(prev => {
          if (!prev) return prev;
          const steps: ThinkingStep[] = prev.steps.map(s =>
            s.id === stepId ? { ...s, name: stepName, status: ev.ok === false ? 'error' : 'done', preview: preview || s.preview } : s
          );
          if (stepId && !steps.find(s => s.id === stepId)) {
            steps.push({ id: stepId, name: stepName, status: ev.ok === false ? 'error' : 'done', preview });
          }
          return { ...prev, steps };
        });
      }
      if (ev.type === 'tool_error') {
        const stepId = ev.tool_name || ev.node_key || '';
        setThinkingState(prev => {
          if (!prev) return prev;
          return { ...prev, steps: prev.steps.map(s => s.id === stepId ? { ...s, status: 'error' } : s) };
        });
      }
      if (ev.type === 'tool_blocked') {
        const stepId = ev.tool_name || ev.node_key || '';
        setThinkingState(prev => {
          if (!prev) return prev;
          return {
            ...prev,
            status: 'blocked',
            steps: prev.steps.map(s => s.id === stepId ? { ...s, status: 'blocked' } : s),
          };
        });
      }
      if (ev.type === 'workflow_complete') {
        setThinkingState(prev => prev ? { ...prev, status: 'done' } : prev);
      }
      if (ev.type === 'workflow_error') {
        setThinkingState(prev => prev ? { ...prev, status: 'error' } : prev);
      }
      if (ev.type === 'approval_required') {
        const crid = ev.command_run_id || ev.approval_id || null;
        if (crid) onApprovalRequired?.(String(crid));
        setThinkingState(prev => prev ? { ...prev, status: 'blocked' } : prev);
      }
      if (ev.type === 'done') {
        setThinkingState(prev => prev ? { ...prev, status: 'done' } : prev);
      }
      if (ev.type === 'error') {
        setThinkingState(prev => prev ? { ...prev, status: 'error' } : prev);
      }

// Helpers (import from formatThinkingStepName.ts in real code):
function upsertStep(steps, step) {
  const idx = steps.findIndex(s => s.id === step.id);
  if (idx >= 0) {
    const next = [...steps];
    next[idx] = { ...next[idx], ...step };
    return next;
  }
  return [...steps, step];
}
