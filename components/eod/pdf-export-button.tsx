'use client';

import { RefObject } from 'react';
import { ChevronDown, Printer } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

const BEY_LOGO_URL = 'https://beyandassociates.com/wp-content/uploads/2021/08/bey-logo-300x66.png';

let cachedHCLogoSvg: string | null = null;
async function fetchHelloCounselSvg(): Promise<string> {
  if (cachedHCLogoSvg) return cachedHCLogoSvg;
  const res = await fetch(`${window.location.origin}/HelloCounsel.svg`);
  cachedHCLogoSvg = await res.text();
  return cachedHCLogoSvg;
}

function imageToDataUrl(url: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      canvas.getContext('2d')!.drawImage(img, 0, 0);
      resolve(canvas.toDataURL('image/png'));
    };
    img.onerror = reject;
    img.src = url;
  });
}

type LogoBranding = 'firm' | 'hellocounsel' | 'none';

interface PDFExportButtonProps {
  contentRef: RefObject<HTMLDivElement | null>;
  filename: string;
  reportTitle: string;
  reportDate: string;
  firmId?: number | null;
  firmName?: string | null;
}

export function PDFExportButton({
  contentRef,
  filename,
  reportTitle,
  reportDate,
  firmId,
  firmName,
}: PDFExportButtonProps) {
  const openPrintWindow = (content: string, logoHtml: string) => {
    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      alert('Please allow popups to print the report');
      return;
    }

    const formattedDate = new Date(reportDate + 'T00:00:00').toLocaleDateString(
      'en-US',
      { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }
    );

    const html = `<!DOCTYPE html>
<html>
  <head>
    <title>${filename}</title>
    <style>
      @page {
        margin: 0.6in 0.6in 0.8in 0.6in;
        size: letter;
      }

      * { margin: 0; padding: 0; box-sizing: border-box; }

      body {
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
        font-size: 12px;
        line-height: 1.6;
        color: #1a1a1a;
        counter-reset: page-number;
      }

      /* ── Header ── */
      .report-header {
        padding-bottom: 16px;
        margin-bottom: 20px;
        border-bottom: 2px solid #18181b;
      }
      .report-header-top {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 8px;
      }
      .report-logo img {
        height: 28px;
        width: auto;
      }
      .report-logo svg {
        height: 28px;
        width: auto;
      }
      .report-title {
        font-size: 22px;
        font-weight: 700;
        color: #18181b;
        margin-top: 6px;
        line-height: 1.2;
      }
      .report-date {
        font-size: 12px;
        color: #52525b;
        margin-top: 4px;
      }

      /* ── Typography ── */
      h1 {
        font-size: 18px;
        font-weight: 700;
        margin-top: 28px;
        margin-bottom: 12px;
        padding-bottom: 6px;
        border-bottom: 2px solid #e4e4e7;
        color: #18181b;
        page-break-after: avoid;
      }
      h2 {
        font-size: 15px;
        font-weight: 600;
        margin-top: 22px;
        margin-bottom: 10px;
        padding-bottom: 4px;
        border-bottom: 1px solid #e4e4e7;
        color: #27272a;
        page-break-after: avoid;
      }
      h3 {
        font-size: 13px;
        font-weight: 600;
        margin-top: 16px;
        margin-bottom: 6px;
        color: #27272a;
        page-break-after: avoid;
      }
      h4 {
        font-size: 12px;
        font-weight: 600;
        margin-top: 12px;
        margin-bottom: 4px;
        color: #3f3f46;
        page-break-after: avoid;
      }
      p {
        margin: 6px 0;
        color: #3f3f46;
      }
      ul, ol {
        margin: 6px 0;
        padding-left: 22px;
      }
      li {
        margin: 3px 0;
        color: #3f3f46;
      }
      strong {
        font-weight: 600;
        color: #18181b;
      }
      em {
        font-style: italic;
      }

      /* ── Tables ── */
      table {
        width: 100%;
        border-collapse: collapse;
        margin: 12px 0;
        font-size: 11px;
        page-break-inside: avoid;
      }
      th, td {
        border: 1px solid #d4d4d8;
        padding: 6px 10px;
        text-align: left;
      }
      th {
        background-color: #f4f4f5;
        font-weight: 600;
        color: #18181b;
        font-size: 10px;
        text-transform: uppercase;
        letter-spacing: 0.3px;
      }
      tr:nth-child(even) {
        background-color: #fafafa;
      }

      /* ── Code ── */
      code {
        background-color: #f4f4f5;
        padding: 1px 5px;
        border-radius: 3px;
        font-family: 'SF Mono', Monaco, 'Courier New', monospace;
        font-size: 10px;
      }
      pre {
        background-color: #f4f4f5;
        padding: 10px;
        border-radius: 6px;
        overflow-x: auto;
        margin: 10px 0;
        page-break-inside: avoid;
      }
      pre code {
        padding: 0;
        background: none;
      }

      /* ── Misc ── */
      blockquote {
        border-left: 3px solid #a1a1aa;
        padding-left: 14px;
        margin: 10px 0;
        font-style: italic;
        color: #52525b;
        page-break-inside: avoid;
      }
      hr {
        border: none;
        border-top: 1px solid #e4e4e7;
        margin: 20px 0;
      }
      a {
        color: #2563eb;
        text-decoration: underline;
        text-underline-offset: 2px;
      }

      /* ── Print-specific ── */
      @media print {
        h1, h2, h3, h4 { page-break-after: avoid; }
        table, pre, blockquote, ul, ol { page-break-inside: avoid; }
        tr { page-break-inside: avoid; }
        .report-header { page-break-after: avoid; }

        /* Prevent orphaned headings at bottom of page */
        h1, h2, h3, h4 { orphans: 3; widows: 3; }
        p { orphans: 2; widows: 2; }
      }
    </style>
  </head>
  <body>
    <div class="report-header">
      <div class="report-header-top">
        <div class="report-logo">${logoHtml}</div>
      </div>
      <div class="report-title">${reportTitle}</div>
      <div class="report-date">${formattedDate}</div>
    </div>
    ${content}
  </body>
</html>`;

    printWindow.document.open();
    printWindow.document.write(html);
    printWindow.document.close();

    let printed = false;
    const triggerPrint = () => {
      if (printed || printWindow.closed) return;
      printed = true;
      printWindow.print();
    };

    printWindow.onload = triggerPrint;
    // Fallback for browsers where onload doesn't fire reliably
    setTimeout(triggerPrint, 500);
  };

  const getLogoHtml = async (branding: LogoBranding): Promise<string> => {
    if (branding === 'none') return '';
    if (branding === 'hellocounsel') return fetchHelloCounselSvg();

    // Firm logo
    if (firmId === 1) {
      try {
        const dataUrl = await imageToDataUrl(BEY_LOGO_URL);
        return `<img src="${dataUrl}" alt="Bey &amp; Associates" />`;
      } catch {
        return `<img src="${BEY_LOGO_URL}" alt="Bey &amp; Associates" />`;
      }
    }
    // Fallback to HelloCounsel if no firm logo available
    return fetchHelloCounselSvg();
  };

  const handlePrint = async (branding: LogoBranding) => {
    if (!contentRef.current) return;
    const content = contentRef.current.innerHTML;
    const logoHtml = await getLogoHtml(branding);
    openPrintWindow(content, logoHtml);
  };

  const hasFirmLogo = firmId === 1;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm">
          <Printer className="h-4 w-4 md:mr-2" />
          <span className="hidden md:inline">Print / Save PDF</span>
          <ChevronDown className="h-3 w-3 md:ml-1" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {hasFirmLogo && (
          <DropdownMenuItem onClick={() => handlePrint('firm')}>
            With Firm Logo{firmName ? ` (${firmName})` : ''}
          </DropdownMenuItem>
        )}
        <DropdownMenuItem onClick={() => handlePrint('hellocounsel')}>
          With HelloCounsel Logo
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => handlePrint('none')}>
          Without Logo
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
