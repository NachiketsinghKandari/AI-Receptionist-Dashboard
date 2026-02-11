import type { ColumnDef } from '@tanstack/react-table';

export function filterColumns<T>(
  columns: ColumnDef<T>[],
  toggles: Record<string, boolean> | undefined
): ColumnDef<T>[] {
  if (!toggles || Object.keys(toggles).length === 0) return columns;
  return columns.filter((col) => {
    const key =
      (col as { accessorKey?: string }).accessorKey ||
      (col as { id?: string }).id;
    if (!key) return true; // keep columns without a key (e.g. actions)
    return toggles[key] !== false;
  });
}
