'use client';

import { useRef, useCallback } from 'react';
import { Download } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  PieChart,
  Pie,
  XAxis,
  YAxis,
  Cell,
  CartesianGrid,
  ResponsiveContainer,
  Legend,
} from 'recharts';
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from '@/components/ui/chart';
import type { ChartSpec } from '@/types/chat';

const COLORS = [
  '#4e79a7', '#f28e2b', '#e15759', '#76b7b2', '#59a14f',
  '#edc948', '#b07aa1', '#ff9da7', '#9c755f', '#bab0ac',
  '#6baed6', '#fd8d3c', '#74c476', '#9e9ac8', '#e7969c',
  '#66c2a5', '#fc8d62', '#8da0cb', '#e78ac3', '#a6d854',
];

interface ChatChartProps {
  chart: ChartSpec;
}

function buildConfig(yKeys: string[], data?: Record<string, unknown>[], xKey?: string): ChartConfig {
  const config: ChartConfig = {};
  if (data && xKey) {
    data.forEach((row, i) => {
      const label = String(row[xKey] ?? `Item ${i}`);
      config[label] = {
        label: label.replace(/_/g, ' '),
        color: COLORS[i % COLORS.length],
      };
    });
  }
  yKeys.forEach((key, i) => {
    config[key] = {
      label: key.replace(/_/g, ' '),
      color: COLORS[i % COLORS.length],
    };
  });
  return config;
}

export function ChatChart({ chart }: ChatChartProps) {
  const { type, title, xKey, yKeys, data } = chart;

  const pieData = type === 'pie' && data.length > 8
    ? (() => {
        const sorted = [...data].sort((a, b) => Number(b[yKeys[0]]) - Number(a[yKeys[0]]));
        const top = sorted.slice(0, 7);
        const rest = sorted.slice(7);
        const otherSum = rest.reduce((sum, row) => sum + Number(row[yKeys[0]] || 0), 0);
        return [...top, { [xKey]: 'Other', [yKeys[0]]: otherSum }];
      })()
    : data;

  const config = buildConfig(yKeys, type === 'pie' ? pieData : undefined, type === 'pie' ? xKey : undefined);
  const chartRef = useRef<HTMLDivElement>(null);

  const handleDownload = useCallback(() => {
    const container = chartRef.current;
    if (!container) return;

    const svg = container.querySelector('svg');
    if (!svg) return;

    const svgData = new XMLSerializer().serializeToString(svg);
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const img = new Image();
    const svgBlob = new Blob([svgData], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(svgBlob);

    img.onload = () => {
      const scale = 2;
      canvas.width = img.width * scale;
      canvas.height = img.height * scale;
      ctx.scale(scale, scale);
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, img.width, img.height);
      ctx.drawImage(img, 0, 0);
      URL.revokeObjectURL(url);

      canvas.toBlob((blob) => {
        if (!blob) return;
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = `chart-${Date.now()}.png`;
        a.click();
        URL.revokeObjectURL(a.href);
      }, 'image/png');
    };
    img.src = url;
  }, []);

  return (
    <div className="my-2 overflow-hidden">
      <div className="flex items-center justify-between mb-1">
        <p className="text-xs font-medium text-muted-foreground">{title}</p>
        <Button
          variant="ghost"
          size="sm"
          className="h-6 gap-1 px-2 text-xs text-muted-foreground"
          onClick={handleDownload}
        >
          <Download className="h-3 w-3" />
          PNG
        </Button>
      </div>
      <div ref={chartRef} className="rounded-md border bg-background p-2">
        <ChartContainer config={config} className={cn(type === 'pie' ? 'h-64' : 'h-48', 'w-full')}>
          {type === 'bar' ? (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey={xKey} fontSize={10} tickLine={false} axisLine={false} />
                <YAxis fontSize={10} tickLine={false} axisLine={false} />
                <ChartTooltip content={<ChartTooltipContent />} />
                {yKeys.map((key, i) => (
                  <Bar key={key} dataKey={key} fill={COLORS[i % COLORS.length]} radius={[4, 4, 0, 0]} />
                ))}
              </BarChart>
            </ResponsiveContainer>
          ) : type === 'line' ? (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={data}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey={xKey} fontSize={10} tickLine={false} axisLine={false} />
                <YAxis fontSize={10} tickLine={false} axisLine={false} />
                <ChartTooltip content={<ChartTooltipContent />} />
                {yKeys.map((key, i) => (
                  <Line
                    key={key}
                    type="monotone"
                    dataKey={key}
                    stroke={COLORS[i % COLORS.length]}
                    strokeWidth={2}
                    dot={false}
                  />
                ))}
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <ChartTooltip content={<ChartTooltipContent />} />
                <Legend
                  layout="horizontal"
                  verticalAlign="bottom"
                  wrapperStyle={{ fontSize: 10, paddingTop: 8 }}
                />
                <Pie
                  data={pieData}
                  dataKey={yKeys[0]}
                  nameKey={xKey}
                  cx="50%"
                  cy="50%"
                  outerRadius="70%"
                  label={pieData.length <= 6 ? ({ name }: { name: string }) => name : false}
                  fontSize={10}
                >
                  {pieData.map((_, i) => (
                    <Cell key={i} fill={COLORS[i % COLORS.length]} />
                  ))}
                </Pie>
              </PieChart>
            </ResponsiveContainer>
          )}
        </ChartContainer>
      </div>
    </div>
  );
}
