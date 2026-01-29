'use client';

import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { cn } from '@/lib/utils';

interface MarkdownReportProps {
  content: string;
  className?: string;
}

export function MarkdownReport({ content, className }: MarkdownReportProps) {
  return (
    <div className={cn('markdown-report break-words overflow-wrap-anywhere max-w-full', className)}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          h1: ({ children }) => (
            <h1 className="text-base md:text-xl font-semibold text-foreground mt-4 md:mt-6 mb-2 md:mb-4 pb-2 border-b border-border break-words">
              {children}
            </h1>
          ),
          h2: ({ children }) => (
            <h2 className="text-sm md:text-lg font-semibold text-foreground mt-3 md:mt-5 mb-2 md:mb-3 pb-1 border-b border-border/50 break-words">
              {children}
            </h2>
          ),
          h3: ({ children }) => (
            <h3 className="text-sm md:text-base font-semibold text-foreground mt-3 md:mt-4 mb-1 md:mb-2 break-words">
              {children}
            </h3>
          ),
          h4: ({ children }) => (
            <h4 className="text-xs md:text-sm font-semibold text-foreground mt-2 md:mt-3 mb-1 break-words">
              {children}
            </h4>
          ),
          p: ({ children }) => (
            <p className="text-muted-foreground my-1.5 md:my-2 leading-relaxed text-xs md:text-sm break-words">
              {children}
            </p>
          ),
          ul: ({ children }) => (
            <ul className="list-disc pl-4 md:pl-6 my-1.5 md:my-2 space-y-0.5 md:space-y-1 text-xs md:text-sm">
              {children}
            </ul>
          ),
          ol: ({ children }) => (
            <ol className="list-decimal pl-4 md:pl-6 my-1.5 md:my-2 space-y-0.5 md:space-y-1 text-xs md:text-sm">
              {children}
            </ol>
          ),
          li: ({ children }) => (
            <li className="text-muted-foreground break-words">
              {children}
            </li>
          ),
          table: ({ children }) => (
            <div className="my-2 md:my-4 overflow-x-auto -mx-2 px-2">
              <table className="min-w-full border-collapse text-[10px] md:text-sm">
                {children}
              </table>
            </div>
          ),
          thead: ({ children }) => (
            <thead className="bg-muted/50">
              {children}
            </thead>
          ),
          th: ({ children }) => (
            <th className="border border-border bg-muted/70 px-1.5 md:px-3 py-1 md:py-2 text-left font-semibold text-foreground whitespace-nowrap">
              {children}
            </th>
          ),
          td: ({ children }) => (
            <td className="border border-border px-1.5 md:px-3 py-1 md:py-2 text-muted-foreground">
              {children}
            </td>
          ),
          tr: ({ children }) => (
            <tr className="even:bg-muted/20">
              {children}
            </tr>
          ),
          code: ({ className, children, ...props }) => {
            const isInline = !className;
            if (isInline) {
              return (
                <code className="bg-muted px-1 py-0.5 rounded text-[10px] md:text-xs font-mono text-foreground break-all">
                  {children}
                </code>
              );
            }
            return (
              <code className={cn('text-[10px] md:text-xs font-mono break-all', className)} {...props}>
                {children}
              </code>
            );
          },
          pre: ({ children }) => (
            <pre className="bg-muted rounded-lg p-2 md:p-4 overflow-x-auto my-2 md:my-3 text-[10px] md:text-sm">
              {children}
            </pre>
          ),
          blockquote: ({ children }) => (
            <blockquote className="border-l-4 border-primary/30 pl-3 md:pl-4 italic text-muted-foreground my-2 md:my-3 text-xs md:text-sm">
              {children}
            </blockquote>
          ),
          hr: () => (
            <hr className="border-border my-4 md:my-6" />
          ),
          a: ({ href, children }) => (
            <a
              href={href}
              className="text-primary underline underline-offset-2 hover:text-primary/80 break-all"
              target="_blank"
              rel="noopener noreferrer"
            >
              {children}
            </a>
          ),
          strong: ({ children }) => (
            <strong className="font-semibold text-foreground">
              {children}
            </strong>
          ),
          em: ({ children }) => (
            <em className="italic">
              {children}
            </em>
          ),
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
