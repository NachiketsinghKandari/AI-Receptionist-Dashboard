'use client';

import { RefObject } from 'react';
import { Printer } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface PDFExportButtonProps {
  contentRef: RefObject<HTMLDivElement | null>;
  filename: string;
}

export function PDFExportButton({ contentRef, filename }: PDFExportButtonProps) {
  const handlePrint = () => {
    if (!contentRef.current) return;

    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      alert('Please allow popups to print the report');
      return;
    }

    const content = contentRef.current.innerHTML;

    const html = `<!DOCTYPE html>
<html>
  <head>
    <title>${filename}</title>
    <style>
      * { margin: 0; padding: 0; box-sizing: border-box; }
      body {
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
        font-size: 12px;
        line-height: 1.6;
        color: #1a1a1a;
        padding: 40px;
        max-width: 800px;
        margin: 0 auto;
      }
      h1 { font-size: 20px; font-weight: 600; margin-top: 24px; margin-bottom: 16px; padding-bottom: 8px; border-bottom: 2px solid #e5e5e5; }
      h2 { font-size: 16px; font-weight: 600; margin-top: 20px; margin-bottom: 12px; padding-bottom: 4px; border-bottom: 1px solid #e5e5e5; }
      h3 { font-size: 14px; font-weight: 600; margin-top: 16px; margin-bottom: 8px; }
      h4 { font-size: 12px; font-weight: 600; margin-top: 12px; margin-bottom: 4px; }
      p { margin: 8px 0; color: #4a4a4a; }
      ul, ol { margin: 8px 0; padding-left: 24px; }
      li { margin: 4px 0; color: #4a4a4a; }
      table { width: 100%; border-collapse: collapse; margin: 16px 0; font-size: 11px; }
      th, td { border: 1px solid #d4d4d4; padding: 8px 12px; text-align: left; }
      th { background-color: #f5f5f5; font-weight: 600; }
      tr:nth-child(even) { background-color: #fafafa; }
      code { background-color: #f5f5f5; padding: 2px 6px; border-radius: 4px; font-family: 'SF Mono', Monaco, 'Courier New', monospace; font-size: 11px; }
      pre { background-color: #f5f5f5; padding: 12px; border-radius: 8px; overflow-x: auto; margin: 12px 0; }
      pre code { padding: 0; background: none; }
      blockquote { border-left: 4px solid #d4d4d4; padding-left: 16px; margin: 12px 0; font-style: italic; color: #6a6a6a; }
      hr { border: none; border-top: 1px solid #e5e5e5; margin: 24px 0; }
      strong { font-weight: 600; color: #1a1a1a; }
      a { color: #0066cc; text-decoration: underline; }
      @media print { body { padding: 20px; } @page { margin: 0.5in; } }
    </style>
  </head>
  <body>${content}</body>
</html>`;

    printWindow.document.open();
    printWindow.document.write(html);
    printWindow.document.close();

    printWindow.onload = () => {
      printWindow.print();
      printWindow.onafterprint = () => printWindow.close();
    };

    setTimeout(() => {
      if (!printWindow.closed) {
        printWindow.print();
      }
    }, 500);
  };

  return (
    <Button variant="outline" size="sm" onClick={handlePrint}>
      <Printer className="h-4 w-4 mr-2" />
      Print / Save PDF
    </Button>
  );
}
