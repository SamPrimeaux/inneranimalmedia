import { useEffect, useRef } from "react";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export type SignalTarget =
  | "execution"
  | "routing"
  | "errors"
  | "tools"
  | "deploys"
  | "plans"
  | "stream";

const TABLE_TARGET_MAP: Record<string, SignalTarget> = {
  agentsam_workflow_runs: "execution",
  agentsam_routing_arms: "routing",
  agentsam_routing_decisions: "routing",
  agentsam_error_events: "errors",
  agentsam_tool_call_events: "tools",
  build_deploy_events: "deploys",
  agentsam_plan_tasks: "plans",
  agentsam_plans: "plans",
  agentsam_stream_events: "stream",
};

let _client: SupabaseClient | null = null;

export function initRealtimeClient(url: string, anonKey: string) {
  if (!_client) {
    _client = createClient(url, anonKey, {
      realtime: { params: { eventsPerSecond: 4 } },
    });
  }
  return _client;
}

export function getRealtimeClient() {
  return _client;
}

type UseRealtimeSignalOpts = {
  onSignal: (target: SignalTarget) => void;
  supabaseUserId: string | null;
  enabled?: boolean;
};

export function useRealtimeSignal({ onSignal, supabaseUserId, enabled = true }: UseRealtimeSignalOpts) {
  const onSignalRef = useRef(onSignal);
  onSignalRef.current = onSignal;

  useEffect(() => {
    if (!enabled || !_client || !supabaseUserId) return;

    const channel = _client.channel(`dashboard-overview-${supabaseUserId}`);
    for (const table of Object.keys(TABLE_TARGET_MAP)) {
      channel.on(
        "postgres_changes",
        { event: "*", schema: "public", table },
        () => {
          onSignalRef.current(TABLE_TARGET_MAP[table]);
        },
      );
    }

    channel.subscribe((status) => {
      if (status === "CHANNEL_ERROR") {
        console.warn("[useRealtimeSignal] channel error");
      }
    });

    return () => {
      void _client?.removeChannel(channel);
    };
  }, [supabaseUserId, enabled]);
}
