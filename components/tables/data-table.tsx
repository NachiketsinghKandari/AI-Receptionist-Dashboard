'use client';

import {
  ColumnDef,
  flexRender,
  getCoreRowModel,
  useReactTable,
  Row,
} from '@tanstack/react-table';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { ArrowUp, ArrowDown, ArrowUpDown } from 'lucide-react';

export type SortOrder = 'asc' | 'desc' | null;

interface DataTableProps<TData, TValue> {
  columns: ColumnDef<TData, TValue>[];
  data: TData[];
  total: number;
  offset: number;
  limit: number;
  onOffsetChange: (offset: number) => void;
  onRowSelect?: (row: TData | null) => void;
  selectedRowId?: string | number | null;
  isLoading?: boolean;
  getRowId?: (row: TData) => string;
  // Sorting props
  sortBy?: string | null;
  sortOrder?: SortOrder;
  onSort?: (column: string) => void;
  sortableColumns?: string[];
}

export function DataTable<TData, TValue>({
  columns,
  data,
  total,
  offset,
  limit,
  onOffsetChange,
  onRowSelect,
  selectedRowId,
  isLoading,
  getRowId,
  sortBy,
  sortOrder,
  onSort,
  sortableColumns = [],
}: DataTableProps<TData, TValue>) {
  const table = useReactTable({
    data,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getRowId: getRowId || ((row, index) => String(index)),
  });

  const currentPage = Math.floor(offset / limit) + 1;
  const totalPages = Math.max(1, Math.ceil(total / limit));

  const handleRowClick = (row: Row<TData>) => {
    if (onRowSelect) {
      const rowData = row.original;
      const rowId = getRowId ? getRowId(rowData) : String((rowData as { id?: number }).id);
      if (rowId === String(selectedRowId)) {
        onRowSelect(null); // Deselect
      } else {
        onRowSelect(rowData);
      }
    }
  };

  const renderSortIcon = (columnId: string) => {
    if (!sortableColumns.includes(columnId)) return null;

    if (sortBy === columnId) {
      return sortOrder === 'asc' ? (
        <ArrowUp className="ml-1 h-3 w-3" />
      ) : (
        <ArrowDown className="ml-1 h-3 w-3" />
      );
    }
    return <ArrowUpDown className="ml-1 h-3 w-3 opacity-30" />;
  };

  if (isLoading) {
    return (
      <div className="flex flex-col h-full">
        <div className="flex-1 space-y-2 overflow-hidden">
          {[...Array(8)].map((_, i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
        <div className="flex items-center justify-between py-4 shrink-0">
          <Skeleton className="h-4 w-[200px]" />
          <Skeleton className="h-8 w-[200px]" />
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Scrollable table container - sizes to content, scrolls when needed */}
      <div className="min-h-0 overflow-auto rounded-md border">
        <Table unstyled>
          <TableHeader className="sticky top-0 z-10">
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id} className="bg-background hover:bg-background">
                {headerGroup.headers.map((header) => {
                  const columnId = header.column.id;
                  const isSortable = sortableColumns.includes(columnId);

                  return (
                    <TableHead
                      key={header.id}
                      className={`bg-background border-b ${isSortable ? 'cursor-pointer select-none hover:bg-muted/50' : ''}`}
                      onClick={() => isSortable && onSort?.(columnId)}
                    >
                      <div className="flex items-center">
                        {header.isPlaceholder
                          ? null
                          : flexRender(
                              header.column.columnDef.header,
                              header.getContext()
                            )}
                        {renderSortIcon(columnId)}
                      </div>
                    </TableHead>
                  );
                })}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {table.getRowModel().rows?.length ? (
              table.getRowModel().rows.map((row) => {
                const rowId = getRowId ? getRowId(row.original) : String((row.original as { id?: number }).id);
                const isSelected = rowId === String(selectedRowId);
                return (
                  <TableRow
                    key={row.id}
                    data-state={isSelected ? 'selected' : undefined}
                    onClick={() => handleRowClick(row)}
                    className={`cursor-pointer hover:bg-muted/50 ${
                      isSelected ? 'bg-muted' : ''
                    }`}
                  >
                    {row.getVisibleCells().map((cell) => (
                      <TableCell key={cell.id}>
                        {flexRender(
                          cell.column.columnDef.cell,
                          cell.getContext()
                        )}
                      </TableCell>
                    ))}
                  </TableRow>
                );
              })
            ) : (
              <TableRow>
                <TableCell
                  colSpan={columns.length}
                  className="h-24 text-center"
                >
                  No results found.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      {/* Pagination - fixed at bottom */}
      <div className="flex items-center justify-between py-4 shrink-0">
        <div className="text-sm text-muted-foreground">
          Showing {Math.min(offset + 1, total)} to {Math.min(offset + limit, total)} of {total} results
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => onOffsetChange(Math.max(0, offset - limit))}
            disabled={offset === 0}
          >
            Previous
          </Button>
          <span className="text-sm text-muted-foreground">
            Page {currentPage} of {totalPages}
          </span>
          <Button
            variant="outline"
            size="sm"
            onClick={() => onOffsetChange(offset + limit)}
            disabled={offset + limit >= total}
          >
            Next
          </Button>
        </div>
      </div>
    </div>
  );
}
