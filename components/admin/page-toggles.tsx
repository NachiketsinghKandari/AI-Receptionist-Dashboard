'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import {
  Phone,
  FileText,
  Mail,
  ArrowLeftRight,
  Bug,
  Webhook,
} from 'lucide-react';
import type { PageToggles } from '@/types/client-config';

const PAGE_ITEMS: {
  key: keyof PageToggles;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  description: string;
}[] = [
  { key: 'calls', label: 'Calls', icon: Phone, description: 'Call records, summaries, and transcripts' },
  { key: 'reports', label: 'Reports', icon: FileText, description: 'End-of-day and weekly reports' },
  { key: 'emails', label: 'Emails', icon: Mail, description: 'Email logs and monitoring' },
  { key: 'transfers', label: 'Transfers', icon: ArrowLeftRight, description: 'Transfer tracking' },
  { key: 'sentry', label: 'Sentry', icon: Bug, description: 'Sentry events and error logs' },
  { key: 'webhooks', label: 'Webhooks', icon: Webhook, description: 'Webhook payload inspection' },
];

interface PageTogglesEditorProps {
  pages: PageToggles;
  onChange: (pages: PageToggles) => void;
}

export function PageTogglesEditor({ pages, onChange }: PageTogglesEditorProps) {
  const toggle = (key: keyof PageToggles) => {
    onChange({ ...pages, [key]: !pages[key] });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Page Visibility</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {PAGE_ITEMS.map(({ key, label, icon: Icon, description }) => (
          <div key={key} className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Icon className="h-4 w-4 text-muted-foreground" />
              <div>
                <Label className="text-sm font-medium">{label}</Label>
                <p className="text-xs text-muted-foreground">{description}</p>
              </div>
            </div>
            <Switch checked={pages[key]} onCheckedChange={() => toggle(key)} />
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
