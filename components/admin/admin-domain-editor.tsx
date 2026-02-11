'use client';

import { useState } from 'react';
import { Plus, Trash2, Save, Loader2, Shield } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';

interface AdminDomainEditorProps {
  domains: string[];
  onSave: (domains: string[]) => Promise<void>;
  isSaving: boolean;
}

export function AdminDomainEditor({
  domains,
  onSave,
  isSaving,
}: AdminDomainEditorProps) {
  const [localDomains, setLocalDomains] = useState(domains);
  const [newDomain, setNewDomain] = useState('');

  const addDomain = () => {
    const domain = newDomain.trim().toLowerCase();
    if (!domain) return;
    if (localDomains.includes(domain)) return;
    setLocalDomains([...localDomains, domain]);
    setNewDomain('');
  };

  const removeDomain = (domain: string) => {
    setLocalDomains(localDomains.filter((d) => d !== domain));
  };

  const handleSave = () => {
    onSave(localDomains);
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-base flex items-center gap-2">
          <Shield className="h-4 w-4" />
          Admin Domains
        </CardTitle>
        <Button size="sm" onClick={handleSave} disabled={isSaving}>
          {isSaving ? (
            <Loader2 className="h-4 w-4 mr-1 animate-spin" />
          ) : (
            <Save className="h-4 w-4 mr-1" />
          )}
          Save
        </Button>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-xs text-muted-foreground">
          Users with email addresses matching these domains will have admin
          access to this panel.
        </p>

        {localDomains.map((domain) => (
          <div
            key={domain}
            className="flex items-center gap-2 p-2 bg-muted/50 rounded-md"
          >
            <span className="text-sm flex-1">@{domain}</span>
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={() => removeDomain(domain)}
              disabled={localDomains.length === 1}
            >
              <Trash2 className="h-3.5 w-3.5 text-destructive" />
            </Button>
          </div>
        ))}

        <div className="flex items-center gap-2">
          <Input
            placeholder="example.com"
            value={newDomain}
            onChange={(e) => setNewDomain(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && addDomain()}
          />
          <Button
            size="sm"
            variant="outline"
            onClick={addDomain}
            disabled={!newDomain.trim()}
          >
            <Plus className="h-4 w-4" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
