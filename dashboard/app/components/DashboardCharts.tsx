import React from 'react';

// ─── Sparkline (KPI Mini Chart) ─────────────────────────────────────────────
interface SparklineProps {
  data: number[];
  color?: string;
  width?: number;
  height?: number;
}

export const Sparkline: React.FC<SparklineProps> = ({ data, color = '#2dd4bf', width = 100, height = 30 }) => {
  if (data.length < 2) return null;
  const max = Math.max(...data) || 1;
  const min = Math.min(...data);
  const range = max - min || 1;
  const points = data.map((v, i) => {
    const x = (i / (data.length - 1)) * width;
    const y = height - ((v - min) / range) * height;
    return `${x},${y}`;
  }).join(' ');

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className="overflow-visible">
      <path d={`M ${points}`} fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
};

// ─── Circular Gauge (Health Indicator) ──────────────────────────────────────
interface CircularGaugeProps {
  percent: number;
  size?: number;
  strokeWidth?: number;
  color?: string;
  label?: string;
}

export const CircularGauge: React.FC<CircularGaugeProps> = ({ percent, size = 60, strokeWidth = 4, color = '#2dd4bf', label }) => {
  const radius = (size - strokeWidth) / 2;
  const circumference = radius * 2 * Math.PI;
  const offset = circumference - (percent / 100) * circumference;

  return (
    <div className="relative flex flex-col items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="rotate-[-90deg]">
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth={strokeWidth} />
        <circle 
          cx={size / 2} cy={size / 2} r={radius} fill="none" stroke={color} 
          strokeWidth={strokeWidth} strokeDasharray={circumference} 
          strokeDashoffset={offset} strokeLinecap="round" 
          className="transition-all duration-1000 ease-out"
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center text-[10px] font-mono font-bold text-white">
        {percent}%
      </div>
      {label && <div className="absolute top-full mt-1 text-[8px] font-mono text-muted uppercase text-center">{label}</div>}
    </div>
  );
};

// ─── Hybrid Bar-Line Chart (Spend Distribution) ─────────────────────────────
interface HybridChartProps {
  data: { d: string; total: number; ai: number }[];
}

export const HybridBarLineChart: React.FC<HybridChartProps> = ({ data }) => {
  if (data.length === 0) return <div className="flex h-full items-center justify-center text-muted font-mono text-[10px]">NO_STREAM</div>;
  
  const width = 1000;
  const height = 400;
  const max = Math.max(...data.map(d => d.total)) || 1;
  const barWidth = (width / data.length) * 0.6;
  const gap = (width / data.length) * 0.4;

  const linePoints = data.map((d, i) => {
    const x = (i / (data.length - 1)) * width;
    const y = height - (d.ai / max) * height;
    return `${x},${y}`;
  }).join(' ');

  return (
    <div className="w-full h-full relative group">
      <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-full" preserveAspectRatio="none">
        <defs>
          <linearGradient id="barGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#3a9fe8" stopOpacity="0.8" />
            <stop offset="100%" stopColor="#3a9fe8" stopOpacity="0.1" />
          </linearGradient>
        </defs>
        
        {/* Bars */}
        {data.map((d, i) => {
          const x = i * (barWidth + gap) + gap / 2;
          const h = (d.total / max) * height;
          return (
            <rect 
              key={i} x={x} y={height - h} width={barWidth} height={h} 
              fill="url(#barGrad)" rx="2" className="transition-all hover:brightness-125"
            />
          );
        })}

        {/* AI Line Overlay */}
        <path d={`M ${linePoints}`} fill="none" stroke="#2dd4bf" strokeWidth="3" strokeLinecap="round" />
        {data.map((d, i) => (
          <circle 
            key={i} cx={(i / (data.length - 1)) * width} cy={height - (d.ai / max) * height} 
            r="4" fill="#2dd4bf" stroke="#00212b" strokeWidth="2"
          />
        ))}
      </svg>
      
      {/* Mockup Tooltip simulation on hover */}
      <div className="absolute top-10 right-10 bg-solar-base02/90 border border-white/10 p-3 rounded-lg backdrop-blur-md opacity-0 group-hover:opacity-100 transition-opacity">
        <div className="text-[10px] font-mono text-cyan-400 mb-1">DATA_STREAM_0x4F</div>
        <div className="flex justify-between gap-8 text-[12px] font-mono font-bold">
          <span>AI SPEND</span>
          <span>$227.14</span>
        </div>
      </div>
    </div>
  );
};

// ─── Donut Chart (Resource Usage) ───────────────────────────────────────────
export const DonutChart: React.FC<{ items: { label: string; value: number; color: string }[] }> = ({ items }) => {
  const size = 120;
  const strokeWidth = 14;
  const radius = (size - strokeWidth) / 2;
  const circumference = radius * 2 * Math.PI;
  let currentOffset = 0;

  return (
    <div className="relative flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="rotate-[-90deg]">
        {items.map((item, i) => {
          const dash = (item.value / 100) * circumference;
          const offset = currentOffset;
          currentOffset += dash;
          return (
            <circle 
              key={i} cx={size / 2} cy={size / 2} r={radius} fill="none" 
              stroke={item.color} strokeWidth={strokeWidth} 
              strokeDasharray={`${dash} ${circumference}`} 
              strokeDashoffset={-offset}
            />
          );
        })}
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center font-mono">
        <span className="text-lg font-black italic">$227</span>
        <span className="text-[8px] text-muted uppercase">Billing</span>
      </div>
    </div>
  );
};
