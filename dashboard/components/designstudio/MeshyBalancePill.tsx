/** Live Meshy credit balance pill for Design Studio header. */
import React, { useCallback, useEffect, useState } from 'react';
import { Coins, Loader2 } from 'lucide-react';
import { fetchMeshyBalance } from './hooks/meshyBalance';

type Props = {
  className?: string;
  refreshKey?: number;
};

export const MeshyBalancePill: React.FC<Props> = ({ className = '', refreshKey = 0 }) => {
  const [balance, setBalance] = useState<number | null>(null);
  const [stub, setStub] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchMeshyBalance();
      if (data.stub) {
        setStub(true);
        setBalance(null);
      } else {
        setStub(false);
        setBalance(typeof data.balance === 'number' ? data.balance : null);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Balance unavailable');
      setBalance(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
    const id = window.setInterval(() => void refresh(), 60_000);
    return () => window.clearInterval(id);
  }, [refresh, refreshKey]);

  const low = balance != null && balance < 15;

  return (
    <button
      type="button"
      onClick={() => void refresh()}
      title={
        stub
          ? 'Meshy API key not configured on Worker'
          : error
            ? error
            : 'Meshy credits — click to refresh'
      }
      className={`pointer-events-auto flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-[11px] font-semibold tabular-nums transition-colors ${
        low
          ? 'border-amber-500/35 bg-amber-500/10 text-amber-300'
          : 'border-white/[0.08] bg-white/[0.04] text-emerald-300'
      } ${className}`}
    >
      {loading ? (
        <Loader2 size={14} className="animate-spin opacity-70" />
      ) : (
        <Coins size={14} className={low ? 'text-amber-400' : 'text-cyan-400'} />
      )}
      <span className="hidden sm:inline">
        {stub ? 'No key' : error ? '—' : balance != null ? `${balance.toLocaleString()} cr` : '—'}
      </span>
    </button>
  );
};
