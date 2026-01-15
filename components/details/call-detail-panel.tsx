'use client';

import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { CopyButton } from '@/components/ui/copy-button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Separator } from '@/components/ui/separator';
import { useCallDetail } from '@/hooks/use-calls';
import { useWebhooksForCall } from '@/hooks/use-webhooks';
import { useSentryEventsForCall } from '@/hooks/use-sentry-events';
import { formatDuration } from '@/lib/formatting';
import type { Transfer, Email, Webhook, SentryEvent } from '@/types/database';
import {
  ChevronDown,
  Phone,
  ArrowLeftRight,
  Mail,
  Webhook as WebhookIcon,
  ExternalLink,
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
} from 'lucide-react';
import { useState, useMemo } from 'react';
import { parseWebhookPayload } from '@/lib/webhook-utils';
import { EmailBodyDisplay } from '@/components/email/email-body-display';
import { RecipientsDisplay } from '@/components/email/recipients-display';
import { JsonViewer } from '@/components/ui/json-viewer';

interface CallDetailPanelProps {
  callId: number;
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

function TransferItem({ transfer }: { transfer: Transfer }) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <Card className="overflow-hidden">
      <Collapsible open={isOpen} onOpenChange={setIsOpen}>
        <CollapsibleTrigger asChild>
          <CardHeader className="p-3 cursor-pointer hover:bg-muted/50 transition-colors">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <div className="p-1.5 bg-orange-500/10 rounded">
                  <ArrowLeftRight className="h-3.5 w-3.5 text-orange-500" />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">{transfer.transferred_to_name}</p>
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
            <div className="grid grid-cols-2 gap-2 text-sm pt-3">
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
          </CardContent>
        </CollapsibleContent>
      </Collapsible>
    </Card>
  );
}

function EmailItem({ email }: { email: Email }) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <Card className="overflow-hidden">
      <Collapsible open={isOpen} onOpenChange={setIsOpen}>
        <CollapsibleTrigger asChild>
          <CardHeader className="p-3 cursor-pointer hover:bg-muted/50 transition-colors">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <div className="p-1.5 bg-green-500/10 rounded">
                  <Mail className="h-3.5 w-3.5 text-green-500" />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">{email.subject?.slice(0, 40)}</p>
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
            <div className="grid grid-cols-2 gap-2 text-sm pt-3">
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


function WebhookItem({ webhook }: { webhook: Webhook }) {
  const [isOpen, setIsOpen] = useState(false);

  // Memoize the expensive payload parsing
  const parsedPayload = useMemo(
    () => parseWebhookPayload(webhook.payload),
    [webhook.payload]
  );

  return (
    <Card className="overflow-hidden">
      <Collapsible open={isOpen} onOpenChange={setIsOpen}>
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
          <CardContent className="p-3 pt-0 border-t bg-muted/30">
            <div className="grid grid-cols-2 gap-2 text-sm pt-3">
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

            <div className="mt-3 space-y-2">
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

              {parsedPayload.transfers && parsedPayload.transfers.length > 0 && (
                <details className="group rounded-lg border border-border overflow-hidden">
                  <summary className="flex items-center justify-between gap-2 p-2 bg-muted/50 hover:bg-muted cursor-pointer list-none">
                    <span className="flex items-center gap-2 font-medium text-xs">
                      <ArrowLeftRight className="h-3.5 w-3.5" />
                      Transfers ({parsedPayload.transfers.length})
                    </span>
                    <div className="flex items-center gap-1">
                      <CopyButton value={JSON.stringify(parsedPayload.transfers, null, 2)} />
                      <ChevronDown className="h-3.5 w-3.5 transition-transform group-open:rotate-180" />
                    </div>
                  </summary>
                  <div className="p-2 bg-background border-t space-y-1.5">
                    {parsedPayload.transfers.map((transfer) => (
                      <div key={transfer.toolCallId} className="p-1.5 bg-muted/50 rounded border text-xs">
                        <div className="flex items-center justify-between">
                          <span className="font-medium">
                            {transfer.callerName} → {transfer.staffName}
                          </span>
                          <Badge variant={transfer.result.toLowerCase().includes('cancelled') ? 'destructive' : 'default'} className="text-[10px] px-1.5 py-0">
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
                    <ChevronDown className="h-3.5 w-3.5 transition-transform group-open:rotate-180" />
                  </div>
                </summary>
                <div className="border-t">
                  <JsonViewer data={webhook.payload} className="max-h-60 rounded-none border-0" />
                </div>
              </details>
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
            <div className="grid grid-cols-2 gap-2 text-sm pt-3">
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
                      <div className="grid grid-cols-2 gap-2 mb-2">
                        <div><strong>Method:</strong> {event.request.method}</div>
                        <div><strong>URL:</strong> {event.request.url}</div>
                      </div>
                      {event.request.body && (
                        <pre className="mt-1 overflow-auto max-h-40">
                          {JSON.stringify(event.request.body, null, 2)}
                        </pre>
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

export function CallDetailPanel({ callId }: CallDetailPanelProps) {
  const { data, isLoading, error } = useCallDetail(callId);
  const platformCallId = data?.call?.platform_call_id;

  // Fetch webhooks and sentry events in parallel once we have platformCallId
  const { data: webhooks, isLoading: webhooksLoading } = useWebhooksForCall(platformCallId || null);
  const { data: sentryData, isLoading: sentryLoading } = useSentryEventsForCall(platformCallId || null);

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
              href={`https://helloounsil.sentry.io/explore/logs/?logsFields=timestamp&logsFields=correlation_id&logsFields=message&logsQuery=correlation_id%3A${call.platform_call_id}&logsSortBys=-timestamp`}
              target="_blank"
              rel="noopener noreferrer"
            >
              <Bug className="h-3.5 w-3.5 mr-1.5" />
              Sentry Logs
            </a>
          </Button>
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
            <audio controls src={call.recording_url} className="w-full" />
          </CardContent>
        </Card>
      )}

      {/* Tabs */}
      <Tabs defaultValue="overview" className="w-full">
        <TabsList className="w-full grid grid-cols-4">
          <TabsTrigger value="overview" className="text-xs">
            <ClipboardList className="h-3.5 w-3.5 mr-1" />
            Info
          </TabsTrigger>
          <TabsTrigger value="transcript" className="text-xs">
            <FileText className="h-3.5 w-3.5 mr-1" />
            Transcript
          </TabsTrigger>
          <TabsTrigger value="activity" className="text-xs">
            <Activity className="h-3.5 w-3.5 mr-1" />
            Activity
            <SectionBadge count={activityCount} color="bg-primary/20 text-primary" isLoading={webhooksLoading} />
          </TabsTrigger>
          <TabsTrigger value="logs" className="text-xs">
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
              <div className="grid grid-cols-2 gap-x-4 gap-y-1">
                <InfoRow label="Caller" value={call.caller_name} icon={<User className="h-3.5 w-3.5" />} />
                <InfoRow label="Phone" value={call.phone_number} icon={<Phone className="h-3.5 w-3.5" />} />
                <InfoRow label="Duration" value={formatDuration(call.call_duration)} icon={<Clock className="h-3.5 w-3.5" />} />
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
          {call.transcription ? (
            <Card>
              <CardContent className="p-4">
                <div className="space-y-3 max-h-[400px] overflow-auto">
                  {parseTranscript(call.transcription).map((msg, idx) => (
                    <TranscriptBubble key={idx} message={msg} />
                  ))}
                </div>
              </CardContent>
            </Card>
          ) : (
            <EmptyState
              icon={<FileText className="h-6 w-6 text-muted-foreground" />}
              message="No transcript available for this call"
            />
          )}
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
                {transfers.map((t) => (
                  <TransferItem key={t.id} transfer={t} />
                ))}
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
                  <EmailItem key={e.id} email={e} />
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
                  <WebhookItem key={w.id} webhook={w} />
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
              message="No errors or warnings logged for this call"
            />
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
