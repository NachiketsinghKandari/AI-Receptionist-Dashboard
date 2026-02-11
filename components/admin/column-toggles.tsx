'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { ChevronDown } from 'lucide-react';
import type { ColumnToggles } from '@/types/client-config';

// Define known columns for each page
const PAGE_COLUMNS: Record<string, { key: string; label: string }[]> = {
  calls: [
    { key: 'id', label: 'ID' },
    { key: 'platform_call_id', label: 'Correlation ID' },
    { key: 'caller_name', label: 'Caller' },
    { key: 'call_duration', label: 'Duration' },
    { key: 'call_type', label: 'Type' },
    { key: 'cekura_status', label: 'Cekura Status' },
    { key: 'feedback', label: 'Feedback' },
    { key: 'started_at', label: 'Started (UTC)' },
    { key: 'phone_number', label: 'Phone' },
    { key: 'status', label: 'Status' },
  ],
  emails: [
    { key: 'id', label: 'ID' },
    { key: 'call_id', label: 'Call ID' },
    { key: 'email_type', label: 'Type' },
    { key: 'subject', label: 'Subject' },
    { key: 'recipients', label: 'Recipients' },
    { key: 'status', label: 'Status' },
    { key: 'sent_at', label: 'Sent At (UTC)' },
  ],
  transfers: [
    { key: 'id', label: 'ID' },
    { key: 'call_id', label: 'Call ID' },
    { key: 'transfer_type', label: 'Type' },
    { key: 'transferred_to_name', label: 'Recipient' },
    { key: 'transferred_to_phone_number', label: 'Phone' },
    { key: 'transfer_status', label: 'Status' },
    { key: 'transfer_started_at', label: 'Started (UTC)' },
  ],
  webhooks: [
    { key: 'id', label: 'ID' },
    { key: 'call_id', label: 'Call ID' },
    { key: 'platform', label: 'Platform' },
    { key: 'platform_call_id', label: 'Correlation ID' },
    { key: 'webhook_type', label: 'Type' },
    { key: 'received_at', label: 'Received (UTC)' },
  ],
  sentry: [
    { key: 'call_id', label: 'Call ID' },
    { key: 'correlation_id', label: 'Correlation ID' },
    { key: 'event_count', label: 'Events' },
    { key: 'level', label: 'Level' },
    { key: 'types', label: 'Types' },
    { key: 'last_timestamp', label: 'Last Event' },
  ],
};

interface ColumnTogglesEditorProps {
  columns: ColumnToggles;
  onChange: (columns: ColumnToggles) => void;
}

export function ColumnTogglesEditor({
  columns,
  onChange,
}: ColumnTogglesEditorProps) {
  const toggleColumn = (
    page: keyof ColumnToggles,
    columnKey: string
  ) => {
    const pageColumns = columns[page] || {};
    const currentValue = pageColumns[columnKey] !== false; // default to visible
    onChange({
      ...columns,
      [page]: {
        ...pageColumns,
        [columnKey]: !currentValue,
      },
    });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Column Visibility</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {Object.entries(PAGE_COLUMNS).map(([page, cols]) => (
          <Collapsible key={page}>
            <CollapsibleTrigger className="flex items-center justify-between w-full p-3 bg-muted/50 rounded-lg hover:bg-muted cursor-pointer">
              <span className="font-medium text-sm capitalize">{page}</span>
              <ChevronDown className="h-4 w-4 transition-transform" />
            </CollapsibleTrigger>
            <CollapsibleContent className="pt-2 pb-3 px-3 space-y-3">
              {cols.map((col) => {
                const pageColumns =
                  columns[page as keyof ColumnToggles] || {};
                const isVisible = pageColumns[col.key] !== false;
                return (
                  <div
                    key={col.key}
                    className="flex items-center justify-between"
                  >
                    <Label className="text-sm">{col.label}</Label>
                    <Switch
                      checked={isVisible}
                      onCheckedChange={() =>
                        toggleColumn(page as keyof ColumnToggles, col.key)
                      }
                    />
                  </div>
                );
              })}
            </CollapsibleContent>
          </Collapsible>
        ))}
      </CardContent>
    </Card>
  );
}
