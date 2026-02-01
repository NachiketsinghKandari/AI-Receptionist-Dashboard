'use client';

import { useState, useCallback, useMemo } from 'react';
import { Filter, Plus, Trash2, X, ChevronDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { useMediaQuery } from '@/hooks/use-media-query';

// Field types determine available conditions
export type FieldType = 'text' | 'number' | 'date' | 'select' | 'boolean';

// Condition operators
export type ConditionOperator =
  | 'equals'
  | 'not_equals'
  | 'contains'
  | 'not_contains'
  | 'starts_with'
  | 'ends_with'
  | 'greater_than'
  | 'less_than'
  | 'greater_or_equal'
  | 'less_or_equal'
  | 'is_empty'
  | 'is_not_empty'
  | 'is_true'
  | 'is_false';

// Field definition
export interface FilterFieldDefinition {
  key: string;
  label: string;
  type: FieldType;
  options?: { value: string; label: string }[]; // For select fields
}

// A single filter row
export interface FilterRow {
  id: string;
  field: string;
  condition: ConditionOperator;
  value: string;
  combinator: 'and' | 'or'; // How this filter connects to previous filters
}

// Conditions available per field type
const CONDITION_OPTIONS: Record<FieldType, { value: ConditionOperator; label: string }[]> = {
  text: [
    { value: 'equals', label: 'Equals' },
    { value: 'not_equals', label: 'Not equals' },
    { value: 'contains', label: 'Contains' },
    { value: 'not_contains', label: 'Does not contain' },
    { value: 'starts_with', label: 'Starts with' },
    { value: 'ends_with', label: 'Ends with' },
    { value: 'is_empty', label: 'Is empty' },
    { value: 'is_not_empty', label: 'Is not empty' },
  ],
  number: [
    { value: 'equals', label: 'Equals' },
    { value: 'not_equals', label: 'Not equals' },
    { value: 'greater_than', label: 'Greater than' },
    { value: 'less_than', label: 'Less than' },
    { value: 'greater_or_equal', label: 'Greater or equal' },
    { value: 'less_or_equal', label: 'Less or equal' },
    { value: 'is_empty', label: 'Is empty' },
    { value: 'is_not_empty', label: 'Is not empty' },
  ],
  date: [
    { value: 'equals', label: 'Equals' },
    { value: 'not_equals', label: 'Not equals' },
    { value: 'greater_than', label: 'After' },
    { value: 'less_than', label: 'Before' },
    { value: 'greater_or_equal', label: 'On or after' },
    { value: 'less_or_equal', label: 'On or before' },
    { value: 'is_empty', label: 'Is empty' },
    { value: 'is_not_empty', label: 'Is not empty' },
  ],
  select: [
    { value: 'equals', label: 'Equals' },
    { value: 'not_equals', label: 'Not equals' },
    { value: 'is_empty', label: 'Is empty' },
    { value: 'is_not_empty', label: 'Is not empty' },
  ],
  boolean: [
    { value: 'is_true', label: 'Is true' },
    { value: 'is_false', label: 'Is false' },
  ],
};

// Check if condition requires a value input
function conditionRequiresValue(condition: ConditionOperator): boolean {
  return !['is_empty', 'is_not_empty', 'is_true', 'is_false'].includes(condition);
}

// Generate unique ID
function generateId(): string {
  return Math.random().toString(36).substring(2, 9);
}

interface DynamicFilterBuilderProps {
  fields: FilterFieldDefinition[];
  filters: FilterRow[];
  onFiltersChange: (filters: FilterRow[]) => void;
  onApply: () => void;
  className?: string;
}

// Shared filter row component for mobile layout (stacked)
function MobileFilterRow({
  filter,
  index,
  fieldDef,
  conditions,
  showValueInput,
  fields,
  updateFilterRow,
  removeFilterRow,
}: {
  filter: FilterRow;
  index: number;
  fieldDef: FilterFieldDefinition | undefined;
  conditions: { value: ConditionOperator; label: string }[];
  showValueInput: boolean;
  fields: FilterFieldDefinition[];
  updateFilterRow: (id: string, updates: Partial<FilterRow>) => void;
  removeFilterRow: (id: string) => void;
}) {
  return (
    <div className="border rounded-lg p-3 space-y-2 bg-muted/30">
      {/* Header with label and delete */}
      <div className="flex items-center justify-between">
        {index === 0 ? (
          <span className="text-sm font-medium text-muted-foreground">Where</span>
        ) : (
          <button
            type="button"
            onClick={() => updateFilterRow(filter.id, { combinator: filter.combinator === 'and' ? 'or' : 'and' })}
            className="text-sm font-medium px-2 py-0.5 rounded transition-colors inline-flex items-center gap-1 hover:bg-accent cursor-pointer text-foreground border border-input bg-background"
            title="Click to toggle between And/Or"
          >
            {filter.combinator === 'and' ? 'And' : 'Or'}
            <ChevronDown className="h-3 w-3 opacity-50" />
          </button>
        )}
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 text-muted-foreground hover:text-destructive"
          onClick={() => removeFilterRow(filter.id)}
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>

      {/* Field selector */}
      <Select
        value={filter.field}
        onValueChange={(value) => updateFilterRow(filter.id, { field: value })}
      >
        <SelectTrigger className="w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent side="bottom">
          {fields.map((field) => (
            <SelectItem key={field.key} value={field.key}>
              {field.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {/* Condition selector */}
      <Select
        value={filter.condition}
        onValueChange={(value) =>
          updateFilterRow(filter.id, { condition: value as ConditionOperator })
        }
      >
        <SelectTrigger className="w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent side="bottom">
          {conditions.map((cond) => (
            <SelectItem key={cond.value} value={cond.value}>
              {cond.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {/* Value input */}
      {showValueInput && (
        <>
          {fieldDef?.type === 'select' && fieldDef.options ? (
            <Select
              value={filter.value}
              onValueChange={(value) => updateFilterRow(filter.id, { value })}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Select value..." />
              </SelectTrigger>
              <SelectContent side="bottom">
                {fieldDef.options.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : fieldDef?.type === 'date' ? (
            <Input
              type="date"
              value={filter.value}
              onChange={(e) =>
                updateFilterRow(filter.id, { value: e.target.value })
              }
              className="w-full"
            />
          ) : fieldDef?.type === 'number' ? (
            <Input
              type="number"
              value={filter.value}
              onChange={(e) =>
                updateFilterRow(filter.id, { value: e.target.value })
              }
              placeholder="Enter value..."
              className="w-full"
            />
          ) : (
            <Input
              type="text"
              value={filter.value}
              onChange={(e) =>
                updateFilterRow(filter.id, { value: e.target.value })
              }
              placeholder="Enter value..."
              className="w-full"
            />
          )}
        </>
      )}
    </div>
  );
}

// Shared filter row component for desktop layout (inline)
function DesktopFilterRow({
  filter,
  index,
  fieldDef,
  conditions,
  showValueInput,
  fields,
  updateFilterRow,
  removeFilterRow,
}: {
  filter: FilterRow;
  index: number;
  fieldDef: FilterFieldDefinition | undefined;
  conditions: { value: ConditionOperator; label: string }[];
  showValueInput: boolean;
  fields: FilterFieldDefinition[];
  updateFilterRow: (id: string, updates: Partial<FilterRow>) => void;
  removeFilterRow: (id: string) => void;
}) {
  return (
    <div className="flex items-center gap-2">
      {/* Where / And|Or label */}
      {index === 0 ? (
        <span className="w-14 text-sm text-muted-foreground shrink-0">Where</span>
      ) : (
        <button
          type="button"
          onClick={() => updateFilterRow(filter.id, { combinator: filter.combinator === 'and' ? 'or' : 'and' })}
          className="w-14 h-8 text-sm shrink-0 transition-colors rounded-md px-2 inline-flex items-center justify-between hover:bg-accent cursor-pointer text-foreground border border-input bg-background"
          title="Click to toggle between And/Or"
        >
          <span>{filter.combinator === 'and' ? 'And' : 'Or'}</span>
          <ChevronDown className="h-3 w-3 opacity-50" />
        </button>
      )}

      {/* Field selector */}
      <Select
        value={filter.field}
        onValueChange={(value) => updateFilterRow(filter.id, { field: value })}
      >
        <SelectTrigger className="w-[140px]">
          <SelectValue />
        </SelectTrigger>
        <SelectContent side="bottom">
          {fields.map((field) => (
            <SelectItem key={field.key} value={field.key}>
              {field.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {/* Condition selector */}
      <Select
        value={filter.condition}
        onValueChange={(value) =>
          updateFilterRow(filter.id, { condition: value as ConditionOperator })
        }
      >
        <SelectTrigger className="w-[140px]">
          <SelectValue />
        </SelectTrigger>
        <SelectContent side="bottom">
          {conditions.map((cond) => (
            <SelectItem key={cond.value} value={cond.value}>
              {cond.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {/* Value input */}
      {showValueInput && (
        <>
          {fieldDef?.type === 'select' && fieldDef.options ? (
            <Select
              value={filter.value}
              onValueChange={(value) => updateFilterRow(filter.id, { value })}
            >
              <SelectTrigger className="flex-1">
                <SelectValue placeholder="Select value..." />
              </SelectTrigger>
              <SelectContent side="bottom">
                {fieldDef.options.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : fieldDef?.type === 'date' ? (
            <Input
              type="date"
              value={filter.value}
              onChange={(e) =>
                updateFilterRow(filter.id, { value: e.target.value })
              }
              className="flex-1"
            />
          ) : fieldDef?.type === 'number' ? (
            <Input
              type="number"
              value={filter.value}
              onChange={(e) =>
                updateFilterRow(filter.id, { value: e.target.value })
              }
              placeholder="Enter value..."
              className="flex-1"
            />
          ) : (
            <Input
              type="text"
              value={filter.value}
              onChange={(e) =>
                updateFilterRow(filter.id, { value: e.target.value })
              }
              placeholder="Enter value..."
              className="flex-1"
            />
          )}
        </>
      )}

      {/* Spacer when no value input */}
      {!showValueInput && <div className="flex-1" />}

      {/* Delete button */}
      <Button
        variant="ghost"
        size="icon"
        className="h-9 w-9 shrink-0 text-muted-foreground hover:text-destructive"
        onClick={() => removeFilterRow(filter.id)}
      >
        <Trash2 className="h-4 w-4" />
      </Button>
    </div>
  );
}

// Shared filter content component
function FilterContent({
  filters,
  fieldMap,
  fields,
  addFilterRow,
  updateFilterRow,
  removeFilterRow,
  clearAllFilters,
  handleApply,
  isMobile,
}: {
  filters: FilterRow[];
  fieldMap: Map<string, FilterFieldDefinition>;
  fields: FilterFieldDefinition[];
  addFilterRow: () => void;
  updateFilterRow: (id: string, updates: Partial<FilterRow>) => void;
  removeFilterRow: (id: string) => void;
  clearAllFilters: () => void;
  handleApply: () => void;
  isMobile: boolean;
}) {
  return (
    <div className={cn('p-4', isMobile && 'pb-8')}>
      {/* Filter rows */}
      <div className={cn('space-y-2', isMobile && 'space-y-3')}>
        {filters.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4 text-center">
            No filters applied. Click &quot;+ Add&quot; to create a filter.
          </p>
        ) : (
          filters.map((filter, index) => {
            const fieldDef = fieldMap.get(filter.field);
            const conditions = fieldDef
              ? CONDITION_OPTIONS[fieldDef.type]
              : CONDITION_OPTIONS.text;
            const showValueInput = conditionRequiresValue(filter.condition);

            return isMobile ? (
              <MobileFilterRow
                key={filter.id}
                filter={filter}
                index={index}
                fieldDef={fieldDef}
                conditions={conditions}
                showValueInput={showValueInput}
                fields={fields}
                updateFilterRow={updateFilterRow}
                removeFilterRow={removeFilterRow}
              />
            ) : (
              <DesktopFilterRow
                key={filter.id}
                filter={filter}
                index={index}
                fieldDef={fieldDef}
                conditions={conditions}
                showValueInput={showValueInput}
                fields={fields}
                updateFilterRow={updateFilterRow}
                removeFilterRow={removeFilterRow}
              />
            );
          })
        )}
      </div>

      {/* Actions */}
      <div className="flex items-center justify-between mt-4 pt-4 border-t">
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={addFilterRow}
            className="gap-1"
          >
            <Plus className="h-3.5 w-3.5" />
            Add
          </Button>
          {filters.length > 0 && (
            <Button
              variant="ghost"
              size="sm"
              onClick={clearAllFilters}
              className="gap-1 text-muted-foreground"
            >
              <X className="h-3.5 w-3.5" />
              Clear
            </Button>
          )}
        </div>
        <Button size="sm" onClick={handleApply}>
          Apply Filters
        </Button>
      </div>
    </div>
  );
}

export function DynamicFilterBuilder({
  fields,
  filters,
  onFiltersChange,
  onApply,
  className,
}: DynamicFilterBuilderProps) {
  const [isOpen, setIsOpen] = useState(false);
  const isDesktop = useMediaQuery('(min-width: 768px)');

  // Create a field lookup map
  const fieldMap = useMemo(() => {
    const map = new Map<string, FilterFieldDefinition>();
    fields.forEach((field) => map.set(field.key, field));
    return map;
  }, [fields]);

  // Add a new filter row
  const addFilterRow = useCallback(() => {
    const defaultField = fields[0];
    const defaultConditions = CONDITION_OPTIONS[defaultField.type];
    const newRow: FilterRow = {
      id: generateId(),
      field: defaultField.key,
      condition: defaultConditions[0].value,
      value: '',
      combinator: 'and', // Default to AND for new rows
    };
    onFiltersChange([...filters, newRow]);
  }, [fields, filters, onFiltersChange]);

  // Remove a filter row
  const removeFilterRow = useCallback(
    (id: string) => {
      onFiltersChange(filters.filter((f) => f.id !== id));
    },
    [filters, onFiltersChange]
  );

  // Update a filter row
  const updateFilterRow = useCallback(
    (id: string, updates: Partial<FilterRow>) => {
      onFiltersChange(
        filters.map((f) => {
          if (f.id !== id) return f;

          const updated = { ...f, ...updates };

          // If field changed, reset condition to first valid option
          if (updates.field && updates.field !== f.field) {
            const newField = fieldMap.get(updates.field);
            if (newField) {
              const conditions = CONDITION_OPTIONS[newField.type];
              updated.condition = conditions[0].value;
              updated.value = '';
            }
          }

          return updated;
        })
      );
    },
    [filters, onFiltersChange, fieldMap]
  );

  // Clear all filters
  const clearAllFilters = useCallback(() => {
    onFiltersChange([]);
  }, [onFiltersChange]);

  // Apply filters and close
  const handleApply = useCallback(() => {
    onApply();
    setIsOpen(false);
  }, [onApply]);

  // Count active filters (non-empty)
  const activeFilterCount = filters.filter(
    (f) => f.value || !conditionRequiresValue(f.condition)
  ).length;

  const triggerButton = (
    <Button
      variant={activeFilterCount > 0 ? 'default' : 'outline'}
      size="sm"
      className={cn('gap-1.5', className)}
    >
      <Filter className="h-4 w-4" />
      Filters
      {activeFilterCount > 0 && (
        <Badge
          variant="secondary"
          className="ml-1 h-5 min-w-5 px-1.5 text-xs bg-primary-foreground text-primary"
        >
          {activeFilterCount}
        </Badge>
      )}
    </Button>
  );

  // Desktop: Use Popover
  if (isDesktop) {
    return (
      <Popover open={isOpen} onOpenChange={setIsOpen}>
        <PopoverTrigger asChild>{triggerButton}</PopoverTrigger>
        <PopoverContent className="w-[600px] p-0" align="end" sideOffset={8}>
          <FilterContent
            filters={filters}
            fieldMap={fieldMap}
            fields={fields}
            addFilterRow={addFilterRow}
            updateFilterRow={updateFilterRow}
            removeFilterRow={removeFilterRow}
            clearAllFilters={clearAllFilters}
            handleApply={handleApply}
            isMobile={false}
          />
        </PopoverContent>
      </Popover>
    );
  }

  // Mobile: Use Sheet (bottom slide-up)
  return (
    <Sheet open={isOpen} onOpenChange={setIsOpen}>
      <SheetTrigger asChild>{triggerButton}</SheetTrigger>
      <SheetContent side="bottom" className="max-h-[85vh] overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Complex Filters</SheetTitle>
        </SheetHeader>
        <FilterContent
          filters={filters}
          fieldMap={fieldMap}
          fields={fields}
          addFilterRow={addFilterRow}
          updateFilterRow={updateFilterRow}
          removeFilterRow={removeFilterRow}
          clearAllFilters={clearAllFilters}
          handleApply={handleApply}
          isMobile={true}
        />
      </SheetContent>
    </Sheet>
  );
}

// Export types and utilities for use in pages
export { CONDITION_OPTIONS, conditionRequiresValue };
