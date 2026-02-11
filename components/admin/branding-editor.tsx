'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import type { FirmBranding } from '@/types/client-config';

const COLOR_SECTIONS = [
  {
    title: 'Backgrounds & Text',
    fields: [
      { key: 'background', label: 'Background', hint: 'Page background' },
      { key: 'foreground', label: 'Text', hint: 'Primary text color' },
      { key: 'card', label: 'Card', hint: 'Card / panel background' },
      { key: 'card-foreground', label: 'Card Text', hint: 'Text inside cards' },
      { key: 'popover', label: 'Popover', hint: 'Dropdown / popover bg' },
      { key: 'popover-foreground', label: 'Popover Text', hint: 'Dropdown text' },
    ],
  },
  {
    title: 'Primary & Secondary',
    fields: [
      { key: 'primary', label: 'Primary', hint: 'CTA buttons, links' },
      { key: 'primary-foreground', label: 'Primary Text', hint: 'Text on primary' },
      { key: 'secondary', label: 'Secondary', hint: 'Secondary button bg' },
      { key: 'secondary-foreground', label: 'Secondary Text', hint: 'Text on secondary' },
    ],
  },
  {
    title: 'Muted & Accent',
    fields: [
      { key: 'muted', label: 'Muted', hint: 'Subtle backgrounds' },
      { key: 'muted-foreground', label: 'Muted Text', hint: 'De-emphasized text' },
      { key: 'accent', label: 'Accent', hint: 'Hover / highlight bg' },
      { key: 'accent-foreground', label: 'Accent Text', hint: 'Text on accent' },
    ],
  },
  {
    title: 'Table',
    fields: [
      { key: 'table-header', label: 'Header Bg', hint: 'Table header background' },
      { key: 'table-header-foreground', label: 'Header Text', hint: 'Table header text' },
    ],
  },
  {
    title: 'Borders & Inputs',
    fields: [
      { key: 'border', label: 'Border', hint: 'Default borders' },
      { key: 'input', label: 'Input Border', hint: 'Form input borders' },
      { key: 'ring', label: 'Focus Ring', hint: 'Focus outline color' },
      { key: 'destructive', label: 'Destructive', hint: 'Error / delete actions' },
    ],
  },
  {
    title: 'Sidebar',
    fields: [
      { key: 'sidebar', label: 'Sidebar', hint: 'Sidebar background' },
      { key: 'sidebar-foreground', label: 'Sidebar Text', hint: 'Sidebar text' },
      { key: 'sidebar-primary', label: 'Sidebar Primary', hint: 'Active item' },
      { key: 'sidebar-primary-foreground', label: 'Sidebar Primary Text', hint: 'Active item text' },
      { key: 'sidebar-accent', label: 'Sidebar Accent', hint: 'Hover background' },
      { key: 'sidebar-accent-foreground', label: 'Sidebar Accent Text', hint: 'Hover text' },
      { key: 'sidebar-border', label: 'Sidebar Border', hint: 'Sidebar borders' },
    ],
  },
  {
    title: 'Charts',
    fields: [
      { key: 'chart-1', label: 'Chart 1', hint: 'Primary data color' },
      { key: 'chart-2', label: 'Chart 2', hint: 'Secondary data color' },
      { key: 'chart-3', label: 'Chart 3', hint: 'Tertiary data color' },
      { key: 'chart-4', label: 'Chart 4', hint: 'Quaternary data color' },
      { key: 'chart-5', label: 'Chart 5', hint: 'Quinary data color' },
    ],
  },
];

interface BrandingEditorProps {
  branding: FirmBranding;
  onChange: (branding: FirmBranding) => void;
}

export function BrandingEditor({ branding, onChange }: BrandingEditorProps) {
  const theme = branding.theme ?? {};

  const updateThemeField = (key: string, value: string) => {
    const updated = { ...theme };
    if (value) {
      updated[key] = value;
    } else {
      delete updated[key];
    }
    onChange({
      ...branding,
      theme: Object.keys(updated).length > 0 ? updated : null,
    });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Branding & Theme</CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        {/* Identity */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <Label className="text-sm">Display Name</Label>
            <Input
              className="mt-1"
              placeholder="e.g., Smith & Associates"
              value={branding.displayName ?? ''}
              onChange={(e) =>
                onChange({ ...branding, displayName: e.target.value || null })
              }
            />
            <p className="text-xs text-muted-foreground mt-1">
              Replaces &quot;HelloCounsel&quot; in the navbar and page title
            </p>
          </div>
          <div>
            <Label className="text-sm">Logo URL</Label>
            <Input
              className="mt-1"
              placeholder="https://example.com/logo.svg"
              value={branding.logoUrl ?? ''}
              onChange={(e) =>
                onChange({ ...branding, logoUrl: e.target.value || null })
              }
            />
            {branding.logoUrl && (
              <div className="mt-2 p-2 bg-muted rounded-md inline-flex">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={branding.logoUrl} alt="Logo preview" className="h-8 w-auto" />
              </div>
            )}
          </div>
        </div>

        <Separator />

        {/* Radius */}
        <div>
          <Label className="text-sm font-semibold">Border Radius</Label>
          <p className="text-xs text-muted-foreground mt-1 mb-2">
            Controls corner roundness across the UI. Use 0 for sharp corners.
          </p>
          <div className="flex items-center gap-3">
            <Input
              className="w-40"
              placeholder="e.g., 0.625rem or 0"
              value={theme['radius'] ?? ''}
              onChange={(e) => updateThemeField('radius', e.target.value)}
            />
            <div className="flex gap-2">
              {['0', '0.25rem', '0.5rem', '0.625rem'].map((val) => (
                <button
                  key={val}
                  type="button"
                  onClick={() => updateThemeField('radius', val)}
                  className={`px-2 py-1 text-xs border rounded-sm transition-colors ${
                    theme['radius'] === val
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-muted hover:bg-accent'
                  }`}
                >
                  {val === '0' ? 'Sharp' : val}
                </button>
              ))}
            </div>
          </div>
        </div>

        <Separator />

        {/* Color sections */}
        <div>
          <Label className="text-sm font-semibold">Color Theme</Label>
          <p className="text-xs text-muted-foreground mt-1 mb-3">
            Non-admin users see this as a fixed theme (no dark/light toggle). OKLCH or hex values.
          </p>
        </div>

        {COLOR_SECTIONS.map((section) => (
          <div key={section.title}>
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">
              {section.title}
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-4 gap-y-2">
              {section.fields.map(({ key, label, hint }) => (
                <div key={key} className="flex items-center gap-2">
                  <div className="w-28 shrink-0">
                    <p className="text-sm leading-tight">{label}</p>
                    <p className="text-[10px] text-muted-foreground leading-tight">{hint}</p>
                  </div>
                  <Input
                    className="flex-1 text-xs"
                    placeholder={`--${key}`}
                    value={theme[key] ?? ''}
                    onChange={(e) => updateThemeField(key, e.target.value)}
                  />
                  {theme[key] && (
                    <div
                      className="h-6 w-6 rounded-sm border shrink-0"
                      style={{ backgroundColor: theme[key] }}
                    />
                  )}
                </div>
              ))}
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
