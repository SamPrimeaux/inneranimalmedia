import React, { useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';

function mapHealthTabToAnalyticsTab(tab: string): string {
  const t = String(tab || '').trim().toLowerCase();
  if (!t) return 'overview';
  if (t === 'database' || t === 'd1') return 'databases';
  return t;
}

export const RedirectHealthToAnalytics: React.FC = () => {
  const navigate = useNavigate();
  const params = useParams<{ tab?: string }>();
  useEffect(() => {
    const mapped = mapHealthTabToAnalyticsTab(params.tab || '');
    navigate(`/dashboard/analytics/${mapped}`, { replace: true });
  }, [navigate, params.tab]);
  return null;
};

