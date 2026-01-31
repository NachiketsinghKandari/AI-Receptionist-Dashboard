'use client';

import { useState, useCallback, useMemo } from 'react';
import { Filter, Plus, Trash2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';

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

export function DynamicFilterBuilder({
  fields,
  filters,
  onFiltersChange,
  onApply,
  className,
}: DynamicFilterBuilderProps) {
  const [isOpen, setIsOpen] = useState(false);

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

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger asChild>
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
      </PopoverTrigger>
      <PopoverContent
        className="w-[600px] p-0"
        align="end"
        sideOffset={8}
      >
        <div className="p-4">
          {/* Filter rows */}
          <div className="space-y-2">
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

                return (
                  <div
                    key={filter.id}
                    className="flex items-center gap-2"
                  >
                    {/* Where / And label */}
                    <span className="w-12 text-sm text-muted-foreground shrink-0">
                      {index === 0 ? 'Where' : 'And'}
                    </span>

                    {/* Field selector */}
                    <Select
                      value={filter.field}
                      onValueChange={(value) =>
                        updateFilterRow(filter.id, { field: value })
                      }
                    >
                      <SelectTrigger className="w-[140px]">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
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
                        updateFilterRow(filter.id, {
                          condition: value as ConditionOperator,
                        })
                      }
                    >
                      <SelectTrigger className="w-[140px]">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
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
                            onValueChange={(value) =>
                              updateFilterRow(filter.id, { value })
                            }
                          >
                            <SelectTrigger className="flex-1">
                              <SelectValue placeholder="Select value..." />
                            </SelectTrigger>
                            <SelectContent>
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
              Filter
            </Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}

// Export types and utilities for use in pages
export { CONDITION_OPTIONS, conditionRequiresValue };
