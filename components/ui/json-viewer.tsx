'use client';

import JsonView from '@uiw/react-json-view';
import { lightTheme } from '@uiw/react-json-view/light';
import { darkTheme } from '@uiw/react-json-view/dark';
import { useTheme } from 'next-themes';
import { cn } from '@/lib/utils';

interface JsonViewerProps {
  data: unknown;
  className?: string;
  collapsed?: number | boolean;
}

export function JsonViewer({ data, className, collapsed = false }: JsonViewerProps) {
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === 'dark';

  return (
    <div className={cn('text-xs overflow-auto break-all', className)}>
      <JsonView
        value={data as object}
        style={isDark ? darkTheme : lightTheme}
        collapsed={collapsed}
        displayDataTypes={false}
        displayObjectSize={false}
        enableClipboard={false}
        shortenTextAfterLength={0}
      />
    </div>
  );
}
