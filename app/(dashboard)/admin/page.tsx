'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { Settings, Save, Loader2, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Separator } from '@/components/ui/separator';
import { PageTogglesEditor } from '@/components/admin/page-toggles';
import { ColumnTogglesEditor } from '@/components/admin/column-toggles';
import { FeatureTogglesEditor } from '@/components/admin/feature-toggles';
import { BrandingEditor } from '@/components/admin/branding-editor';
import { UserFirmMappings } from '@/components/admin/user-firm-mappings';
import { AdminDomainEditor } from '@/components/admin/admin-domain-editor';
import { useFirms } from '@/hooks/use-firms';
import type {
  ClientConfig,
  FirmConfig,
  PageToggles,
  ColumnToggles,
  FeatureToggles,
  FirmBranding,
} from '@/types/client-config';

export default function AdminPage() {
  const [fullConfig, setFullConfig] = useState<ClientConfig | null>(null);
  const [selectedFirmId, setSelectedFirmId] = useState<number | null>(null);
  const [editingConfig, setEditingConfig] = useState<FirmConfig | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const { data: firmsData } = useFirms();
  const firms = useMemo(() => firmsData?.firms ?? [], [firmsData]);

  // Load full config
  const loadConfig = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/config');
      if (res.ok) {
        const data = await res.json();
        setFullConfig(data);
      }
    } catch (error) {
      console.error('Failed to load config:', error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadConfig();
  }, [loadConfig]);

  // When firm selection changes, load that firm's config (or create from defaults)
  useEffect(() => {
    if (!fullConfig) return;

    if (selectedFirmId === null) {
      setEditingConfig(null);
      return;
    }

    const existing = fullConfig.firms[selectedFirmId];
    if (existing) {
      setEditingConfig(existing);
    } else {
      // Create new config from defaults for this firm
      const firm = firms.find((f) => f.id === selectedFirmId);
      setEditingConfig({
        firmId: selectedFirmId,
        firmName: firm?.name || `Firm ${selectedFirmId}`,
        pages: { ...fullConfig.defaults.pages },
        columns: {
          calls: { ...fullConfig.defaults.columns.calls },
          emails: { ...fullConfig.defaults.columns.emails },
          transfers: { ...fullConfig.defaults.columns.transfers },
          webhooks: { ...fullConfig.defaults.columns.webhooks },
          sentry: { ...fullConfig.defaults.columns.sentry },
        },
        features: { ...fullConfig.defaults.features },
        branding: { ...fullConfig.defaults.branding },
      });
    }
  }, [selectedFirmId, fullConfig, firms]);

  const saveFirmConfig = async () => {
    if (!editingConfig || selectedFirmId === null) return;

    setIsSaving(true);
    setSaveMessage(null);

    try {
      const res = await fetch(`/api/admin/config/${selectedFirmId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editingConfig),
      });

      if (res.ok) {
        setSaveMessage('Saved successfully');
        await loadConfig(); // Refresh
      } else {
        setSaveMessage('Failed to save');
      }
    } catch {
      setSaveMessage('Failed to save');
    } finally {
      setIsSaving(false);
      setTimeout(() => setSaveMessage(null), 2000);
    }
  };

  const deleteFirmConfig = async () => {
    if (selectedFirmId === null) return;

    setIsSaving(true);
    try {
      await fetch(`/api/admin/config/${selectedFirmId}`, { method: 'DELETE' });
      setSelectedFirmId(null);
      setEditingConfig(null);
      await loadConfig();
    } catch {
      setSaveMessage('Failed to delete');
    } finally {
      setIsSaving(false);
    }
  };

  const saveGlobalConfig = async (updates: Partial<ClientConfig>) => {
    setIsSaving(true);
    setSaveMessage(null);

    try {
      const res = await fetch('/api/admin/config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      });

      if (res.ok) {
        setSaveMessage('Saved successfully');
        await loadConfig();
      } else {
        setSaveMessage('Failed to save');
      }
    } catch {
      setSaveMessage('Failed to save');
    } finally {
      setIsSaving(false);
      setTimeout(() => setSaveMessage(null), 2000);
    }
  };

  const updatePages = (pages: PageToggles) => {
    if (!editingConfig) return;
    setEditingConfig({ ...editingConfig, pages });
  };

  const updateColumns = (columns: ColumnToggles) => {
    if (!editingConfig) return;
    setEditingConfig({ ...editingConfig, columns });
  };

  const updateFeatures = (features: FeatureToggles) => {
    if (!editingConfig) return;
    setEditingConfig({ ...editingConfig, features });
  };

  const updateBranding = (branding: FirmBranding) => {
    if (!editingConfig) return;
    setEditingConfig({ ...editingConfig, branding });
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Settings className="h-6 w-6" />
            Admin Panel
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Configure per-firm settings, features, and branding
          </p>
        </div>
        {saveMessage && (
          <span className="text-sm text-muted-foreground">{saveMessage}</span>
        )}
      </div>

      <Separator />

      {/* Tabs for Firm Config vs Global Settings */}
      <Tabs defaultValue="firm">
        <TabsList>
          <TabsTrigger value="firm">Firm Configuration</TabsTrigger>
          <TabsTrigger value="global">Global Settings</TabsTrigger>
        </TabsList>

        {/* Firm Configuration Tab */}
        <TabsContent value="firm" className="space-y-4 mt-4">
          {/* Firm Selector */}
          <div className="flex items-center gap-3">
            <Select
              value={selectedFirmId !== null ? String(selectedFirmId) : 'none'}
              onValueChange={(v) =>
                setSelectedFirmId(v === 'none' ? null : parseInt(v))
              }
            >
              <SelectTrigger className="w-[300px]">
                <SelectValue placeholder="Select a firm to configure" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Select a firm...</SelectItem>
                {firms
                  .slice()
                  .sort((a, b) => a.id - b.id)
                  .map((firm) => (
                    <SelectItem key={firm.id} value={String(firm.id)}>
                      {firm.name} (#{firm.id})
                      {fullConfig?.firms[firm.id] ? ' *' : ''}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>

            {editingConfig && (
              <div className="flex items-center gap-2">
                <Button onClick={saveFirmConfig} disabled={isSaving}>
                  {isSaving ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <Save className="h-4 w-4 mr-2" />
                  )}
                  Save
                </Button>
                {fullConfig?.firms[selectedFirmId!] && (
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={deleteFirmConfig}
                    disabled={isSaving}
                  >
                    <Trash2 className="h-4 w-4 mr-1" />
                    Remove
                  </Button>
                )}
              </div>
            )}
          </div>

          {!editingConfig && (
            <Card>
              <CardContent className="p-8 text-center text-muted-foreground">
                Select a firm above to configure its dashboard settings.
                Firms marked with * have existing custom configurations.
              </CardContent>
            </Card>
          )}

          {editingConfig && (
            <Tabs defaultValue="pages">
              <TabsList className="grid grid-cols-4 w-full max-w-lg">
                <TabsTrigger value="pages">Pages</TabsTrigger>
                <TabsTrigger value="columns">Columns</TabsTrigger>
                <TabsTrigger value="features">Features</TabsTrigger>
                <TabsTrigger value="branding">Branding</TabsTrigger>
              </TabsList>

              <TabsContent value="pages" className="mt-4">
                <PageTogglesEditor
                  pages={editingConfig.pages}
                  onChange={updatePages}
                />
              </TabsContent>

              <TabsContent value="columns" className="mt-4">
                <ColumnTogglesEditor
                  columns={editingConfig.columns}
                  onChange={updateColumns}
                />
              </TabsContent>

              <TabsContent value="features" className="mt-4">
                <FeatureTogglesEditor
                  features={editingConfig.features}
                  onChange={updateFeatures}
                />
              </TabsContent>

              <TabsContent value="branding" className="mt-4">
                <BrandingEditor
                  branding={editingConfig.branding}
                  onChange={updateBranding}
                />
              </TabsContent>
            </Tabs>
          )}
        </TabsContent>

        {/* Global Settings Tab */}
        <TabsContent value="global" className="space-y-6 mt-4">
          {fullConfig && (
            <>
              <UserFirmMappings
                mappings={fullConfig.userFirmMappings}
                firms={firms}
                onSave={(mappings) =>
                  saveGlobalConfig({ userFirmMappings: mappings })
                }
                isSaving={isSaving}
              />

              <AdminDomainEditor
                domains={fullConfig.adminDomains}
                onSave={(domains) =>
                  saveGlobalConfig({ adminDomains: domains })
                }
                isSaving={isSaving}
              />
            </>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
