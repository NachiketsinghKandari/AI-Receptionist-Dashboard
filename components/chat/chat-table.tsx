'use client';

import { Download } from 'lucide-react';
import { saveAs } from 'file-saver';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from '@/components/ui/table';
import type { SqlResult } from '@/types/chat';

interface ChatTableProps {
  result: SqlResult;
}

function formatCell(value: unknown): string {
  if (value === null || value === undefined) return '-';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

function escapeCsvValue(value: string): string {
  if (value.includes(',') || value.includes('"') || value.includes('\n')) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

function exportCsv(result: SqlResult) {
  const header = result.columns.map(escapeCsvValue).join(',');
  const rows = result.rows.map((row) =>
    result.columns.map((col) => escapeCsvValue(formatCell(row[col]))).join(','),
  );
  const csv = [header, ...rows].join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  saveAs(blob, `query-results-${Date.now()}.csv`);
}

export function ChatTable({ result }: ChatTableProps) {
  if (result.rows.length === 0) {
    return <p className="text-sm text-muted-foreground italic">No results returned.</p>;
  }

  return (
    <div className="my-2 overflow-hidden">
      <div className="max-h-64 overflow-auto rounded-md border">
        <Table unstyled>
          <TableHeader>
            <TableRow>
              {result.columns.map((col) => (
                <TableHead key={col} className="whitespace-nowrap px-3 py-2 text-xs font-medium">
                  {col}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {result.rows.map((row, i) => (
              <TableRow key={i}>
                {result.columns.map((col) => (
                  <TableCell key={col} className="whitespace-nowrap px-3 py-1.5 text-xs font-mono">
                    {formatCell(row[col])}
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <div className="mt-1.5 flex items-center justify-between">
        <p className="text-xs text-muted-foreground">
          {result.rowCount} row{result.rowCount !== 1 ? 's' : ''}
          {result.truncated ? ' (truncated)' : ''}
        </p>
        <Button
          variant="ghost"
          size="sm"
          className="h-6 gap-1 px-2 text-xs text-muted-foreground"
          onClick={() => exportCsv(result)}
        >
          <Download className="h-3 w-3" />
          CSV
        </Button>
      </div>
    </div>
  );
}
