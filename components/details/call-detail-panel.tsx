'use client';

import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { CopyButton } from '@/components/ui/copy-button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Separator } from '@/components/ui/separator';
import { useCallDetail } from '@/hooks/use-calls';
import { useFirms } from '@/hooks/use-firms';
import { useWebhooksForCall } from '@/hooks/use-webhooks';
import { useSentryEventsForCall } from '@/hooks/use-sentry-events';
import { useCekuraCallMapping, buildCekuraUrl, useCekuraFeedbackMutation } from '@/hooks/use-cekura';
import { useAccurateTranscript } from '@/hooks/use-accurate-transcript';
import { CekuraStatusSelector } from '@/components/cekura/cekura-status-selector';
import { useEnvironment } from '@/components/providers/environment-provider';
import { formatDuration } from '@/lib/formatting';
import type { Transfer, Email, Webhook, SentryEvent } from '@/types/database';
import type { AccurateUtterance, TranscriptionAccuracyResult } from '@/types/api';
import {
  ChevronDown,
  Phone,
  ArrowLeftRight,
  Mail,
  Webhook as WebhookIcon,
  ExternalLink,
  Share2,
  Play,
  ClipboardList,
  FileText,
  AlertCircle,
  AlertTriangle,
  Info,
  Search,
  MessageSquare,
  Calendar,
  HelpCircle,
  Bug,
  Clock,
  User,
  Hash,
  Activity,
  CheckCircle,
  XCircle,
  Building2,
  Bot,
  BarChart3,
  Loader2,
  Wrench,
  Pencil,
  Check,
  X,
  MessageSquareText,
  Voicemail,
  PhoneOff,
  Maximize2,
  Sparkles,
} from 'lucide-react';
import { useState, useMemo, useRef, useEffect } from 'react';
import { parseWebhookPayload, enrichTransfersWithDatabaseData } from '@/lib/webhook-utils';

import { EmailBodyDisplay } from '@/components/email/email-body-display';
import { RecipientsDisplay } from '@/components/email/recipients-display';
import { JsonViewer } from '@/components/ui/json-viewer';
import { AudioPlayer } from '@/components/ui/audio-player';

// Map dashboard environment to Sentry environment for URL
const SENTRY_ENV_MAP: Record<string, string> = {
  production: 'production',
  staging: 'stage',
};

// Highlight reasons type - exported for use in calls page
export interface HighlightReasons {
  sentry: boolean;
  duration: boolean;
  important: boolean;
  transferMismatch: boolean;
}

interface CallDetailPanelProps {
  callId: number | string;  // Supports both numeric ID and correlation ID
  highlightReasons?: HighlightReasons;
  dateRange?: {
    startDate: string | null;
    endDate: string | null;
  };
}

function getStatusBadgeVariant(status: string): 'default' | 'secondary' | 'destructive' | 'outline' {
  switch (status.toLowerCase()) {
    case 'completed':
    case 'sent':
    case 'success':
      return 'default';
    case 'failed':
    case 'error':
      return 'destructive';
    case 'pending':
    case 'in_progress':
      return 'secondary';
    default:
      return 'outline';
  }
}

// Transcript parsing and display
interface TranscriptMessage {
  speaker: 'agent' | 'caller';
  text: string;
}

function parseTranscript(transcription: string): TranscriptMessage[] {
  const lines = transcription.split('\n').filter(line => line.trim());
  return lines.map(line => {
    if (line.startsWith('Agent:')) {
      return { speaker: 'agent' as const, text: line.replace('Agent:', '').trim() };
    } else if (line.startsWith('Caller:')) {
      return { speaker: 'caller' as const, text: line.replace('Caller:', '').trim() };
    }
    return { speaker: 'caller' as const, text: line }; // Default to caller
  }).filter(msg => msg.text);
}

function TranscriptBubble({ message }: { message: TranscriptMessage }) {
  const isAgent = message.speaker === 'agent';
  return (
    <div className={cn('flex', isAgent ? 'justify-start' : 'justify-end')}>
      <div className={cn(
        'max-w-[75%] px-3 py-2 rounded-lg text-sm',
        isAgent
          ? 'bg-muted text-foreground rounded-bl-none'
          : 'bg-primary text-primary-foreground rounded-br-none'
      )}>
        <span className="text-xs font-medium opacity-70 block mb-0.5">
          {isAgent ? 'Agent' : 'Caller'}
        </span>
        {message.text}
      </div>
    </div>
  );
}

// Webhook message types for advanced transcript
interface WebhookToolCall {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string;
  };
}

interface WebhookMessage {
  role: 'system' | 'bot' | 'user' | 'tool_calls' | 'tool_call_result';
  message: string;
  time: number;
  secondsFromStart: number;
  duration?: number;
  endTime?: number;
  source?: string;
  toolCalls?: WebhookToolCall[];
  result?: string;
  toolCallId?: string;
  name?: string; // Tool name for tool_call_result
}

// Transfer attempt data from artifact
interface TransferAttempt {
  transcript: string;
  status: string;
  destination: {
    type: string;
    number: string;
    transferPlan?: {
      mode: string;
    };
  };
}

interface ExtractedTranscriptData {
  messages: WebhookMessage[];
  transfers: TransferAttempt[];
  endedReason?: string;
}

/**
 * Extract messages, transfers, and endedReason from webhook payload
 */
function extractWebhookMessages(webhooks: Webhook[]): ExtractedTranscriptData | null {
  // Find the end-of-call-report webhook which typically has the full transcript
  const endOfCallWebhook = webhooks.find(w => w.webhook_type === 'end-of-call-report');
  if (!endOfCallWebhook) return null;

  try {
    const payload = endOfCallWebhook.payload;
    const message = payload?.message as Record<string, unknown> | undefined;
    const messages = message?.messages as WebhookMessage[] | undefined;
    const endedReason = message?.endedReason as string | undefined;

    // Extract transfers from artifact
    const artifact = message?.artifact as Record<string, unknown> | undefined;
    const transfers = (artifact?.transfers as TransferAttempt[]) || [];

    if (!messages || !Array.isArray(messages)) {
      return null;
    }

    // Sort by secondsFromStart ascending
    const sortedMessages = [...messages].sort((a, b) => a.secondsFromStart - b.secondsFromStart);

    return { messages: sortedMessages, transfers, endedReason };
  } catch {
    return null;
  }
}

/**
 * Convert snake_case function name to Title Case
 */
function formatFunctionName(name: string): string {
  return name
    .split('_')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

/**
 * Format seconds to mm:ss format
 */
function formatSecondsToTime(seconds: number): string {
  const roundedSeconds = Math.round(seconds);
  const minutes = Math.floor(roundedSeconds / 60);
  const secs = roundedSeconds % 60;
  return `${minutes}:${secs.toString().padStart(2, '0')}`;
}

/**
 * Tool call card showing function invocation and result
 */
function ToolCallCard({
  toolCall,
  result,
  timestamp,
}: {
  toolCall: WebhookToolCall;
  result?: string;
  timestamp?: string;
}) {
  const [isOpen, setIsOpen] = useState(false);

  // Parse arguments from JSON string
  let parsedArgs: unknown = null;
  try {
    parsedArgs = JSON.parse(toolCall.function.arguments);
  } catch {
    parsedArgs = toolCall.function.arguments;
  }

  // Parse result if it's JSON
  let parsedResult: unknown = result;
  let isSuccess = true;
  if (result) {
    try {
      parsedResult = JSON.parse(result);
      // Check for success field
      if (typeof parsedResult === 'object' && parsedResult !== null) {
        const resultObj = parsedResult as Record<string, unknown>;
        if (resultObj.success === false) {
          isSuccess = false;
        }
      }
    } catch {
      // Keep as string if not valid JSON
    }
  }

  // Determine status text based on result
  const getStatusText = () => {
    if (!result) return 'Executing...';
    if (typeof parsedResult === 'string') {
      if (parsedResult.toLowerCase().includes('initiated') || parsedResult.toLowerCase().includes('executed')) {
        return 'Completed successfully';
      }
      return parsedResult;
    }
    if (isSuccess) return 'Completed successfully';
    return 'Completed with error';
  };

  return (
    <div className="flex justify-center my-3">
      <div className="w-[85%] max-w-md">
        <Collapsible open={isOpen} onOpenChange={setIsOpen}>
          <CollapsibleTrigger asChild>
            <div className="flex items-center gap-3 p-3 bg-muted/50 border rounded-xl cursor-pointer hover:bg-muted transition-colors">
              <div className="p-2 bg-amber-500/10 rounded-lg">
                <Wrench className="h-4 w-4 text-amber-600" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className="text-sm font-medium">
                    {formatFunctionName(toolCall.function.name)}
                  </span>
                  {result && (
                    isSuccess ? (
                      <CheckCircle className="h-3.5 w-3.5 text-emerald-500" />
                    ) : (
                      <XCircle className="h-3.5 w-3.5 text-red-500" />
                    )
                  )}
                </div>
                <p className="text-xs text-muted-foreground">
                  {getStatusText()}
                </p>
              </div>
              {timestamp && (
                <span className="text-[10px] text-muted-foreground font-mono tabular-nums">
                  {timestamp}
                </span>
              )}
              <ChevronDown className={cn(
                "h-4 w-4 text-muted-foreground transition-transform",
                isOpen && "rotate-180"
              )} />
            </div>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <div className="mt-1 p-3 bg-background border border-t-0 rounded-b-xl space-y-3">
              {/* Request Parameters */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <p className="text-xs font-medium text-muted-foreground">Request Parameters</p>
                  <CopyButton
                    value={typeof parsedArgs === 'object' ? JSON.stringify(parsedArgs, null, 2) : String(parsedArgs)}
                  />
                </div>
                <div className="bg-muted/30 rounded-lg p-2 border overflow-hidden">
                  {typeof parsedArgs === 'object' ? (
                    <JsonViewer data={parsedArgs} className="max-h-48 overflow-auto" />
                  ) : (
                    <p className="text-xs text-muted-foreground whitespace-pre-wrap font-mono">{String(parsedArgs)}</p>
                  )}
                </div>
              </div>

              {/* Response Details */}
              {result && (
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <p className="text-xs font-medium text-muted-foreground">Response Details</p>
                    <CopyButton
                      value={typeof parsedResult === 'object' ? JSON.stringify(parsedResult, null, 2) : String(result)}
                    />
                  </div>
                  <div className="bg-muted/30 rounded-lg p-2 border overflow-hidden">
                    {typeof parsedResult === 'object' ? (
                      <JsonViewer data={parsedResult} className="max-h-48 overflow-auto" />
                    ) : (
                      <p className="text-xs text-muted-foreground whitespace-pre-wrap font-mono">{result}</p>
                    )}
                  </div>
                </div>
              )}
            </div>
          </CollapsibleContent>
        </Collapsible>
      </div>
    </div>
  );
}

/**
 * Transfer conversation display - shows the transcript from a transfer attempt
 */
function TransferConversationCard({ transfer }: { transfer: TransferAttempt }) {
  const [isOpen, setIsOpen] = useState(false);
  const mode = transfer.destination?.transferPlan?.mode || 'unknown';
  const status = transfer.status || 'unknown';

  // Parse the transcript into lines
  const transcriptLines = transfer.transcript
    ? transfer.transcript.split('\n').filter(line => line.trim())
    : [];

  return (
    <div className="flex justify-center my-2">
      <div className="w-[85%] max-w-md">
        <Collapsible open={isOpen} onOpenChange={setIsOpen}>
          <CollapsibleTrigger asChild>
            <div className="flex items-center gap-3 p-3 bg-muted/50 border rounded-xl cursor-pointer hover:bg-muted transition-colors">
              <div className="p-2 bg-amber-500/10 rounded-lg">
                <ArrowLeftRight className="h-4 w-4 text-amber-600" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className="text-sm font-medium">Transfer Conversation</span>
                  <Badge
                    variant={status === 'completed' ? 'default' : status === 'cancelled' ? 'secondary' : 'outline'}
                    className="text-[10px] px-1.5 py-0"
                  >
                    {status}
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground">
                  Mode: {mode.replace(/-/g, ' ')}
                </p>
              </div>
              <ChevronDown className={cn(
                "h-4 w-4 text-muted-foreground transition-transform",
                isOpen && "rotate-180"
              )} />
            </div>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <div className="mt-1 p-3 bg-background border border-t-0 rounded-b-xl space-y-2 max-h-48 overflow-auto">
              {transcriptLines.length > 0 ? (
                transcriptLines.map((line, idx) => {
                  const isAI = line.startsWith('AI:');
                  const isUser = line.startsWith('User:');
                  const content = line.replace(/^(AI|User):\s*/, '');

                  return (
                    <div
                      key={idx}
                      className={cn(
                        "text-xs p-2 rounded-lg",
                        isAI && "bg-muted text-foreground ml-0 mr-4",
                        isUser && "bg-amber-100 dark:bg-amber-900/30 text-foreground ml-4 mr-0",
                        !isAI && !isUser && "bg-muted/50 text-muted-foreground"
                      )}
                    >
                      {(isAI || isUser) && (
                        <span className="font-medium opacity-70 block mb-0.5">
                          {isAI ? 'Transfer Agent' : 'Recipient'}
                        </span>
                      )}
                      {content}
                    </div>
                  );
                })
              ) : (
                <p className="text-xs text-muted-foreground text-center py-2">
                  No transcript available
                </p>
              )}
            </div>
          </CollapsibleContent>
        </Collapsible>
      </div>
    </div>
  );
}

/**
 * End of call reason display
 */
function EndedReasonCard({ reason }: { reason: string }) {
  return (
    <div className="flex justify-center my-3">
      <div className="inline-flex items-center gap-2 px-4 py-2 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900 rounded-full">
        <Phone className="h-3.5 w-3.5 text-red-400" />
        <span className="text-xs text-red-600 dark:text-red-400">
          Call ended: <span className="font-medium">{reason}</span>
        </span>
      </div>
    </div>
  );
}

/**
 * Advanced transcript component using webhook messages
 * Shows tool calls as cards with their results, timestamps, and endedReason at the end
 */
function AdvancedTranscript({ messages, transfers, endedReason }: { messages: WebhookMessage[]; transfers: TransferAttempt[]; endedReason?: string }) {
  // Build maps for tool call results and their timestamps
  const { toolResults, toolResultTimestamps } = useMemo(() => {
    const results = new Map<string, string>();
    const timestamps = new Map<string, number>();
    for (const msg of messages) {
      if (msg.role === 'tool_call_result' && msg.toolCallId) {
        if (msg.result) {
          results.set(msg.toolCallId, msg.result);
        }
        timestamps.set(msg.toolCallId, msg.secondsFromStart);
      }
    }
    return { toolResults: results, toolResultTimestamps: timestamps };
  }, [messages]);

  // Filter out system and tool_call_result messages, then adjust timestamps for tool_calls
  // Tool calls with results should be ordered by the result's timestamp
  const displayMessages = useMemo(() => {
    const filtered = messages
      .filter(msg => msg.role !== 'system' && msg.role !== 'tool_call_result')
      .map(msg => {
        // For tool_calls, use the result's timestamp if available
        if (msg.role === 'tool_calls' && msg.toolCalls && msg.toolCalls.length > 0) {
          // Find the latest result timestamp among all tool calls in this message
          let latestResultTime = msg.secondsFromStart;
          for (const tc of msg.toolCalls) {
            const resultTime = toolResultTimestamps.get(tc.id);
            if (resultTime !== undefined && resultTime > latestResultTime) {
              latestResultTime = resultTime;
            }
          }
          // Return a new object with adjusted timestamp if different
          if (latestResultTime !== msg.secondsFromStart) {
            return { ...msg, secondsFromStart: latestResultTime };
          }
        }
        return msg;
      });

    // Re-sort by the (possibly adjusted) secondsFromStart
    return filtered.sort((a, b) => a.secondsFromStart - b.secondsFromStart);
  }, [messages, toolResultTimestamps]);

  // Track transfer_call index to match with transfers array
  let transferCallIndex = 0;

  return (
    <div className="space-y-2">
      {displayMessages.map((msg, idx) => {
        const timestamp = formatSecondsToTime(msg.secondsFromStart);

        // Handle tool calls
        if (msg.role === 'tool_calls' && msg.toolCalls && msg.toolCalls.length > 0) {
          // Check if any tool call is a transfer_call
          const transferToolCalls = msg.toolCalls.filter(tc => tc.function.name === 'transfer_call');
          const otherToolCalls = msg.toolCalls.filter(tc => tc.function.name !== 'transfer_call');

          return (
            <div key={idx}>
              {/* Show non-transfer tool calls */}
              {otherToolCalls.map((tc) => (
                <ToolCallCard
                  key={tc.id}
                  toolCall={tc}
                  result={toolResults.get(tc.id)}
                  timestamp={timestamp}
                />
              ))}
              {/* Show transfer tool calls with their conversation */}
              {transferToolCalls.map((tc) => {
                const currentTransferIndex = transferCallIndex;
                transferCallIndex++;
                const transfer = transfers[currentTransferIndex];

                return (
                  <div key={tc.id}>
                    <ToolCallCard
                      toolCall={tc}
                      result={toolResults.get(tc.id)}
                      timestamp={timestamp}
                    />
                    {/* Show transfer conversation if available */}
                    {transfer && transfer.transcript && (
                      <TransferConversationCard transfer={transfer} />
                    )}
                  </div>
                );
              })}
            </div>
          );
        }

        // Handle bot (agent) message
        if (msg.role === 'bot' && msg.message) {
          return (
            <div key={idx} className="flex justify-start">
              <div className="max-w-[75%] px-3 py-2 rounded-lg text-sm bg-muted text-foreground rounded-bl-none">
                <div className="flex items-center justify-between gap-2 mb-0.5">
                  <span className="text-xs font-medium opacity-70">Agent</span>
                  <span className="text-[10px] text-muted-foreground font-mono tabular-nums">{timestamp}</span>
                </div>
                {msg.message}
              </div>
            </div>
          );
        }

        // Handle user (caller) message
        if (msg.role === 'user' && msg.message) {
          return (
            <div key={idx} className="flex justify-end">
              <div className="max-w-[75%] px-3 py-2 rounded-lg text-sm bg-primary text-primary-foreground rounded-br-none">
                <div className="flex items-center justify-between gap-2 mb-0.5">
                  <span className="text-xs font-medium opacity-70">Caller</span>
                  <span className="text-[10px] opacity-70 font-mono tabular-nums">{timestamp}</span>
                </div>
                {msg.message}
              </div>
            </div>
          );
        }

        return null;
      })}

      {/* Show ended reason at the end */}
      {endedReason && <EndedReasonCard reason={endedReason} />}
    </div>
  );
}

/**
 * Transcript tab content with toggle between basic and advanced modes
 */
function TranscriptTabContent({
  transcription,
  webhooks,
  webhooksLoading,
}: {
  transcription: string | null;
  webhooks: Webhook[];
  webhooksLoading: boolean;
}) {
  // Default to advanced mode
  const [mode, setMode] = useState<'basic' | 'advanced'>('advanced');

  // Extract OpenAI messages and endedReason from webhooks
  const extractedData = useMemo(() => {
    if (webhooksLoading) return null;
    return extractWebhookMessages(webhooks);
  }, [webhooks, webhooksLoading]);

  // Check if advanced mode is available
  const hasAdvancedData = extractedData !== null && extractedData.messages.length > 0;

  // If advanced mode is selected but no data, fall back to basic
  const showAdvanced = mode === 'advanced' && hasAdvancedData;

  // No transcript at all
  if (!transcription && !hasAdvancedData) {
    return (
      <EmptyState
        icon={<FileText className="h-6 w-6 text-muted-foreground" />}
        message="No transcript available for this call"
      />
    );
  }

  return (
    <div className="space-y-3">
      {/* Tab-style toggle - only show if advanced data is available */}
      {hasAdvancedData && (
        <div className="flex justify-end">
          <div className="inline-flex items-center rounded-lg border bg-muted p-0.5">
            <button
              onClick={() => setMode('basic')}
              className={cn(
                "px-3 py-1 text-xs font-medium rounded-md transition-colors",
                mode === 'basic'
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              Basic
            </button>
            <button
              onClick={() => setMode('advanced')}
              className={cn(
                "px-3 py-1 text-xs font-medium rounded-md transition-colors",
                mode === 'advanced'
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              Advanced
            </button>
          </div>
        </div>
      )}

      {/* Loading state for webhooks when checking for advanced mode */}
      {webhooksLoading && mode === 'advanced' && (
        <div className="flex items-center justify-center py-4">
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground mr-2" />
          <span className="text-sm text-muted-foreground">Loading advanced transcript...</span>
        </div>
      )}

      {/* Content */}
      <Card>
        <CardContent className="p-4">
          <div className="space-y-3 max-h-[300px] sm:max-h-[400px] overflow-auto">
            {showAdvanced ? (
              <AdvancedTranscript
                messages={extractedData!.messages}
                transfers={extractedData!.transfers}
                endedReason={extractedData!.endedReason}
              />
            ) : transcription ? (
              parseTranscript(transcription).map((msg, idx) => (
                <TranscriptBubble key={idx} message={msg} />
              ))
            ) : (
              <p className="text-sm text-muted-foreground text-center py-4">
                No basic transcript available. Switch to Advanced to view tool calls.
              </p>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function InfoRow({ label, value, icon }: { label: string; value: React.ReactNode; icon?: React.ReactNode }) {
  return (
    <div className="flex items-start gap-3 py-2">
      {icon && <div className="text-muted-foreground mt-0.5">{icon}</div>}
      <div className="flex-1 min-w-0">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="text-sm font-medium truncate">{value || '-'}</p>
      </div>
    </div>
  );
}

function TransferItem({ transfer, highlight, transcript }: { transfer: Transfer; highlight?: boolean; transcript?: string }) {
  const [isOpen, setIsOpen] = useState(false);
  const [acknowledged, setAcknowledged] = useState(false);
  const [showTranscript, setShowTranscript] = useState(false);

  const handleOpenChange = (open: boolean) => {
    setIsOpen(open);
    if (!acknowledged) setAcknowledged(true);
  };

  return (
    <Card className={cn("overflow-hidden", highlight && !acknowledged && "animate-pulse-yellow")}>
      <Collapsible open={isOpen} onOpenChange={handleOpenChange}>
        <CollapsibleTrigger asChild>
          <CardHeader className="p-3 cursor-pointer hover:bg-muted/50 transition-colors">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <div className="p-1.5 bg-orange-500/10 rounded">
                  <ArrowLeftRight className="h-3.5 w-3.5 text-orange-500" />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">
                    {transfer.caller_name || 'Unknown'} → {transfer.transferred_to_name}
                  </p>
                  <p className="text-xs text-muted-foreground">{transfer.transfer_type}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant={getStatusBadgeVariant(transfer.transfer_status)}>
                  {transfer.transfer_status}
                </Badge>
                <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform ${isOpen ? 'rotate-180' : ''}`} />
              </div>
            </div>
          </CardHeader>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <CardContent className="p-3 pt-0 border-t bg-muted/30">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm pt-3">
              <InfoRow label="Phone" value={transfer.transferred_to_phone_number} icon={<Phone className="h-3.5 w-3.5" />} />
              <InfoRow label="Pickup Time" value={transfer.time_to_pickup_seconds ? `${transfer.time_to_pickup_seconds}s` : '-'} icon={<Clock className="h-3.5 w-3.5" />} />
              <InfoRow label="Started" value={transfer.transfer_started_at} icon={<Calendar className="h-3.5 w-3.5" />} />
              <InfoRow label="Transfer ID" value={`#${transfer.id}`} icon={<Hash className="h-3.5 w-3.5" />} />
            </div>
            {transfer.error_message && (
              <div className="mt-3 p-2 bg-red-500/10 rounded-md border border-red-500/20 text-red-600 dark:text-red-400 text-sm flex items-start gap-2">
                <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
                <span>{transfer.error_message}</span>
              </div>
            )}
            {/* Transfer Conversation */}
            {transcript && (
              <div className="mt-3">
                <Collapsible open={showTranscript} onOpenChange={setShowTranscript}>
                  <CollapsibleTrigger asChild>
                    <button className="flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors w-full">
                      <MessageSquare className="h-3.5 w-3.5" />
                      <span>Transfer Conversation</span>
                      <ChevronDown className={`h-3.5 w-3.5 ml-auto transition-transform ${showTranscript ? 'rotate-180' : ''}`} />
                    </button>
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <div className="mt-2 p-3 bg-background rounded-md border max-h-48 overflow-y-auto">
                      <p className="text-sm text-muted-foreground whitespace-pre-wrap leading-relaxed">{transcript}</p>
                    </div>
                  </CollapsibleContent>
                </Collapsible>
              </div>
            )}
          </CardContent>
        </CollapsibleContent>
      </Collapsible>
    </Card>
  );
}

function EmailItem({ email, highlight }: { email: Email; highlight?: boolean }) {
  const [isOpen, setIsOpen] = useState(false);
  const [acknowledged, setAcknowledged] = useState(false);

  const handleOpenChange = (open: boolean) => {
    setIsOpen(open);
    if (!acknowledged) setAcknowledged(true);
  };

  return (
    <Card className={cn("overflow-hidden", highlight && !acknowledged && "animate-pulse-yellow")}>
      <Collapsible open={isOpen} onOpenChange={handleOpenChange}>
        <CollapsibleTrigger asChild>
          <CardHeader className="p-3 cursor-pointer hover:bg-muted/50 transition-colors">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <div className="p-1.5 bg-green-500/10 rounded">
                  <Mail className="h-3.5 w-3.5 text-green-500" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium break-words">{email.subject}</p>
                  <p className="text-xs text-muted-foreground">{email.email_type}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant={getStatusBadgeVariant(email.status)}>
                  {email.status}
                </Badge>
                <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform ${isOpen ? 'rotate-180' : ''}`} />
              </div>
            </div>
          </CardHeader>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <CardContent className="p-3 pt-0 border-t bg-muted/30">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm pt-3">
              <div className="flex items-start gap-3 py-2">
                <div className="text-muted-foreground mt-0.5"><User className="h-3.5 w-3.5" /></div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-muted-foreground">Recipients</p>
                  <RecipientsDisplay recipients={email.recipients} compact className="text-sm font-medium" />
                </div>
              </div>
              <InfoRow label="Sent At" value={email.sent_at} icon={<Calendar className="h-3.5 w-3.5" />} />
              <InfoRow label="Email ID" value={`#${email.id}`} icon={<Hash className="h-3.5 w-3.5" />} />
              <InfoRow label="Subject" value={email.subject} icon={<Mail className="h-3.5 w-3.5" />} />
            </div>
            {email.body && (
              <div className="mt-3">
                <p className="text-xs text-muted-foreground mb-2">Email Body</p>
                <div className="p-3 bg-background rounded-md border max-h-60 overflow-auto">
                  <EmailBodyDisplay body={email.body} compact />
                </div>
              </div>
            )}
          </CardContent>
        </CollapsibleContent>
      </Collapsible>
    </Card>
  );
}


interface WebhookItemProps {
  webhook: Webhook;
  callerName?: string | null;
  dbTransfers?: Transfer[];
  highlight?: boolean;
}

function WebhookItem({ webhook, callerName, dbTransfers = [], highlight }: WebhookItemProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [acknowledged, setAcknowledged] = useState(false);
  const [transfersAcknowledged, setTransfersAcknowledged] = useState(false);
  const [isPayloadModalOpen, setIsPayloadModalOpen] = useState(false);

  const handleOpenChange = (open: boolean) => {
    setIsOpen(open);
    if (!acknowledged) setAcknowledged(true);
  };

  // Memoize the expensive payload parsing and enrichment
  const parsedPayload = useMemo(
    () => parseWebhookPayload(webhook.payload),
    [webhook.payload]
  );

  // Enrich parsed transfers with database data
  const enrichedTransfers = useMemo(
    () => enrichTransfersWithDatabaseData(parsedPayload.transfers, callerName, dbTransfers),
    [parsedPayload.transfers, callerName, dbTransfers]
  );

  return (
    <Card className={cn("overflow-hidden", highlight && !acknowledged && "animate-pulse-yellow")}>
      <Collapsible open={isOpen} onOpenChange={handleOpenChange}>
        <CollapsibleTrigger asChild>
          <CardHeader className="p-3 cursor-pointer hover:bg-muted/50 transition-colors">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <div className="p-1.5 bg-purple-500/10 rounded">
                  <WebhookIcon className="h-3.5 w-3.5 text-purple-500" />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">{webhook.webhook_type}</p>
                  <p className="text-xs text-muted-foreground">{webhook.platform}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant="outline">{webhook.platform}</Badge>
                <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform ${isOpen ? 'rotate-180' : ''}`} />
              </div>
            </div>
          </CardHeader>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <CardContent className="p-3 pt-0 border-t bg-muted/30 overflow-hidden">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm pt-3">
              <InfoRow label="Received" value={webhook.received_at} icon={<Calendar className="h-3.5 w-3.5" />} />
              <div className="flex items-start gap-3 py-2">
                <div className="text-muted-foreground mt-0.5"><Hash className="h-3.5 w-3.5" /></div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-muted-foreground">Platform Call ID</p>
                  <div className="flex items-center gap-1">
                    <p className="text-sm font-medium truncate">{webhook.platform_call_id || '-'}</p>
                    {webhook.platform_call_id && <CopyButton value={webhook.platform_call_id} />}
                  </div>
                </div>
              </div>
            </div>

            <div className="mt-3 space-y-2 min-w-0">
              {parsedPayload.squadOverrides && (
                <details className="group rounded-lg border border-border overflow-hidden">
                  <summary className="flex items-center justify-between gap-2 p-2 bg-muted/50 hover:bg-muted cursor-pointer list-none">
                    <span className="flex items-center gap-2 font-medium text-xs">
                      <Building2 className="h-3.5 w-3.5" />
                      Squad Overrides
                    </span>
                    <div className="flex items-center gap-1">
                      <CopyButton value={JSON.stringify(parsedPayload.squadOverrides, null, 2)} />
                      <ChevronDown className="h-3.5 w-3.5 transition-transform group-open:rotate-180" />
                    </div>
                  </summary>
                  <div className="border-t">
                    <JsonViewer data={parsedPayload.squadOverrides} className="max-h-40 rounded-none border-0" />
                  </div>
                </details>
              )}

              {parsedPayload.assistantOverrides && (
                <details className="group rounded-lg border border-border overflow-hidden">
                  <summary className="flex items-center justify-between gap-2 p-2 bg-muted/50 hover:bg-muted cursor-pointer list-none">
                    <span className="flex items-center gap-2 font-medium text-xs">
                      <Bot className="h-3.5 w-3.5" />
                      Assistant Overrides
                    </span>
                    <div className="flex items-center gap-1">
                      <CopyButton value={JSON.stringify(parsedPayload.assistantOverrides, null, 2)} />
                      <ChevronDown className="h-3.5 w-3.5 transition-transform group-open:rotate-180" />
                    </div>
                  </summary>
                  <div className="border-t">
                    <JsonViewer data={parsedPayload.assistantOverrides} className="max-h-40 rounded-none border-0" />
                  </div>
                </details>
              )}

              {parsedPayload.structuredOutputs && (
                <details className="group rounded-lg border border-border overflow-hidden">
                  <summary className="flex items-center justify-between gap-2 p-2 bg-muted/50 hover:bg-muted cursor-pointer list-none">
                    <span className="flex items-center gap-2 font-medium text-xs">
                      <BarChart3 className="h-3.5 w-3.5" />
                      Structured Outputs
                    </span>
                    <div className="flex items-center gap-1">
                      <CopyButton value={JSON.stringify(parsedPayload.structuredOutputs, null, 2)} />
                      <ChevronDown className="h-3.5 w-3.5 transition-transform group-open:rotate-180" />
                    </div>
                  </summary>
                  <div className="border-t">
                    <JsonViewer data={parsedPayload.structuredOutputs} className="max-h-40 rounded-none border-0" />
                  </div>
                </details>
              )}

              {enrichedTransfers.length > 0 && (
                <details
                  className={cn(
                    "group rounded-lg border border-border overflow-hidden",
                    highlight && !transfersAcknowledged && "animate-pulse-yellow"
                  )}
                  onToggle={() => {
                    if (!transfersAcknowledged) setTransfersAcknowledged(true);
                  }}
                >
                  <summary className="flex items-center justify-between gap-2 p-2 bg-muted/50 hover:bg-muted cursor-pointer list-none">
                    <span className="flex items-center gap-2 font-medium text-xs">
                      <ArrowLeftRight className="h-3.5 w-3.5" />
                      Transfers ({enrichedTransfers.length})
                    </span>
                    <div className="flex items-center gap-1">
                      <CopyButton value={JSON.stringify(enrichedTransfers, null, 2)} />
                      <ChevronDown className="h-3.5 w-3.5 transition-transform group-open:rotate-180" />
                    </div>
                  </summary>
                  <div className="p-2 bg-background border-t space-y-1.5 max-h-40 overflow-auto">
                    {enrichedTransfers.map((transfer) => (
                      <div key={transfer.toolCallId} className="p-1.5 bg-muted/50 rounded border text-xs">
                        <div className="flex items-center justify-between">
                          <span className="font-medium truncate mr-2">
                            {transfer.callerName} → {transfer.staffName}
                          </span>
                          <Badge variant={transfer.result.toLowerCase().includes('cancelled') ? 'destructive' : 'default'} className="text-[10px] px-1.5 py-0 shrink-0">
                            {transfer.result}
                          </Badge>
                        </div>
                      </div>
                    ))}
                  </div>
                </details>
              )}

              <details className="group rounded-lg border border-border overflow-hidden">
                <summary className="flex items-center justify-between gap-2 p-2 bg-muted/50 hover:bg-muted cursor-pointer list-none">
                  <span className="flex items-center gap-2 font-medium text-xs">
                    <FileText className="h-3.5 w-3.5" />
                    Full Payload
                  </span>
                  <div className="flex items-center gap-1">
                    <CopyButton value={JSON.stringify(webhook.payload, null, 2)} />
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6"
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        setIsPayloadModalOpen(true);
                      }}
                      title="Expand payload"
                    >
                      <Maximize2 className="h-3.5 w-3.5" />
                    </Button>
                    <ChevronDown className="h-3.5 w-3.5 transition-transform group-open:rotate-180" />
                  </div>
                </summary>
                <div className="border-t relative h-60">
                  <div className="absolute inset-0 overflow-auto">
                    <JsonViewer data={webhook.payload} className="rounded-none border-0" />
                  </div>
                </div>
              </details>

              {/* Full Payload Modal */}
              <Dialog open={isPayloadModalOpen} onOpenChange={setIsPayloadModalOpen}>
                <DialogContent className="max-w-4xl h-[85vh] flex flex-col p-0 gap-0">
                  <DialogHeader className="px-6 py-4 border-b shrink-0">
                    <div className="flex items-center justify-between">
                      <DialogTitle className="flex items-center gap-2 text-base">
                        <FileText className="h-4 w-4" />
                        Full Payload
                      </DialogTitle>
                      <CopyButton value={JSON.stringify(webhook.payload, null, 2)} />
                    </div>
                  </DialogHeader>
                  <div className="flex-1 overflow-auto min-h-0">
                    <JsonViewer data={webhook.payload} className="rounded-none border-0" />
                  </div>
                </DialogContent>
              </Dialog>
            </div>
          </CardContent>
        </CollapsibleContent>
      </Collapsible>
    </Card>
  );
}

function getLevelIcon(level: string) {
  switch (level) {
    case 'error':
      return <AlertCircle className="h-3.5 w-3.5 text-red-500" />;
    case 'warning':
      return <AlertTriangle className="h-3.5 w-3.5 text-yellow-500" />;
    default:
      return <Info className="h-3.5 w-3.5 text-blue-500" />;
  }
}

function getLevelBgColor(level: string) {
  switch (level) {
    case 'error':
      return 'bg-red-500/10';
    case 'warning':
      return 'bg-yellow-500/10';
    default:
      return 'bg-blue-500/10';
  }
}

function getTypeIcon(type: string) {
  switch (type) {
    case 'transfer':
      return <ArrowLeftRight className="h-3.5 w-3.5" />;
    case 'webhook':
      return <WebhookIcon className="h-3.5 w-3.5" />;
    case 'tool:search_case':
      return <Search className="h-3.5 w-3.5" />;
    case 'tool:take_message':
      return <MessageSquare className="h-3.5 w-3.5" />;
    case 'tool:schedule_callback':
      return <Calendar className="h-3.5 w-3.5" />;
    case 'vapi':
      return <Phone className="h-3.5 w-3.5" />;
    default:
      return <HelpCircle className="h-3.5 w-3.5" />;
  }
}

function SentryEventItem({ event }: { event: SentryEvent }) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <Card className="overflow-hidden">
      <Collapsible open={isOpen} onOpenChange={setIsOpen}>
        <CollapsibleTrigger asChild>
          <CardHeader className="p-3 cursor-pointer hover:bg-muted/50 transition-colors">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <div className={`p-1.5 rounded ${getLevelBgColor(event.level)}`}>
                  {getLevelIcon(event.level)}
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">{event.title?.slice(0, 50)}</p>
                  <p className="text-xs text-muted-foreground flex items-center gap-1">
                    {getTypeIcon(event.event_type)}
                    {event.event_type}
                    {event.environment && (
                      <Badge variant="outline" className="ml-1 text-[10px] px-1 py-0 h-4">
                        {event.environment}
                      </Badge>
                    )}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant={event.level === 'error' ? 'destructive' : event.level === 'warning' ? 'secondary' : 'outline'}>
                  {event.level}
                </Badge>
                <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform ${isOpen ? 'rotate-180' : ''}`} />
              </div>
            </div>
          </CardHeader>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <CardContent className="p-3 pt-0 border-t bg-muted/30">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm pt-3">
              <InfoRow label="Logger" value={event.logger} icon={<Bug className="h-3.5 w-3.5" />} />
              <InfoRow label="Time" value={event.timestamp} icon={<Clock className="h-3.5 w-3.5" />} />
            </div>
            <div className="mt-3 p-3 bg-background rounded-md border">
              <p className="text-xs text-muted-foreground mb-1">Message</p>
              <pre className="whitespace-pre-wrap text-sm">{event.message}</pre>
            </div>
            {event.request && (
              <div className="mt-3">
                <Collapsible>
                  <CollapsibleTrigger asChild>
                    <Button variant="ghost" size="sm" className="h-7 text-xs px-2">
                      <ChevronDown className="h-3 w-3 mr-1" />
                      Request Details
                    </Button>
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <div className="mt-2 p-3 bg-background rounded-md border text-xs">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-2">
                        <div><strong>Method:</strong> {event.request.method}</div>
                        <div className="break-all"><strong>URL:</strong> {event.request.url}</div>
                      </div>
                      {event.request.body && (
                        <div className="mt-2">
                          <p className="text-xs text-muted-foreground mb-1">Request Body</p>
                          <JsonViewer data={event.request.body} className="max-h-40" />
                        </div>
                      )}
                    </div>
                  </CollapsibleContent>
                </Collapsible>
              </div>
            )}
          </CardContent>
        </CollapsibleContent>
      </Collapsible>
    </Card>
  );
}

function EmptyState({ icon, message }: { icon: React.ReactNode; message: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-8 text-center">
      <div className="p-3 bg-muted rounded-full mb-3">
        {icon}
      </div>
      <p className="text-sm text-muted-foreground">{message}</p>
    </div>
  );
}

function SectionBadge({ count, color, isLoading }: { count: number; color: string; isLoading?: boolean }) {
  if (isLoading) {
    return (
      <span className={`ml-2 inline-flex items-center justify-center px-1.5 py-0.5 text-xs font-medium rounded-full ${color}`}>
        <Loader2 className="h-3 w-3 animate-spin" />
      </span>
    );
  }
  if (count === 0) return null;
  return (
    <span className={`ml-2 inline-flex items-center justify-center px-1.5 py-0.5 text-xs font-medium rounded-full ${color}`}>
      {count}
    </span>
  );
}

// Shared props for left/right panels
interface CallDetailPanelSharedProps {
  callId: number | string;  // Supports both numeric ID and correlation ID
  highlightReasons?: HighlightReasons;
  dateRange?: {
    startDate: string | null;
    endDate: string | null;
  };
  onShare?: (correlationId: string) => void;
}

/**
 * Feedback section component with inline editing
 */
function FeedbackSection({
  feedback,
  cekuraId,
  correlationId,
  isLoading,
}: {
  feedback: string | null | undefined;
  cekuraId: number | undefined;
  correlationId: string | null | undefined;
  isLoading: boolean;
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const mutation = useCekuraFeedbackMutation();

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current && isEditing) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 200)}px`;
    }
  }, [editValue, isEditing]);

  // Focus textarea when entering edit mode
  useEffect(() => {
    if (isEditing && textareaRef.current) {
      textareaRef.current.focus();
      const len = textareaRef.current.value.length;
      textareaRef.current.setSelectionRange(len, len);
    }
  }, [isEditing]);

  const handleStartEdit = () => {
    setEditValue(feedback || '');
    setIsEditing(true);
  };

  const handleSave = async () => {
    if (!cekuraId || !correlationId) return;

    try {
      await mutation.mutateAsync({
        cekuraId,
        feedback: editValue,
        correlationId,
      });
      setIsEditing(false);
    } catch (error) {
      console.error('Failed to save feedback:', error);
    }
  };

  const handleCancel = () => {
    setIsEditing(false);
    setEditValue('');
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSave();
    } else if (e.key === 'Escape') {
      handleCancel();
    }
  };

  const hasFeedback = feedback && feedback.trim().length > 0;

  // Loading state
  if (isLoading) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <MessageSquareText className="h-4 w-4" />
            Feedback
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading...
          </div>
        </CardContent>
      </Card>
    );
  }

  // No Cekura data available
  if (!cekuraId) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <MessageSquareText className="h-4 w-4" />
            Feedback
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          <p className="text-sm text-muted-foreground italic">
            No Cekura data available for this call
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm flex items-center gap-2">
            <MessageSquareText className="h-4 w-4" />
            Feedback
          </CardTitle>
          {!isEditing && (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-xs"
              onClick={handleStartEdit}
            >
              <Pencil className="h-3 w-3 mr-1" />
              {hasFeedback ? 'Edit' : 'Add'}
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        {isEditing ? (
          <div className="space-y-2">
            <textarea
              ref={textareaRef}
              value={editValue}
              onChange={(e) => setEditValue(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Enter your feedback about this call..."
              className={cn(
                "w-full min-h-[80px] max-h-[200px] px-3 py-2 text-sm rounded-md resize-none",
                "border border-input bg-background",
                "focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-1",
                "placeholder:text-muted-foreground"
              )}
              disabled={mutation.isPending}
            />
            <div className="flex items-center justify-between">
              <p className="text-xs text-muted-foreground">
                Enter to save, Shift+Enter for new line
              </p>
              <div className="flex items-center gap-1">
                {mutation.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                ) : (
                  <>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 px-2 text-green-600 hover:text-green-700 hover:bg-green-50 dark:hover:bg-green-950"
                      onClick={handleSave}
                    >
                      <Check className="h-3.5 w-3.5 mr-1" />
                      Save
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 px-2 text-muted-foreground hover:text-foreground"
                      onClick={handleCancel}
                    >
                      <X className="h-3.5 w-3.5 mr-1" />
                      Cancel
                    </Button>
                  </>
                )}
              </div>
            </div>
          </div>
        ) : hasFeedback ? (
          <p className="text-sm text-foreground leading-relaxed whitespace-pre-wrap">
            {feedback}
          </p>
        ) : (
          <p className="text-sm text-muted-foreground italic">
            No feedback yet. Click &quot;Add&quot; to add your notes.
          </p>
        )}
      </CardContent>
    </Card>
  );
}

/**
 * Left panel for the two-panel layout:
 * - Quick Links (VAPI, Sentry, Cekura)
 * - Call Information card
 * - Status badges
 * - Summary section
 * - Tabs: Info, Activity, Logs
 */
export function CallDetailLeftPanel({ callId, highlightReasons, dateRange, onShare }: CallDetailPanelSharedProps) {
  const { data, isLoading, error } = useCallDetail(callId);
  const { environment } = useEnvironment();
  const platformCallId = data?.call?.platform_call_id;
  const sentryEnv = SENTRY_ENV_MAP[environment] || environment;

  // Fetch Cekura call data for the date range (progressive loading)
  const { data: cekuraData, isLoading: cekuraLoading, isFullyLoaded: cekuraFullyLoaded } = useCekuraCallMapping(
    dateRange?.startDate || null,
    dateRange?.endDate || null
  );
  const cekuraCallInfo = platformCallId ? cekuraData?.calls.get(platformCallId) : undefined;
  const cekuraCallId = cekuraCallInfo?.cekuraId;

  // Track which callId has been acknowledged for each tab
  const [logsAcknowledgedFor, setLogsAcknowledgedFor] = useState<number | string | null>(null);
  const [activityAcknowledgedFor, setActivityAcknowledgedFor] = useState<number | string | null>(null);

  const logsAcknowledged = logsAcknowledgedFor === callId;
  const activityAcknowledged = activityAcknowledgedFor === callId;

  // Fetch webhooks and sentry events in parallel
  const { data: webhooks, isLoading: webhooksLoading } = useWebhooksForCall(platformCallId || null);
  const { data: sentryData, isLoading: sentryLoading } = useSentryEventsForCall(platformCallId || null);

  // Extract endedReason and detect voicemail from webhooks (must be before early returns)
  const webhookData = useMemo(() => {
    if (webhooksLoading || !webhooks?.length) return null;
    return extractWebhookMessages(webhooks);
  }, [webhooks, webhooksLoading]);

  const endedReason = webhookData?.endedReason;

  // Check if any transfer went to voicemail
  const hasVoicemail = useMemo(() => {
    const transfers = webhookData?.transfers;
    if (!transfers) return false;
    return transfers.some((transfer) => {
      const transcript = transfer.transcript?.toLowerCase() || '';
      return transcript.includes('voicemail') || transcript.includes('voice mail');
    });
  }, [webhookData]);

  if (isLoading) {
    return (
      <div className="space-y-4 p-4">
        <Skeleton className="h-10" />
        <Skeleton className="h-32" />
        <Skeleton className="h-32" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="flex flex-col items-center justify-center py-12 p-4">
        <div className="p-3 bg-red-500/10 rounded-full mb-3">
          <XCircle className="h-6 w-6 text-red-500" />
        </div>
        <p className="text-red-500 font-medium">Failed to load call details</p>
        <p className="text-sm text-muted-foreground mt-1">Please try again later</p>
      </div>
    );
  }

  const { call, transfers, emails } = data;
  const webhooksList = webhooks || [];
  const sentryEvents = sentryData?.events || [];

  const activityCount = transfers.length + emails.length + webhooksList.length;
  const hasErrors = sentryEvents.some(e => e.level === 'error');

  return (
    <Tabs
      defaultValue="info"
      className="flex flex-col h-full min-h-0 gap-0"
      onValueChange={(value) => {
        if (value === 'logs') setLogsAcknowledgedFor(callId);
        if (value === 'activity') setActivityAcknowledgedFor(callId);
      }}
    >
      {/* Fixed Header: Quick Links, Feedback, Tab Selector */}
      <div className="shrink-0 p-4 space-y-4 border-b bg-background">
        {/* Quick Links */}
        <div className="flex items-center gap-2 flex-wrap">
          {call.platform_call_id && (
            <Button variant="outline" size="sm" asChild>
              <a
                href={`https://dashboard.vapi.ai/calls/${call.platform_call_id}`}
                target="_blank"
                rel="noopener noreferrer"
              >
                <ExternalLink className="h-3.5 w-3.5 mr-1.5" />
                VAPI
              </a>
            </Button>
          )}
          {call.platform_call_id && (
            <Button variant="outline" size="sm" asChild>
              <a
                href={`https://helloounsil.sentry.io/explore/logs/?environment=${sentryEnv}&logsFields=timestamp&logsFields=correlation_id&logsFields=message&logsQuery=correlation_id%3A${call.platform_call_id}&logsSortBys=-timestamp`}
                target="_blank"
                rel="noopener noreferrer"
              >
                <Bug className="h-3.5 w-3.5 mr-1.5" />
                Sentry
              </a>
            </Button>
          )}
          {call.platform_call_id && (
            cekuraCallId ? (
              <Button variant="outline" size="sm" asChild>
                <a
                  href={buildCekuraUrl(cekuraCallId, environment)}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <BarChart3 className="h-3.5 w-3.5 mr-1.5" />
                  Cekura
                </a>
              </Button>
            ) : cekuraLoading || !cekuraFullyLoaded ? (
              <Button variant="outline" size="sm" disabled>
                <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                Cekura
              </Button>
            ) : null
          )}
          {/* Cekura Status Selector */}
          {cekuraCallInfo?.status && cekuraCallId && platformCallId && (
            <CekuraStatusSelector
              status={cekuraCallInfo.status}
              cekuraId={cekuraCallId}
              correlationId={platformCallId}
            />
          )}
          {/* Share Button */}
          {onShare && call.platform_call_id && (
            <Button
              variant="outline"
              size="sm"
              className="px-2"
              onClick={() => onShare(call.platform_call_id!)}
              title="Share link"
            >
              <Share2 className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>

        {/* Feedback Section */}
        <FeedbackSection
          feedback={cekuraCallInfo?.feedback}
          cekuraId={cekuraCallId}
          correlationId={platformCallId}
          isLoading={cekuraLoading && !cekuraFullyLoaded}
        />

        {/* Tab Selector */}
        <TabsList className="w-full grid grid-cols-3">
          <TabsTrigger value="info" className="text-xs">
            <ClipboardList className="h-3.5 w-3.5 mr-1" />
            Info
          </TabsTrigger>
          <TabsTrigger
            value="activity"
            className={cn(
              "text-xs",
              highlightReasons?.important && !activityAcknowledged && "animate-pulse-orange",
              highlightReasons?.transferMismatch && !activityAcknowledged && "animate-pulse-yellow"
            )}
          >
            <Activity className="h-3.5 w-3.5 mr-1" />
            Activity
            <SectionBadge count={activityCount} color="bg-primary/20 text-primary" isLoading={webhooksLoading} />
          </TabsTrigger>
          <TabsTrigger
            value="logs"
            className={cn(
              "text-xs",
              highlightReasons?.sentry && !logsAcknowledged && "animate-pulse-red"
            )}
          >
            <Bug className="h-3.5 w-3.5 mr-1" />
            Logs
            {sentryLoading ? (
              <span className="ml-1 inline-flex items-center justify-center">
                <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
              </span>
            ) : hasErrors ? (
              <span className="ml-1 w-2 h-2 bg-red-500 rounded-full" />
            ) : null}
          </TabsTrigger>
        </TabsList>
      </div>

      {/* Scrollable Content Area */}
      <div className="flex-1 overflow-y-auto p-4 min-h-0">
        {/* Info Tab */}
        <TabsContent value="info" className="mt-0 space-y-4 flex-none">
          {/* Call Information Card */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Call Information</CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1">
                <InfoRow label="Caller" value={call.caller_name} icon={<User className="h-3.5 w-3.5" />} />
                <InfoRow label="Phone" value={call.phone_number} icon={<Phone className="h-3.5 w-3.5" />} />
                <InfoRow
                  label="Duration"
                  value={
                    <span className={cn(highlightReasons?.duration && "animate-pulse-orange-text")}>
                      {formatDuration(call.call_duration)}
                    </span>
                  }
                  icon={<Clock className="h-3.5 w-3.5" />}
                />
                <InfoRow label="Started" value={call.started_at} icon={<Calendar className="h-3.5 w-3.5" />} />
              </div>
            </CardContent>
          </Card>

          {/* Status Section */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Status</CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              <div className="flex flex-wrap gap-2">
                <Badge variant="outline" className="px-2 py-1">
                  <Phone className="h-3 w-3 mr-1" />
                  {call.call_type || 'Unknown'}
                </Badge>
                <Badge variant={getStatusBadgeVariant(call.status)} className="px-2 py-1">
                  {call.status === 'completed' ? <CheckCircle className="h-3 w-3 mr-1" /> : <Activity className="h-3 w-3 mr-1" />}
                  {call.status}
                </Badge>
                {call.platform && (
                  <Badge variant="secondary" className="px-2 py-1">
                    {call.platform}
                  </Badge>
                )}
                {hasVoicemail && (
                  <Badge variant="outline" className="px-2 py-1 bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800">
                    <Voicemail className="h-3 w-3 mr-1" />
                    Voicemail
                  </Badge>
                )}
                {endedReason && (
                  <Badge variant="outline" className="px-2 py-1">
                    <PhoneOff className="h-3 w-3 mr-1" />
                    {endedReason}
                  </Badge>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Summary */}
          {call.summary && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Summary</CardTitle>
              </CardHeader>
              <CardContent className="pt-0">
                <p className="text-sm text-muted-foreground leading-relaxed">{call.summary}</p>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* Activity Tab */}
        <TabsContent value="activity" className="mt-4 space-y-4 flex-none">
          {/* Transfers */}
          <div>
            <div className="flex items-center gap-2 mb-2">
              <ArrowLeftRight className="h-4 w-4 text-orange-500" />
              <h4 className="text-sm font-medium">Transfers</h4>
              <Badge variant="secondary" className="text-xs">{transfers.length}</Badge>
            </div>
            {transfers.length > 0 ? (
              <div className="space-y-2">
                {transfers.map((t, index) => {
                  // Try to match webhook transfer by phone number or by index
                  const webhookTransfers = webhookData?.transfers || [];
                  const matchedWebhookTransfer = webhookTransfers.find(
                    (wt: TransferAttempt) => wt.destination?.number?.replace(/\D/g, '').slice(-10) === t.transferred_to_phone_number?.replace(/\D/g, '').slice(-10)
                  ) || webhookTransfers[index];
                  return (
                    <TransferItem
                      key={t.id}
                      transfer={t}
                      highlight={highlightReasons?.transferMismatch}
                      transcript={matchedWebhookTransfer?.transcript}
                    />
                  );
                })}
              </div>
            ) : (
              <Card>
                <CardContent className="py-6">
                  <p className="text-sm text-muted-foreground text-center">No transfers for this call</p>
                </CardContent>
              </Card>
            )}
          </div>

          <Separator />

          {/* Emails */}
          <div>
            <div className="flex items-center gap-2 mb-2">
              <Mail className="h-4 w-4 text-green-500" />
              <h4 className="text-sm font-medium">Emails</h4>
              <Badge variant="secondary" className="text-xs">{emails.length}</Badge>
            </div>
            {emails.length > 0 ? (
              <div className="space-y-2">
                {emails.map((e) => (
                  <EmailItem key={e.id} email={e} highlight={highlightReasons?.transferMismatch} />
                ))}
              </div>
            ) : (
              <Card>
                <CardContent className="py-6">
                  <p className="text-sm text-muted-foreground text-center">No emails for this call</p>
                </CardContent>
              </Card>
            )}
          </div>

          <Separator />

          {/* Webhooks */}
          <div>
            <div className="flex items-center gap-2 mb-2">
              <WebhookIcon className="h-4 w-4 text-purple-500" />
              <h4 className="text-sm font-medium">Webhooks</h4>
              <Badge variant="secondary" className="text-xs">
                {webhooksLoading ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  webhooksList.length
                )}
              </Badge>
            </div>
            {webhooksLoading ? (
              <div className="space-y-2">
                <Skeleton className="h-16" />
                <Skeleton className="h-16" />
              </div>
            ) : webhooksList.length > 0 ? (
              <div className="space-y-2">
                {webhooksList.map((w) => (
                  <WebhookItem
                    key={w.id}
                    webhook={w}
                    callerName={call.caller_name}
                    dbTransfers={transfers}
                    highlight={highlightReasons?.transferMismatch}
                  />
                ))}
              </div>
            ) : (
              <Card>
                <CardContent className="py-6">
                  <p className="text-sm text-muted-foreground text-center">No webhooks for this call</p>
                </CardContent>
              </Card>
            )}
          </div>
        </TabsContent>

        {/* Logs Tab */}
        <TabsContent value="logs" className="mt-4 flex-none">
          {!call.platform_call_id ? (
            <EmptyState
              icon={<Bug className="h-6 w-6 text-muted-foreground" />}
              message="No Correlation ID - cannot fetch Sentry logs"
            />
          ) : sentryLoading ? (
            <div className="space-y-2">
              <Skeleton className="h-16" />
              <Skeleton className="h-16" />
              <Skeleton className="h-16" />
            </div>
          ) : sentryEvents.length > 0 ? (
            <div className="space-y-2">
              {sentryEvents.map((e) => (
                <SentryEventItem key={e.event_id} event={e} />
              ))}
            </div>
          ) : (
            <EmptyState
              icon={<CheckCircle className="h-6 w-6 text-green-500" />}
              message="No logs found for this call"
            />
          )}
        </TabsContent>
      </div>
    </Tabs>
  );
}

/**
 * Right panel for the two-panel layout:
 * - Audio player (full width)
 * - Transcript section (no max-height, uses full available space)
 * - Mode toggle (Basic/Advanced/Errors) at top
 */
export function CallDetailRightPanel({ callId, dateRange }: CallDetailPanelSharedProps) {
  const { data, isLoading, error } = useCallDetail(callId);
  const platformCallId = data?.call?.platform_call_id;

  // Fetch webhooks for advanced transcript
  const { data: webhooks, isLoading: webhooksLoading } = useWebhooksForCall(platformCallId || null);

  // Fetch Cekura data for transcription errors
  const { data: cekuraData, isLoading: cekuraLoading } = useCekuraCallMapping(
    dateRange?.startDate || null,
    dateRange?.endDate || null
  );
  const cekuraCallInfo = platformCallId ? cekuraData?.calls.get(platformCallId) : undefined;
  const errorMetrics = cekuraCallInfo?.errorMetrics || [];

  // Resolve firm name from cached firms list (must be before early returns)
  const { data: firmsData } = useFirms();

  if (isLoading) {
    return (
      <div className="space-y-4 p-4">
        <Skeleton className="h-20" />
        <Skeleton className="h-96" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="flex flex-col items-center justify-center py-12 p-4">
        <div className="p-3 bg-red-500/10 rounded-full mb-3">
          <XCircle className="h-6 w-6 text-red-500" />
        </div>
        <p className="text-red-500 font-medium">Failed to load call details</p>
      </div>
    );
  }

  const { call } = data;
  const webhooksList = webhooks || [];
  const firmName = firmsData?.firms?.find(f => f.id === call.firm_id)?.name || null;

  return (
    <div className="flex flex-col h-full p-4 space-y-4">
      {/* Audio Player */}
      {call.recording_url && (
        <Card className="shrink-0">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Play className="h-4 w-4" />
              Recording
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <AudioPlayer src={call.recording_url} />
          </CardContent>
        </Card>
      )}

      {/* Transcript - fills remaining space */}
      <div className="flex-1 min-h-0">
        <TranscriptSection
          callId={callId}
          recordingUrl={call.recording_url}
          firmName={firmName}
          transcription={call.transcription}
          webhooks={webhooksList}
          webhooksLoading={webhooksLoading}
          errorMetrics={errorMetrics}
          errorMetricsLoading={cekuraLoading}
        />
      </div>
    </div>
  );
}

/**
 * Single bubble in the accurate transcript view.
 * Shows corrections inline with strikethrough for originals.
 */
function AccurateTranscriptBubble({ utterance }: { utterance: AccurateUtterance }) {
  const isAssistant = utterance.role === 'assistant';
  const hasCorrections = utterance.corrections.length > 0;

  return (
    <div className={cn('flex', isAssistant ? 'justify-start' : 'justify-end')}>
      <div className={cn(
        'max-w-[80%] px-3 py-2 rounded-lg text-sm',
        isAssistant
          ? 'bg-muted text-foreground rounded-bl-none'
          : 'bg-primary text-primary-foreground rounded-br-none',
        hasCorrections && 'ring-1 ring-emerald-500/30'
      )}>
        <span className="text-xs font-medium opacity-70 block mb-0.5">
          {isAssistant ? 'Agent' : 'Caller'}
          {hasCorrections && (
            <span className="ml-1 text-emerald-500">
              ({utterance.corrections.length} {utterance.corrections.length === 1 ? 'fix' : 'fixes'})
            </span>
          )}
        </span>
        <p>{utterance.content}</p>
        {hasCorrections && (
          <div className="mt-2 pt-2 border-t border-current/10 space-y-1">
            {utterance.corrections.map((c, i) => (
              <div key={i} className="text-xs opacity-80">
                <span className="line-through opacity-60">{c.original}</span>
                {' \u2192 '}
                <span className="font-medium">{c.corrected}</span>
                <span className="opacity-50 ml-1">({c.source})</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * Accurate transcript view with on-demand generation via Gemini AI.
 * Shows a generate button initially, loading state, error state, or the corrected transcript.
 */
function AccurateTranscriptView({ onGenerate, canGenerate, data, isPending, error, reset }: {
  onGenerate: () => void;
  canGenerate: boolean;
  data: TranscriptionAccuracyResult | undefined;
  isPending: boolean;
  error: Error | null;
  reset: () => void;
}) {

  if (!data && !isPending && !error) {
    // Initial state - show generate button
    return (
      <div className="flex flex-col items-center justify-center py-12 space-y-4">
        <div className="p-4 bg-emerald-500/10 rounded-full">
          <Sparkles className="h-8 w-8 text-emerald-500" />
        </div>
        <div className="text-center space-y-2">
          <h3 className="text-sm font-medium">Accurate Transcript</h3>
          <p className="text-xs text-muted-foreground max-w-[300px]">
            {canGenerate
              ? 'Generate a corrected transcript by analyzing the call audio with AI. This compares the recording against the STT transcript to fix errors.'
              : 'No recording or webhook data available for this call. An audio recording and end-of-call report are required to generate an accurate transcript.'}
          </p>
        </div>
        <Button
          onClick={onGenerate}
          disabled={!canGenerate}
          className="bg-emerald-600 hover:bg-emerald-700 text-white disabled:opacity-50"
        >
          <Sparkles className="h-4 w-4 mr-2" />
          {canGenerate ? 'Generate Accurate Transcript' : 'No recording available'}
        </Button>
      </div>
    );
  }

  if (isPending) {
    return (
      <div className="flex flex-col items-center justify-center py-12 space-y-4">
        <Loader2 className="h-8 w-8 animate-spin text-emerald-500" />
        <div className="text-center space-y-1">
          <p className="text-sm font-medium">Generating accurate transcript...</p>
          <p className="text-xs text-muted-foreground">
            Analyzing audio recording with AI. This may take a few minutes.
          </p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-12 space-y-4">
        <div className="p-3 bg-red-500/10 rounded-full">
          <XCircle className="h-6 w-6 text-red-500" />
        </div>
        <div className="text-center space-y-1">
          <p className="text-sm font-medium text-red-500">Failed to generate transcript</p>
          <p className="text-xs text-muted-foreground">{error.message}</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => reset()}>
          Try Again
        </Button>
      </div>
    );
  }

  if (!data) return null;

  // Display the accurate transcript
  return (
    <div className="space-y-4">
      {/* Accuracy Score Header */}
      <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-muted-foreground">Accuracy</span>
          <span className={cn(
            "text-lg font-bold",
            data.accuracy_score >= 0.9 ? "text-emerald-600" :
            data.accuracy_score >= 0.7 ? "text-yellow-600" :
            "text-red-600"
          )}>
            {Math.round(data.accuracy_score * 100)}%
          </span>
        </div>
        <Separator orientation="vertical" className="h-6" />
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span>{data.corrected_utterances}/{data.total_utterances} corrected</span>
        </div>
        {data.major_corrections.length > 0 && (
          <>
            <Separator orientation="vertical" className="h-6" />
            <span className="text-xs text-red-500 font-medium">
              {data.major_corrections.length} major {data.major_corrections.length === 1 ? 'correction' : 'corrections'}
            </span>
          </>
        )}
      </div>

      {/* Correction Categories */}
      {data.corrected_utterances > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {data.correction_categories.name_corrections > 0 && (
            <Badge variant="outline" className="text-xs bg-red-500/5 text-red-600 border-red-200">
              Names: {data.correction_categories.name_corrections}
            </Badge>
          )}
          {data.correction_categories.data_corrections > 0 && (
            <Badge variant="outline" className="text-xs bg-orange-500/5 text-orange-600 border-orange-200">
              Data: {data.correction_categories.data_corrections}
            </Badge>
          )}
          {data.correction_categories.number_corrections > 0 && (
            <Badge variant="outline" className="text-xs bg-purple-500/5 text-purple-600 border-purple-200">
              Numbers: {data.correction_categories.number_corrections}
            </Badge>
          )}
          {data.correction_categories.missing_speech > 0 && (
            <Badge variant="outline" className="text-xs bg-blue-500/5 text-blue-600 border-blue-200">
              Missing: {data.correction_categories.missing_speech}
            </Badge>
          )}
          {data.correction_categories.word_corrections > 0 && (
            <Badge variant="outline" className="text-xs bg-yellow-500/5 text-yellow-600 border-yellow-200">
              Words: {data.correction_categories.word_corrections}
            </Badge>
          )}
          {data.correction_categories.filler_omissions > 0 && (
            <Badge variant="outline" className="text-xs bg-gray-500/5 text-gray-600 border-gray-200">
              Fillers: {data.correction_categories.filler_omissions}
            </Badge>
          )}
        </div>
      )}

      {/* Transcript Messages */}
      <div className="space-y-3">
        {data.accurate_transcript.map((utterance, idx) => (
          <AccurateTranscriptBubble key={idx} utterance={utterance} />
        ))}
      </div>
    </div>
  );
}

/**
 * Full-height transcript section for the right panel
 */
function TranscriptSection({
  callId,
  recordingUrl,
  firmName,
  transcription,
  webhooks,
  webhooksLoading,
  errorMetrics,
  errorMetricsLoading,
}: {
  callId: number | string;
  recordingUrl: string | null;
  firmName: string | null;
  transcription: string | null;
  webhooks: Webhook[];
  webhooksLoading: boolean;
  errorMetrics?: Array<{ name: string; score: number; explanation: string }>;
  errorMetricsLoading?: boolean;
}) {
  const [mode, setMode] = useState<'basic' | 'advanced' | 'errors' | 'accurate'>('advanced');
  const accurateTranscript = useAccurateTranscript();

  const extractedData = useMemo(() => {
    if (webhooksLoading) return null;
    return extractWebhookMessages(webhooks);
  }, [webhooks, webhooksLoading]);

  const endOfCallWebhook = webhooks.find(w => w.webhook_type === 'end-of-call-report');
  const endOfCallPayload = endOfCallWebhook?.payload || null;

  const hasAdvancedData = extractedData !== null && extractedData.messages.length > 0;
  const hasErrorMetrics = errorMetrics && errorMetrics.length > 0;
  const showAdvanced = mode === 'advanced' && hasAdvancedData;
  const showErrors = mode === 'errors';

  if (!transcription && !hasAdvancedData) {
    return (
      <Card className="h-full flex items-center justify-center">
        <EmptyState
          icon={<FileText className="h-6 w-6 text-muted-foreground" />}
          message="No transcript available for this call"
        />
      </Card>
    );
  }

  return (
    <Card className="h-full flex flex-col">
      <CardHeader className="pb-2 shrink-0">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm flex items-center gap-2">
            <FileText className="h-4 w-4" />
            Transcript
          </CardTitle>
          <div className="inline-flex items-center rounded-lg border bg-muted p-0.5">
            <button
              onClick={() => setMode('basic')}
              className={cn(
                "px-3 py-1 text-xs font-medium rounded-md transition-colors",
                mode === 'basic'
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              Basic
            </button>
            {hasAdvancedData && (
              <button
                onClick={() => setMode('advanced')}
                className={cn(
                  "px-3 py-1 text-xs font-medium rounded-md transition-colors",
                  mode === 'advanced'
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                Advanced
              </button>
            )}
            {(hasErrorMetrics || errorMetricsLoading) && (
              <button
                onClick={() => setMode('errors')}
                className={cn(
                  "px-3 py-1 text-xs font-medium rounded-md transition-colors flex items-center gap-1",
                  mode === 'errors'
                    ? "bg-red-500/10 text-red-600 dark:text-red-400 shadow-sm"
                    : "text-red-500/70 hover:text-red-500"
                )}
              >
                <AlertTriangle className="h-3 w-3" />
                Errors
              </button>
            )}
            <button
              onClick={() => setMode('accurate')}
              className={cn(
                "px-3 py-1 text-xs font-medium rounded-md transition-colors flex items-center gap-1",
                mode === 'accurate'
                  ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 shadow-sm"
                  : "text-emerald-500/70 hover:text-emerald-500"
              )}
            >
              <Sparkles className="h-3 w-3" />
              Accurate
            </button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="flex-1 min-h-0 overflow-y-auto pt-0">
        {webhooksLoading && mode === 'advanced' ? (
          <div className="flex items-center justify-center py-4">
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground mr-2" />
            <span className="text-sm text-muted-foreground">Loading advanced transcript...</span>
          </div>
        ) : mode === 'accurate' ? (
          <AccurateTranscriptView
            onGenerate={() => {
              if (recordingUrl && endOfCallPayload) {
                accurateTranscript.mutate({
                  callId,
                  recordingUrl,
                  webhookPayload: endOfCallPayload,
                  firmName: firmName || undefined,
                });
              }
            }}
            canGenerate={!!recordingUrl && !!endOfCallPayload}
            data={accurateTranscript.data}
            isPending={accurateTranscript.isPending}
            error={accurateTranscript.error}
            reset={accurateTranscript.reset}
          />
        ) : showErrors ? (
          <TranscriptErrorsView
            errorMetrics={errorMetrics || []}
            isLoading={errorMetricsLoading}
          />
        ) : (
          <div className="space-y-3">
            {showAdvanced ? (
              <AdvancedTranscript
                messages={extractedData!.messages}
                transfers={extractedData!.transfers}
                endedReason={extractedData!.endedReason}
              />
            ) : transcription ? (
              parseTranscript(transcription).map((msg, idx) => (
                <TranscriptBubble key={idx} message={msg} />
              ))
            ) : (
              <p className="text-sm text-muted-foreground text-center py-4">
                No basic transcript available. Switch to Advanced to view tool calls.
              </p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/**
 * Parse transcription error explanation and display in git diff style
 */
function HighlightedExplanation({ text }: { text: string }) {
  // Handle null/undefined text
  if (!text || typeof text !== 'string') {
    return <span className="text-sm text-muted-foreground">{String(text || '')}</span>;
  }

  // Pattern to match: "the/an [LABEL] says/said/played "VALUE"" or 'VALUE'
  // Labels can be: "transcript", "Main Agent", "Testing Agent", "automated message", etc.
  // Handles both double quotes "..." and single quotes '...'
  const labelValuePattern = /(?:the\s+|an\s+)?([A-Za-z][A-Za-z\s]*?)\s+(?:says|said|played)\s+["']([^"']+)["']/gi;

  // Find all matches in the entire text
  const allMatches: Array<{ label: string; value: string; index: number }> = [];
  let match;
  while ((match = labelValuePattern.exec(text)) !== null) {
    allMatches.push({
      label: match[1].trim(),
      value: match[2],
      index: match.index,
    });
  }

  if (allMatches.length === 0) {
    // No patterns found, just render as plain text
    return <p className="text-sm text-muted-foreground">{text}</p>;
  }

  // Group matches by splitting on sentence terminators (. followed by space and capital or end)
  // We'll group consecutive matches that appear before a major sentence break
  const groups: Array<Array<{ label: string; value: string }>> = [];
  let currentGroup: Array<{ label: string; value: string }> = [];

  // Find positions of sentence breaks in the text
  const sentenceBreaks: number[] = [];
  const breakPattern = /\.\s+(?=[A-Z])/g;
  let breakMatch;
  while ((breakMatch = breakPattern.exec(text)) !== null) {
    sentenceBreaks.push(breakMatch.index);
  }

  allMatches.forEach((item, idx) => {
    currentGroup.push({ label: item.label, value: item.value });

    // Check if there's a sentence break between this match and the next
    const nextMatch = allMatches[idx + 1];
    if (nextMatch) {
      const hasBreakBetween = sentenceBreaks.some(
        (breakPos) => breakPos > item.index && breakPos < nextMatch.index
      );
      if (hasBreakBetween) {
        groups.push(currentGroup);
        currentGroup = [];
      }
    }
  });

  // Don't forget the last group
  if (currentGroup.length > 0) {
    groups.push(currentGroup);
  }

  // Extract any prefix text before the first match
  const firstMatchIndex = allMatches[0].index;
  const prefixText = text.slice(0, firstMatchIndex).trim();

  return (
    <div className="space-y-2">
      {/* Show prefix text if any (like "Transcription errors are:") */}
      {prefixText && (
        <p className="text-sm text-muted-foreground">{prefixText}</p>
      )}

      {/* Render each group as a diff block */}
      {groups.map((group, groupIndex) => (
        <div
          key={`diff-${groupIndex}`}
          className="rounded-md border border-border/50 overflow-hidden text-xs font-mono"
        >
          {group.map((item, idx) => {
            // "transcript" gets red styling (the erroneous version), others get green
            const isTranscript = item.label.toLowerCase() === 'transcript';

            return (
              <div
                key={idx}
                className={`flex items-start gap-3 px-3 py-2 ${
                  isTranscript
                    ? 'bg-red-500/5 border-l-2 border-red-400/50'
                    : 'bg-green-500/5 border-l-2 border-green-400/50'
                }`}
              >
                <span
                  className={`select-none shrink-0 min-w-[100px] text-[10px] uppercase tracking-wide ${
                    isTranscript ? 'text-red-400/80' : 'text-green-400/80'
                  }`}
                >
                  {item.label}
                </span>
                <span
                  className={`flex-1 ${
                    isTranscript
                      ? 'text-red-700 dark:text-red-300/90'
                      : 'text-green-700 dark:text-green-300/90'
                  }`}
                >
                  {item.value}
                </span>
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}

/**
 * Errors view for transcript panel - displays transcription accuracy issues
 */
function TranscriptErrorsView({
  errorMetrics,
  isLoading,
}: {
  errorMetrics: Array<{ name: string; score: number; explanation: string }>;
  isLoading?: boolean;
}) {
  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground mr-2" />
        <span className="text-sm text-muted-foreground">Loading error analysis...</span>
      </div>
    );
  }

  if (!errorMetrics || errorMetrics.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-8 text-center">
        <div className="p-3 bg-green-500/10 rounded-full mb-3">
          <CheckCircle className="h-6 w-6 text-green-500" />
        </div>
        <p className="text-sm font-medium text-green-600 dark:text-green-400">No Transcription Errors</p>
        <p className="text-xs text-muted-foreground mt-1">The transcription appears to be accurate</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 px-1 py-1 text-xs font-semibold text-red-600 dark:text-red-400 uppercase tracking-wide">
        <AlertTriangle className="h-3.5 w-3.5" />
        Transcription Issues
      </div>
      {errorMetrics.map((metric, index) => (
        <div
          key={`error-${metric.name}-${index}`}
          className="p-4 rounded-lg bg-red-500/5 border border-red-500/20"
        >
          <div className="flex items-center gap-2 mb-2">
            <AlertCircle className="h-4 w-4 text-red-500 shrink-0" />
            <span className="text-sm font-medium text-red-700 dark:text-red-300">
              {metric.name}
            </span>
          </div>
          {metric.explanation && (
            <div className="text-sm text-muted-foreground leading-relaxed pl-6">
              <HighlightedExplanation text={metric.explanation} />
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

/**
 * @deprecated Use CallDetailLeftPanel and CallDetailRightPanel for two-panel layout
 */
export function CallDetailPanel({ callId, highlightReasons, dateRange }: CallDetailPanelProps) {
  const { data, isLoading, error } = useCallDetail(callId);
  const { environment } = useEnvironment();
  const platformCallId = data?.call?.platform_call_id;

  // Map dashboard environment to Sentry environment for URL
  const sentryEnv = SENTRY_ENV_MAP[environment] || environment;

  // Fetch Cekura call data for the date range (progressive loading)
  const { data: cekuraData, isLoading: cekuraLoading, isFullyLoaded: cekuraFullyLoaded } = useCekuraCallMapping(
    dateRange?.startDate || null,
    dateRange?.endDate || null
  );
  const cekuraCallInfo = platformCallId ? cekuraData?.calls.get(platformCallId) : undefined;
  const cekuraCallId = cekuraCallInfo?.cekuraId;

  // Track which callId has been acknowledged for each tab (avoids useEffect reset)
  const [logsAcknowledgedFor, setLogsAcknowledgedFor] = useState<number | string | null>(null);
  const [activityAcknowledgedFor, setActivityAcknowledgedFor] = useState<number | string | null>(null);

  // Derive acknowledged state by comparing against current callId
  const logsAcknowledged = logsAcknowledgedFor === callId;
  const activityAcknowledged = activityAcknowledgedFor === callId;

  // Fetch webhooks and sentry events in parallel once we have platformCallId
  const { data: webhooks, isLoading: webhooksLoading } = useWebhooksForCall(platformCallId || null);
  const { data: sentryData, isLoading: sentryLoading } = useSentryEventsForCall(platformCallId || null);

  // Extract transfer data from webhooks
  const webhookData = useMemo(() => {
    if (webhooksLoading || !webhooks?.length) return null;
    return extractWebhookMessages(webhooks);
  }, [webhooks, webhooksLoading]);

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-20" />
        <Skeleton className="h-40" />
        <Skeleton className="h-40" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="flex flex-col items-center justify-center py-12">
        <div className="p-3 bg-red-500/10 rounded-full mb-3">
          <XCircle className="h-6 w-6 text-red-500" />
        </div>
        <p className="text-red-500 font-medium">Failed to load call details</p>
        <p className="text-sm text-muted-foreground mt-1">Please try again later</p>
      </div>
    );
  }

  const { call, transfers, emails } = data;
  const webhooksList = webhooks || [];
  const sentryEvents = sentryData?.events || [];

  const activityCount = transfers.length + emails.length + webhooksList.length;
  const hasErrors = sentryEvents.some(e => e.level === 'error');

  return (
    <div className="space-y-4">
      {/* Quick Links */}
      <div className="flex items-center gap-2 flex-wrap">
        {call.platform_call_id && (
          <Button variant="outline" size="sm" asChild>
            <a
              href={`https://dashboard.vapi.ai/calls/${call.platform_call_id}`}
              target="_blank"
              rel="noopener noreferrer"
            >
              <ExternalLink className="h-3.5 w-3.5 mr-1.5" />
              VAPI Dashboard
            </a>
          </Button>
        )}
        {call.platform_call_id && (
          <Button variant="outline" size="sm" asChild>
            <a
              href={`https://helloounsil.sentry.io/explore/logs/?environment=${sentryEnv}&logsFields=timestamp&logsFields=correlation_id&logsFields=message&logsQuery=correlation_id%3A${call.platform_call_id}&logsSortBys=-timestamp`}
              target="_blank"
              rel="noopener noreferrer"
            >
              <Bug className="h-3.5 w-3.5 mr-1.5" />
              Sentry Logs
            </a>
          </Button>
        )}
        {call.platform_call_id && (
          cekuraCallId ? (
            <Button variant="outline" size="sm" asChild>
              <a
                href={buildCekuraUrl(cekuraCallId, environment)}
                target="_blank"
                rel="noopener noreferrer"
              >
                <BarChart3 className="h-3.5 w-3.5 mr-1.5" />
                Cekura
              </a>
            </Button>
          ) : cekuraLoading || !cekuraFullyLoaded ? (
            <Button variant="outline" size="sm" disabled>
              <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
              Cekura
            </Button>
          ) : null
        )}
        {/* Cekura Status Selector */}
        {cekuraCallInfo?.status && cekuraCallId && platformCallId && (
          <CekuraStatusSelector
            status={cekuraCallInfo.status}
            cekuraId={cekuraCallId}
            correlationId={platformCallId}
          />
        )}
      </div>

      {/* Recording */}
      {call.recording_url && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Play className="h-4 w-4" />
              Recording
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <AudioPlayer src={call.recording_url} />
          </CardContent>
        </Card>
      )}

      {/* Tabs */}
      <Tabs
        defaultValue="overview"
        className="w-full"
        onValueChange={(value) => {
          if (value === 'logs') setLogsAcknowledgedFor(callId);
          if (value === 'activity') setActivityAcknowledgedFor(callId);
        }}
      >
        <TabsList className="w-full grid grid-cols-4">
          <TabsTrigger value="overview" className="text-xs">
            <ClipboardList className="h-3.5 w-3.5 mr-1" />
            Info
          </TabsTrigger>
          <TabsTrigger value="transcript" className="text-xs">
            <FileText className="h-3.5 w-3.5 mr-1" />
            Transcript
          </TabsTrigger>
          <TabsTrigger
            value="activity"
            className={cn(
              "text-xs",
              highlightReasons?.important && !activityAcknowledged && "animate-pulse-orange",
              highlightReasons?.transferMismatch && !activityAcknowledged && "animate-pulse-yellow"
            )}
          >
            <Activity className="h-3.5 w-3.5 mr-1" />
            Activity
            <SectionBadge count={activityCount} color="bg-primary/20 text-primary" isLoading={webhooksLoading} />
          </TabsTrigger>
          <TabsTrigger
            value="logs"
            className={cn(
              "text-xs",
              highlightReasons?.sentry && !logsAcknowledged && "animate-pulse-red"
            )}
          >
            <Bug className="h-3.5 w-3.5 mr-1" />
            Logs
            {sentryLoading ? (
              <span className="ml-1 inline-flex items-center justify-center">
                <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
              </span>
            ) : hasErrors ? (
              <span className="ml-1 w-2 h-2 bg-red-500 rounded-full" />
            ) : null}
          </TabsTrigger>
        </TabsList>

        {/* Overview Tab */}
        <TabsContent value="overview" className="mt-4 space-y-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Call Information</CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1">
                <InfoRow label="Caller" value={call.caller_name} icon={<User className="h-3.5 w-3.5" />} />
                <InfoRow label="Phone" value={call.phone_number} icon={<Phone className="h-3.5 w-3.5" />} />
                <InfoRow
                  label="Duration"
                  value={
                    <span className={cn(highlightReasons?.duration && "animate-pulse-orange-text")}>
                      {formatDuration(call.call_duration)}
                    </span>
                  }
                  icon={<Clock className="h-3.5 w-3.5" />}
                />
                <InfoRow label="Started" value={call.started_at} icon={<Calendar className="h-3.5 w-3.5" />} />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Status</CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              <div className="flex flex-wrap gap-2">
                <Badge variant="outline" className="px-2 py-1">
                  <Phone className="h-3 w-3 mr-1" />
                  {call.call_type || 'Unknown'}
                </Badge>
                <Badge variant={getStatusBadgeVariant(call.status)} className="px-2 py-1">
                  {call.status === 'completed' ? <CheckCircle className="h-3 w-3 mr-1" /> : <Activity className="h-3 w-3 mr-1" />}
                  {call.status}
                </Badge>
                {call.platform && (
                  <Badge variant="secondary" className="px-2 py-1">
                    {call.platform}
                  </Badge>
                )}
              </div>
            </CardContent>
          </Card>

          {call.summary && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Summary</CardTitle>
              </CardHeader>
              <CardContent className="pt-0">
                <p className="text-sm text-muted-foreground leading-relaxed">{call.summary}</p>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* Transcript Tab */}
        <TabsContent value="transcript" className="mt-4">
          <TranscriptTabContent
            transcription={call.transcription}
            webhooks={webhooksList}
            webhooksLoading={webhooksLoading}
          />
        </TabsContent>

        {/* Activity Tab */}
        <TabsContent value="activity" className="mt-4 space-y-4">
          {/* Transfers */}
          <div>
            <div className="flex items-center gap-2 mb-2">
              <ArrowLeftRight className="h-4 w-4 text-orange-500" />
              <h4 className="text-sm font-medium">Transfers</h4>
              <Badge variant="secondary" className="text-xs">{transfers.length}</Badge>
            </div>
            {transfers.length > 0 ? (
              <div className="space-y-2">
                {transfers.map((t, index) => {
                  // Try to match webhook transfer by phone number or by index
                  const webhookTransfers = webhookData?.transfers || [];
                  const matchedWebhookTransfer = webhookTransfers.find(
                    (wt: TransferAttempt) => wt.destination?.number?.replace(/\D/g, '').slice(-10) === t.transferred_to_phone_number?.replace(/\D/g, '').slice(-10)
                  ) || webhookTransfers[index];
                  return (
                    <TransferItem
                      key={t.id}
                      transfer={t}
                      highlight={highlightReasons?.transferMismatch}
                      transcript={matchedWebhookTransfer?.transcript}
                    />
                  );
                })}
              </div>
            ) : (
              <Card>
                <CardContent className="py-6">
                  <p className="text-sm text-muted-foreground text-center">No transfers for this call</p>
                </CardContent>
              </Card>
            )}
          </div>

          <Separator />

          {/* Emails */}
          <div>
            <div className="flex items-center gap-2 mb-2">
              <Mail className="h-4 w-4 text-green-500" />
              <h4 className="text-sm font-medium">Emails</h4>
              <Badge variant="secondary" className="text-xs">{emails.length}</Badge>
            </div>
            {emails.length > 0 ? (
              <div className="space-y-2">
                {emails.map((e) => (
                  <EmailItem key={e.id} email={e} highlight={highlightReasons?.transferMismatch} />
                ))}
              </div>
            ) : (
              <Card>
                <CardContent className="py-6">
                  <p className="text-sm text-muted-foreground text-center">No emails for this call</p>
                </CardContent>
              </Card>
            )}
          </div>

          <Separator />

          {/* Webhooks */}
          <div>
            <div className="flex items-center gap-2 mb-2">
              <WebhookIcon className="h-4 w-4 text-purple-500" />
              <h4 className="text-sm font-medium">Webhooks</h4>
              <Badge variant="secondary" className="text-xs">
                {webhooksLoading ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  webhooksList.length
                )}
              </Badge>
            </div>
            {webhooksLoading ? (
              <div className="space-y-2">
                <Skeleton className="h-16" />
                <Skeleton className="h-16" />
              </div>
            ) : webhooksList.length > 0 ? (
              <div className="space-y-2">
                {webhooksList.map((w) => (
                  <WebhookItem
                    key={w.id}
                    webhook={w}
                    callerName={call.caller_name}
                    dbTransfers={transfers}
                    highlight={highlightReasons?.transferMismatch}
                  />
                ))}
              </div>
            ) : (
              <Card>
                <CardContent className="py-6">
                  <p className="text-sm text-muted-foreground text-center">No webhooks for this call</p>
                </CardContent>
              </Card>
            )}
          </div>
        </TabsContent>

        {/* Logs Tab */}
        <TabsContent value="logs" className="mt-4">
          {!call.platform_call_id ? (
            <EmptyState
              icon={<Bug className="h-6 w-6 text-muted-foreground" />}
              message="No Correlation ID - cannot fetch Sentry logs"
            />
          ) : sentryLoading ? (
            <div className="space-y-2">
              <Skeleton className="h-16" />
              <Skeleton className="h-16" />
              <Skeleton className="h-16" />
            </div>
          ) : sentryEvents.length > 0 ? (
            <div className="space-y-2">
              {sentryEvents.map((e) => (
                <SentryEventItem key={e.event_id} event={e} />
              ))}
            </div>
          ) : (
            <EmptyState
              icon={<CheckCircle className="h-6 w-6 text-green-500" />}
              message="No logs found for this call"
            />
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
