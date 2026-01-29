'use client';

import { TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';

interface KPICardProps {
  title: string;
  value: string | number;
  delta?: number;
  deltaLabel?: string;
  icon?: React.ReactNode;
  description?: string;
}

export function KPICard({ title, value, delta, deltaLabel = '%', icon, description }: KPICardProps) {
  const isPositive = delta !== undefined && delta > 0;
  const isNegative = delta !== undefined && delta < 0;
  const isNeutral = delta === undefined || delta === 0;

  return (
    <Card className="overflow-hidden">
      <CardContent className="p-3 md:p-4">
        <div className="flex items-start justify-between">
          <div className="space-y-0.5 md:space-y-1 min-w-0">
            <p className="text-xs md:text-sm font-medium text-muted-foreground">{title}</p>
            <div className="flex items-baseline gap-2">
              <span className="text-xl md:text-2xl font-bold tracking-tight truncate">{value}</span>
            </div>
            {delta !== undefined && (
              <div className="flex items-center gap-1 text-xs">
                {isPositive && (
                  <>
                    <TrendingUp className="h-3 w-3 text-green-500" />
                    <span className="text-green-500">+{Math.abs(delta).toFixed(1)}{deltaLabel}</span>
                  </>
                )}
                {isNegative && (
                  <>
                    <TrendingDown className="h-3 w-3 text-red-500" />
                    <span className="text-red-500">{delta.toFixed(1)}{deltaLabel}</span>
                  </>
                )}
                {isNeutral && (
                  <>
                    <Minus className="h-3 w-3 text-muted-foreground" />
                    <span className="text-muted-foreground">0{deltaLabel}</span>
                  </>
                )}
                <span className="text-muted-foreground hidden sm:inline">vs previous</span>
              </div>
            )}
            {description && (
              <p className="text-xs text-muted-foreground mt-1">{description}</p>
            )}
          </div>
          {icon && (
            <div className="p-2 bg-primary/10 rounded-lg">
              {icon}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
