'use client';

import {
  XAxis,
  YAxis,
  CartesianGrid,
  Area,
  AreaChart,
} from 'recharts';
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from '@/components/ui/chart';
import type { ChartDataPoint } from '@/types/api';

interface CallVolumeChartProps {
  data: ChartDataPoint[];
  isHourly?: boolean;
}

const chartConfig = {
  calls: {
    label: 'Calls',
    theme: {
      light: 'hsl(200, 100%, 43%)',
      dark: 'hsl(200, 100%, 50%)',
    },
  },
} satisfies ChartConfig;

export function CallVolumeChart({ data, isHourly = false }: CallVolumeChartProps) {
  const formatXAxis = (value: string) => {
    if (isHourly) {
      const hour = new Date(value).getHours();
      return `${hour}:00`;
    }
    const date = new Date(value);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  const formatTooltipLabel = (value: string) => {
    if (isHourly) {
      return new Date(value).toLocaleTimeString('en-US', {
        hour: 'numeric',
        minute: '2-digit',
      });
    }
    return new Date(value).toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
    });
  };

  return (
    <ChartContainer config={chartConfig} className="h-[350px] w-full">
      <AreaChart
        data={data}
        margin={{ top: 10, right: 10, left: 0, bottom: 0 }}
      >
        <defs>
          <linearGradient id="colorCalls" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="var(--color-calls)" stopOpacity={0.3} />
            <stop offset="95%" stopColor="var(--color-calls)" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" vertical={false} />
        <XAxis
          dataKey="date"
          tickFormatter={formatXAxis}
          tickLine={false}
          axisLine={false}
          tickMargin={8}
        />
        <YAxis
          tickLine={false}
          axisLine={false}
          tickMargin={8}
        />
        <ChartTooltip
          content={
            <ChartTooltipContent
              labelFormatter={formatTooltipLabel}
              indicator="line"
            />
          }
        />
        <Area
          type="monotone"
          dataKey="calls"
          stroke="var(--color-calls)"
          strokeWidth={2}
          fill="url(#colorCalls)"
        />
      </AreaChart>
    </ChartContainer>
  );
}
