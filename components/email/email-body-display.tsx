'use client';

import { useMemo } from 'react';
import { User, Building2, Phone, Clock, FileText, AlertTriangle, ArrowRight } from 'lucide-react';

interface ParsedEmailBody {
  caller?: string;
  company?: string;
  client?: string;
  phone?: string;
  time?: string;
  duration?: string;
  whatTheyNeeded?: string;
  whatHappened?: string;
  whyImportant?: string;
  nextStep?: string;
  signature?: string;
}

function parseEmailBody(body: string): ParsedEmailBody | null {
  // Strip HTML tags but preserve structure
  // The format uses <strong>Label:</strong> Value
  const result: ParsedEmailBody = {};

  // Helper to extract value after a <strong>Label:</strong> pattern
  const extractField = (label: string): string | undefined => {
    // Match <strong>Label:</strong> followed by content until next <strong> or newline
    const regex = new RegExp(`<strong>${label}:</strong>\\s*([^<]+?)(?=<strong>|\\n|$)`, 'i');
    const match = body.match(regex);
    return match ? match[1].trim() : undefined;
  };

  // Extract header fields
  result.caller = extractField('Caller');
  result.company = extractField('Company');
  result.client = extractField('Client');
  result.phone = extractField('Phone');
  result.time = extractField('Time');
  result.duration = extractField('Duration');

  // Extract multi-line sections
  const extractSection = (label: string): string | undefined => {
    // Match <strong>Label:</strong> followed by content until next <strong>Section:</strong> or signature
    const escapedLabel = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(
      `<strong>${escapedLabel}:</strong>\\s*([\\s\\S]*?)(?=<strong>(?:What they needed|What happened|Why this is important|Next step):</strong>|- [A-Z][a-z]+$|$)`,
      'i'
    );
    const match = body.match(regex);
    if (match) {
      // Clean up HTML tags and extra whitespace
      return match[1]
        .replace(/<[^>]*>/g, '')
        .replace(/\s+/g, ' ')
        .trim();
    }
    return undefined;
  };

  result.whatTheyNeeded = extractSection('What they needed');
  result.whatHappened = extractSection('What happened');
  result.whyImportant = extractSection('Why this is important');
  result.nextStep = extractSection('Next step');

  // Extract signature (- Name at the end)
  const signatureMatch = body.match(/- ([A-Z][a-z]+)\s*$/);
  if (signatureMatch) {
    result.signature = signatureMatch[1];
  }

  // Check if we parsed anything meaningful
  const hasContent = result.caller || result.whatTheyNeeded || result.whatHappened;

  return hasContent ? result : null;
}

interface EmailBodyDisplayProps {
  body: string;
  compact?: boolean;
}

export function EmailBodyDisplay({ body, compact = false }: EmailBodyDisplayProps) {
  const parsed = useMemo(() => parseEmailBody(body), [body]);

  // Fallback to raw display if parsing fails
  if (!parsed) {
    return (
      <div
        className="text-sm whitespace-pre-wrap leading-relaxed"
        dangerouslySetInnerHTML={{ __html: body }}
      />
    );
  }

  if (compact) {
    // Compact view for call detail panel
    return (
      <div className="space-y-3">
        {/* Header info in compact grid */}
        {(parsed.caller || parsed.company || parsed.client || parsed.phone || parsed.time) && (
          <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
            {parsed.caller && (
              <div className="flex items-center gap-1.5">
                <User className="h-3 w-3 text-muted-foreground shrink-0" />
                <span className="text-muted-foreground">Caller:</span>
                <span className="font-medium truncate">{parsed.caller}</span>
              </div>
            )}
            {parsed.company && (
              <div className="flex items-center gap-1.5">
                <Building2 className="h-3 w-3 text-muted-foreground shrink-0" />
                <span className="text-muted-foreground">Company:</span>
                <span className="font-medium truncate">{parsed.company}</span>
              </div>
            )}
            {parsed.client && (
              <div className="flex items-center gap-1.5">
                <User className="h-3 w-3 text-muted-foreground shrink-0" />
                <span className="text-muted-foreground">Client:</span>
                <span className="font-medium truncate">{parsed.client}</span>
              </div>
            )}
            {parsed.phone && (
              <div className="flex items-center gap-1.5">
                <Phone className="h-3 w-3 text-muted-foreground shrink-0" />
                <span className="text-muted-foreground">Phone:</span>
                <span className="font-medium font-mono">{parsed.phone}</span>
              </div>
            )}
            {(parsed.time || parsed.duration) && (
              <div className="col-span-2 flex items-center gap-1.5">
                <Clock className="h-3 w-3 text-muted-foreground shrink-0" />
                <span className="text-muted-foreground">Time:</span>
                <span className="font-medium">
                  {parsed.time}
                  {parsed.duration && ` | Duration: ${parsed.duration}`}
                </span>
              </div>
            )}
          </div>
        )}

        {/* Content sections */}
        {parsed.whatTheyNeeded && (
          <div className="text-xs">
            <p className="text-muted-foreground font-medium mb-0.5">What they needed</p>
            <p className="leading-relaxed">{parsed.whatTheyNeeded}</p>
          </div>
        )}

        {parsed.whatHappened && (
          <div className="text-xs">
            <p className="text-muted-foreground font-medium mb-0.5">What happened</p>
            <p className="leading-relaxed">{parsed.whatHappened}</p>
          </div>
        )}

        {parsed.whyImportant && (
          <div className="text-xs bg-amber-500/10 border border-amber-500/20 rounded p-2">
            <p className="text-amber-600 dark:text-amber-400 font-medium mb-0.5 flex items-center gap-1">
              <AlertTriangle className="h-3 w-3" />
              Why this is important
            </p>
            <p className="leading-relaxed">{parsed.whyImportant}</p>
          </div>
        )}

        {parsed.nextStep && (
          <div className="text-xs">
            <p className="text-muted-foreground font-medium mb-0.5">Next step</p>
            <p className="leading-relaxed">{parsed.nextStep}</p>
          </div>
        )}

        {/* Signature */}
        {parsed.signature && (
          <p className="text-xs text-muted-foreground italic pt-1 border-t border-border/50">
            — {parsed.signature}
          </p>
        )}
      </div>
    );
  }

  // Full view for email details dialog
  return (
    <div className="space-y-4">
      {/* Header card with caller info */}
      {(parsed.caller || parsed.company || parsed.client || parsed.phone || parsed.time) && (
        <div className="bg-muted/50 rounded-lg p-4 border border-border/50">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {parsed.caller && (
              <div className="flex items-start gap-2">
                <User className="h-4 w-4 text-muted-foreground mt-0.5" />
                <div>
                  <p className="text-xs text-muted-foreground">Caller</p>
                  <p className="text-sm font-medium">{parsed.caller}</p>
                </div>
              </div>
            )}
            {parsed.company && (
              <div className="flex items-start gap-2">
                <Building2 className="h-4 w-4 text-muted-foreground mt-0.5" />
                <div>
                  <p className="text-xs text-muted-foreground">Company</p>
                  <p className="text-sm font-medium">{parsed.company}</p>
                </div>
              </div>
            )}
            {parsed.client && (
              <div className="flex items-start gap-2">
                <User className="h-4 w-4 text-muted-foreground mt-0.5" />
                <div>
                  <p className="text-xs text-muted-foreground">Client</p>
                  <p className="text-sm font-medium">{parsed.client}</p>
                </div>
              </div>
            )}
            {parsed.phone && (
              <div className="flex items-start gap-2">
                <Phone className="h-4 w-4 text-muted-foreground mt-0.5" />
                <div>
                  <p className="text-xs text-muted-foreground">Phone</p>
                  <p className="text-sm font-medium font-mono">{parsed.phone}</p>
                </div>
              </div>
            )}
            {(parsed.time || parsed.duration) && (
              <div className="flex items-start gap-2 sm:col-span-2">
                <Clock className="h-4 w-4 text-muted-foreground mt-0.5" />
                <div>
                  <p className="text-xs text-muted-foreground">Time</p>
                  <p className="text-sm font-medium">
                    {parsed.time}
                    {parsed.duration && ` | Duration: ${parsed.duration}`}
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* What they needed section */}
      {parsed.whatTheyNeeded && (
        <div>
          <div className="flex items-center gap-2 mb-2">
            <FileText className="h-4 w-4 text-primary" />
            <h4 className="text-sm font-semibold">What they needed</h4>
          </div>
          <p className="text-sm leading-relaxed text-foreground/90 pl-6">
            {parsed.whatTheyNeeded}
          </p>
        </div>
      )}

      {/* What happened section */}
      {parsed.whatHappened && (
        <div>
          <div className="flex items-center gap-2 mb-2">
            <FileText className="h-4 w-4 text-primary" />
            <h4 className="text-sm font-semibold">What happened</h4>
          </div>
          <p className="text-sm leading-relaxed text-foreground/90 pl-6">
            {parsed.whatHappened}
          </p>
        </div>
      )}

      {/* Why this is important section */}
      {parsed.whyImportant && (
        <div className="bg-amber-500/10 border border-amber-500/20 rounded-lg p-4">
          <div className="flex items-center gap-2 mb-2">
            <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400" />
            <h4 className="text-sm font-semibold text-amber-600 dark:text-amber-400">Why this is important</h4>
          </div>
          <p className="text-sm leading-relaxed pl-6">
            {parsed.whyImportant}
          </p>
        </div>
      )}

      {/* Next step section */}
      {parsed.nextStep && (
        <div>
          <div className="flex items-center gap-2 mb-2">
            <ArrowRight className="h-4 w-4 text-primary" />
            <h4 className="text-sm font-semibold">Next step</h4>
          </div>
          <p className="text-sm leading-relaxed text-foreground/90 pl-6">
            {parsed.nextStep}
          </p>
        </div>
      )}

      {/* Signature */}
      {parsed.signature && (
        <div className="pt-3 border-t border-border/50">
          <p className="text-sm text-muted-foreground italic">— {parsed.signature}</p>
        </div>
      )}
    </div>
  );
}
