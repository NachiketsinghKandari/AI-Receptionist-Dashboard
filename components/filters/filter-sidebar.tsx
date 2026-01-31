'use client';

import { Search } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { useFirms } from '@/hooks/use-firms';
import type { Firm } from '@/types/database';

export type DateFilterMode = 'today' | 'yesterday' | 'custom' | 'all';

export interface FilterSidebarProps {
  dateFilterMode: DateFilterMode;
  onDateFilterModeChange: (value: DateFilterMode) => void;
  startDate: string;
  onStartDateChange: (value: string) => void;
  endDate: string;
  onEndDateChange: (value: string) => void;
  search: string;
  onSearchChange: (value: string) => void;
  searchHelpText?: string;
  firmId: number | null;
  onFirmIdChange: (value: number | null) => void;
  hideFirmFilter?: boolean;
  limit: number;
  onLimitChange: (value: number) => void;
  children?: React.ReactNode;
  className?: string;
  hideHeader?: boolean;
  /** Optional action element to show next to the Filters header (e.g., dynamic filter builder) */
  headerAction?: React.ReactNode;
}

export function FilterSidebar({
  dateFilterMode,
  onDateFilterModeChange,
  startDate,
  onStartDateChange,
  endDate,
  onEndDateChange,
  search,
  onSearchChange,
  searchHelpText,
  firmId,
  onFirmIdChange,
  hideFirmFilter,
  limit,
  onLimitChange,
  children,
  className,
  hideHeader,
  headerAction,
}: FilterSidebarProps) {
  const { data: firmsData } = useFirms();
  // Sort firms by ID (ascending)
  const firms = [...(firmsData?.firms ?? [])].sort((a, b) => a.id - b.id);

  return (
    <div className={cn("w-64 shrink-0 flex flex-col bg-card border-r border-border", className)}>
      <div className="flex-1 min-h-0 overflow-y-auto p-4 space-y-4">
        {!hideHeader && (
          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-lg">Filters</h2>
            {headerAction}
          </div>
        )}

        {/* Date Filter Mode */}
        <div className="space-y-2">
          <Label className="text-sm">Date Filtering</Label>
          <ToggleGroup
            type="single"
            value={dateFilterMode}
            onValueChange={(value) => {
              if (value) onDateFilterModeChange(value as DateFilterMode);
            }}
            className="w-full"
          >
            <ToggleGroupItem value="today" size="sm" className="flex-1 text-xs px-1">
              Today
            </ToggleGroupItem>
            <ToggleGroupItem value="yesterday" size="sm" className="flex-1 text-xs px-1">
              Yesterday
            </ToggleGroupItem>
            <ToggleGroupItem value="custom" size="sm" className="flex-1 text-xs px-1">
              Custom
            </ToggleGroupItem>
            <ToggleGroupItem value="all" size="sm" className="flex-1 text-xs px-1">
              All
            </ToggleGroupItem>
          </ToggleGroup>
        </div>

        {/* Date Range - only show for custom mode */}
        {dateFilterMode === 'custom' && (
          <div className="space-y-2">
            <div>
              <Label htmlFor="startDate" className="text-sm">
                Start Date
              </Label>
              <Input
                id="startDate"
                type="date"
                value={startDate}
                onChange={(e) => onStartDateChange(e.target.value)}
                className="mt-1"
              />
            </div>
            <div>
              <Label htmlFor="endDate" className="text-sm">
                End Date
              </Label>
              <Input
                id="endDate"
                type="date"
                value={endDate}
                onChange={(e) => onEndDateChange(e.target.value)}
                className="mt-1"
              />
            </div>
          </div>
        )}

        {/* Search */}
        <div>
          <Label htmlFor="search" className="text-sm flex items-center gap-1.5">
            <Search className="h-3.5 w-3.5" />
            Search
          </Label>
          <Input
            id="search"
            type="text"
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Search..."
            className="mt-1"
            title={searchHelpText}
          />
          {searchHelpText && (
            <p className="text-xs text-muted-foreground mt-1">{searchHelpText}</p>
          )}
        </div>

        {/* Firm Filter */}
        {!hideFirmFilter && (
          <div>
            <Label className="text-sm">Firm</Label>
            <Select
              value={firmId ? String(firmId) : 'all'}
              onValueChange={(v) => onFirmIdChange(v === 'all' ? null : parseInt(v))}
            >
              <SelectTrigger className="mt-1">
                <SelectValue placeholder="All Firms" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Firms</SelectItem>
                {firms.map((firm: Firm) => (
                  <SelectItem key={firm.id} value={String(firm.id)}>
                    {firm.name} (ID: {firm.id})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        {/* Page-specific filters */}
        {children}

        {/* Results per page */}
        <div>
          <Label className="text-sm">Results per page</Label>
          <Input
            type="number"
            min={10}
            max={100}
            value={limit}
            onChange={(e) => onLimitChange(parseInt(e.target.value) || 25)}
            className="mt-1"
          />
        </div>
      </div>
    </div>
  );
}
