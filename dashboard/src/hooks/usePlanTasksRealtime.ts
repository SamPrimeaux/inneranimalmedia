import { useEffect, useState, useCallback } from 'react';
import { bootstrapSupabaseFromSession, getSupabaseClient } from '../lib/supabase';

export interface PlanTask {
  id: string;
  plan_id: string;
  order_index: number;
  title: string;
  description: string | null;
  priority: 'P0' | 'P1' | 'P2' | 'P3';
  category: string | null;
  status: 'todo' | 'in_progress' | 'done' | 'blocked' | 'skipped' | 'carried';
  blocked_reason: string | null;
  notes: string | null;
  estimated_minutes: number | null;
  actual_minutes: number | null;
  completed_at: string | null;
}

export function usePlanTasksRealtime(planId: string | null) {
  const [tasks, setTasks] = useState<PlanTask[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchTasks = useCallback(async () => {
    const sb = getSupabaseClient() ?? (await bootstrapSupabaseFromSession());
    if (!planId || !sb) return;
    setLoading(true);
    try {
      const { data, error: err } = await sb
        .from('agentsam_plan_tasks')
        .select('*')
        .eq('plan_id', planId)
        .order('order_index', { ascending: true });
      if (err) throw err;
      setTasks((data ?? []) as PlanTask[]);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [planId]);

  useEffect(() => {
    let cancelled = false;
    let removeChannel: (() => void) | null = null;
    void (async () => {
      await fetchTasks();
      const sb = getSupabaseClient() ?? (await bootstrapSupabaseFromSession());
      if (cancelled || !planId || !sb) return;

      const channel = sb
      .channel(`plan_tasks:${planId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'agentsam_plan_tasks',
          filter: `plan_id=eq.${planId}`,
        },
        (payload) => {
          if (payload.eventType === 'INSERT') {
            setTasks((prev) => {
              const exists = prev.some((t) => t.id === payload.new.id);
              return exists
                ? prev
                : [...prev, payload.new as PlanTask].sort(
                    (a, b) => a.order_index - b.order_index
                  );
            });
          } else if (payload.eventType === 'UPDATE') {
            setTasks((prev) =>
              prev.map((t) =>
                t.id === payload.new.id ? (payload.new as PlanTask) : t
              )
            );
          } else if (payload.eventType === 'DELETE') {
            setTasks((prev) => prev.filter((t) => t.id !== payload.old.id));
          }
        }
      )
      .subscribe();

      removeChannel = () => {
        void sb.removeChannel(channel);
      };
    })();

    return () => {
      cancelled = true;
      removeChannel?.();
    };
  }, [planId, fetchTasks]);

  return { tasks, loading, error, refetch: fetchTasks };
}
