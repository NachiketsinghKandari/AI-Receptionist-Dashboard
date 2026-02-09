'use client';

import { useState } from 'react';
import { FileText, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkGfm from 'remark-gfm';
import remarkDocx from 'remark-docx';
import { saveAs } from 'file-saver';

interface DocxExportButtonProps {
  markdown: string;
  filename: string;
}

export function DocxExportButton({
  markdown,
  filename,
}: DocxExportButtonProps) {
  const [isExporting, setIsExporting] = useState(false);

  const handleExport = async () => {
    if (!markdown || isExporting) return;
    setIsExporting(true);

    try {
      const processor = unified()
        .use(remarkParse)
        .use(remarkGfm)
        .use(remarkDocx);

      const result = await processor.process(markdown);
      const arrayBuffer = await result.result;
      const blob = new Blob([arrayBuffer], {
        type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      });
      saveAs(blob, `${filename}.docx`);
    } catch (error) {
      console.error('Failed to export DOCX:', error);
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={handleExport}
      disabled={isExporting}
    >
      {isExporting ? (
        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
      ) : (
        <FileText className="h-4 w-4 mr-2" />
      )}
      Save as Doc
    </Button>
  );
}
