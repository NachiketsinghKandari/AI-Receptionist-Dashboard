'use client';

import { useState } from 'react';
import Link from 'next/link';
import {
  Phone,
  Mail,
  ArrowLeftRight,
  Bug,
  Webhook,
  Clock,
  Activity,
  ArrowRight,
  Calendar,
  BarChart3,
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { KPICard } from '@/components/charts/kpi-card';
import { CallVolumeChart } from '@/components/charts/call-volume-chart';
import { useOverviewStats } from '@/hooks/use-overview-stats';
import { useChartData } from '@/hooks/use-chart-data';
import { useDashboardPrefetch } from '@/hooks/use-dashboard-prefetch';
import { formatDuration } from '@/lib/formatting';
import { useUser } from '@/hooks/use-user';
import { useEnvironment } from '@/components/providers/environment-provider';
import { format, subDays, startOfDay, endOfDay } from 'date-fns';

type TimeRange = 'day' | 'week' | 'month' | 'all';
type StatsPeriod = 'Today' | 'This Month';

const quickLinks = [
  {
    href: '/calls',
    icon: Phone,
    title: 'Calls',
    description: 'View call records, summaries, and transcripts',
    color: 'text-blue-500',
    bgColor: 'bg-blue-500/10',
  },
  {
    href: '/emails',
    icon: Mail,
    title: 'Emails',
    description: 'Monitor email logs for new case leads',
    color: 'text-green-500',
    bgColor: 'bg-green-500/10',
  },
  {
    href: '/transfers',
    icon: ArrowLeftRight,
    title: 'Transfers',
    description: 'Track transfers to case managers',
    color: 'text-orange-500',
    bgColor: 'bg-orange-500/10',
  },
  {
    href: '/sentry',
    icon: Bug,
    title: 'Sentry',
    description: 'View Sentry events and logs',
    color: 'text-red-500',
    bgColor: 'bg-red-500/10',
  },
  {
    href: '/webhooks',
    icon: Webhook,
    title: 'Webhooks',
    description: 'Inspect incoming webhook payloads',
    color: 'text-purple-500',
    bgColor: 'bg-purple-500/10',
  },
];

export default function HomePage() {
  const [statsPeriod, setStatsPeriod] = useState<StatsPeriod>('Today');
  const [timeRange, setTimeRange] = useState<TimeRange>('week');
  const { user } = useUser();
  const { environment } = useEnvironment();

  // Prefetch all chart and overview data for instant tab switching
  useDashboardPrefetch();

  const now = new Date();

  // Calculate chart date range based on timeRange
  let chartStartDate: string | undefined;
  let chartEndDate: string | undefined;
  let isHourly = false;

  switch (timeRange) {
    case 'day':
      chartStartDate = startOfDay(now).toISOString();
      chartEndDate = endOfDay(now).toISOString();
      isHourly = true;
      break;
    case 'week':
      chartStartDate = startOfDay(subDays(now, 6)).toISOString();
      chartEndDate = endOfDay(now).toISOString();
      break;
    case 'month':
      chartStartDate = startOfDay(subDays(now, 29)).toISOString();
      chartEndDate = endOfDay(now).toISOString();
      break;
    case 'all':
    default:
      // For "All Time", don't set date filters - API will fetch all data
      chartStartDate = undefined;
      chartEndDate = undefined;
      break;
  }

  // Separate hooks for independent data fetching
  const { data: overviewStats, isLoading: isOverviewLoading } = useOverviewStats({
    period: statsPeriod,
  });

  const { data: chartResponse, isLoading: isChartLoading } = useChartData({
    startDate: chartStartDate,
    endDate: chartEndDate,
    isHourly,
  });

  // Calculate deltas for KPI cards
  const callsDelta = overviewStats
    ? overviewStats.previous.totalCalls > 0
      ? ((overviewStats.current.totalCalls - overviewStats.previous.totalCalls) / overviewStats.previous.totalCalls) * 100
      : 0
    : 0;

  const durationDelta = overviewStats
    ? overviewStats.previous.avgDuration > 0
      ? ((overviewStats.current.avgDuration - overviewStats.previous.avgDuration) / overviewStats.previous.avgDuration) * 100
      : 0
    : 0;

  const transferDelta = overviewStats
    ? overviewStats.current.transferRate - overviewStats.previous.transferRate
    : 0;

  const emailsDelta = overviewStats
    ? overviewStats.previous.emailsSent > 0
      ? ((overviewStats.current.emailsSent - overviewStats.previous.emailsSent) / overviewStats.previous.emailsSent) * 100
      : 0
    : 0;

  // Chart data
  const chartData = chartResponse?.data ?? [];

  const chartTitle = timeRange === 'day'
    ? `Hourly Call Volume - ${format(now, 'MMM d, yyyy')}`
    : timeRange === 'all'
    ? 'Daily Call Volume (All Time)'
    : `Daily Call Volume (${timeRange === 'week' ? '7' : '30'} Days)`;

  return (
    <div className="p-6 space-y-8">
      {/* Header */}
      <div className="flex flex-col gap-1">
        <p className="text-sm text-muted-foreground">
          HelloCounsel {environment.charAt(0).toUpperCase() + environment.slice(1)}
        </p>
        <h1 className="text-3xl font-bold tracking-tight">
          Welcome {user?.username || 'User'}
        </h1>
        <p className="text-muted-foreground mt-1">
          Call routing and management dashboard
        </p>
      </div>

      {/* Quick Links */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
        {quickLinks.map((link) => (
          <Link key={link.href} href={link.href}>
            <Card className="h-full hover:shadow-md transition-shadow cursor-pointer group">
              <CardContent className="p-4">
                <div className="flex flex-col gap-3">
                  <div className={`p-2 rounded-lg w-fit ${link.bgColor}`}>
                    <link.icon className={`h-5 w-5 ${link.color}`} />
                  </div>
                  <div>
                    <h3 className="font-semibold flex items-center gap-1 group-hover:text-primary transition-colors">
                      {link.title}
                      <ArrowRight className="h-3 w-3 opacity-0 group-hover:opacity-100 transition-opacity" />
                    </h3>
                    <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                      {link.description}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>

      <Separator />

      {/* Stats Section */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-semibold flex items-center gap-2">
              <Activity className="h-5 w-5" />
              Overview
            </h2>
            <p className="text-sm text-muted-foreground">Key metrics at a glance</p>
          </div>
          <Select value={statsPeriod} onValueChange={(v) => setStatsPeriod(v as StatsPeriod)}>
            <SelectTrigger className="w-[140px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="Today">Today</SelectItem>
              <SelectItem value="This Month">This Month</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {isOverviewLoading ? (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {[...Array(4)].map((_, i) => (
              <Skeleton key={i} className="h-24" />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <KPICard
              title="Total Calls"
              value={overviewStats?.current.totalCalls ?? 0}
              delta={callsDelta}
              icon={<Phone className="h-4 w-4 text-primary" />}
            />
            <KPICard
              title="Avg Duration"
              value={formatDuration(overviewStats?.current.avgDuration ?? 0)}
              delta={durationDelta}
              icon={<Clock className="h-4 w-4 text-primary" />}
            />
            <KPICard
              title="Transfer Rate"
              value={`${(overviewStats?.current.transferRate ?? 0).toFixed(1)}%`}
              delta={transferDelta}
              deltaLabel="pp"
              icon={<ArrowLeftRight className="h-4 w-4 text-primary" />}
            />
            <KPICard
              title="Emails Sent"
              value={overviewStats?.current.emailsSent ?? 0}
              delta={emailsDelta}
              icon={<Mail className="h-4 w-4 text-primary" />}
            />
          </div>
        )}
      </div>

      {/* Chart Section */}
      <Card>
        <CardHeader className="pb-4">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <BarChart3 className="h-5 w-5" />
                Call Volume
              </CardTitle>
              <CardDescription>
                {chartTitle}
              </CardDescription>
            </div>
            <Tabs value={timeRange} onValueChange={(v) => setTimeRange(v as TimeRange)}>
              <TabsList>
                <TabsTrigger value="day">Today</TabsTrigger>
                <TabsTrigger value="week">7 Days</TabsTrigger>
                <TabsTrigger value="month">30 Days</TabsTrigger>
                <TabsTrigger value="all">All</TabsTrigger>
              </TabsList>
            </Tabs>
          </div>
        </CardHeader>
        <CardContent>
          {isChartLoading ? (
            <Skeleton className="h-[350px]" />
          ) : (
            <CallVolumeChart
              data={chartData}
              isHourly={isHourly}
            />
          )}
        </CardContent>
      </Card>

      {/* Summary Stats */}
      {chartData.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-blue-500/10 rounded-lg">
                  <Phone className="h-4 w-4 text-blue-500" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Total in Period</p>
                  <p className="text-lg font-bold">
                    {chartData.reduce((sum, d) => sum + d.calls, 0)}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-green-500/10 rounded-lg">
                  <Activity className="h-4 w-4 text-green-500" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">
                    {isHourly ? 'Peak Hour' : 'Avg/Day'}
                  </p>
                  <p className="text-lg font-bold">
                    {isHourly
                      ? format(
                          new Date(
                            chartData.reduce((max, d) =>
                              d.calls > max.calls ? d : max
                            ).date
                          ),
                          'HH:00'
                        )
                      : (
                          chartData.reduce((sum, d) => sum + d.calls, 0) /
                          chartData.length
                        ).toFixed(1)}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-orange-500/10 rounded-lg">
                  <BarChart3 className="h-4 w-4 text-orange-500" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">
                    {isHourly ? 'Peak Volume' : 'Peak Day'}
                  </p>
                  <p className="text-lg font-bold">
                    {Math.max(...chartData.map((d) => d.calls))}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-purple-500/10 rounded-lg">
                  <Calendar className="h-4 w-4 text-purple-500" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">
                    {isHourly ? 'Date' : 'Days'}
                  </p>
                  <p className="text-lg font-bold">
                    {isHourly ? format(now, 'MMM d') : chartData.length}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
