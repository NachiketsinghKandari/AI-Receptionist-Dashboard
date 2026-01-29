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
      // Keys are in format "2026-01-29T10" — extract hour directly
      const hour = parseInt(value.split('T')[1], 10);
      const ampm = hour >= 12 ? 'PM' : 'AM';
      const h12 = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour;
      return `${h12} ${ampm}`;
    }
    const date = new Date(value);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  const formatTooltipLabel = (value: string) => {
    if (isHourly) {
      // Keys are in format "2026-01-29T10" — parse directly
      const [datePart, hourPart] = value.split('T');
      const hour = parseInt(hourPart, 10);
      const ampm = hour >= 12 ? 'PM' : 'AM';
      const h12 = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour;
      const dateObj = new Date(datePart + 'T12:00:00'); // noon to avoid timezone shift
      const monthDay = dateObj.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      return `${monthDay}, ${h12}:00 ${ampm} ET`;
    }
    return new Date(value).toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
    });
  };

  return (
    <ChartContainer config={chartConfig} className="h-[250px] sm:h-[300px] md:h-[350px] w-full">
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
