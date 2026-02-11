'use client';

import { useState } from 'react';
import { Plus, Trash2, Save, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import type { UserFirmMapping } from '@/types/client-config';
import type { Firm } from '@/types/database';

interface UserFirmMappingsProps {
  mappings: UserFirmMapping[];
  firms: Firm[];
  onSave: (mappings: UserFirmMapping[]) => Promise<void>;
  isSaving: boolean;
}

export function UserFirmMappings({
  mappings,
  firms,
  onSave,
  isSaving,
}: UserFirmMappingsProps) {
  const [localMappings, setLocalMappings] = useState(mappings);
  const [newEmail, setNewEmail] = useState('');
  const [newFirmId, setNewFirmId] = useState<string>('');

  const addMapping = () => {
    if (!newEmail || !newFirmId) return;
    const firmId = parseInt(newFirmId);
    if (isNaN(firmId)) return;
    // Prevent duplicates
    if (localMappings.some((m) => m.email.toLowerCase() === newEmail.toLowerCase())) return;

    setLocalMappings([...localMappings, { email: newEmail, firmId }]);
    setNewEmail('');
    setNewFirmId('');
  };

  const removeMapping = (email: string) => {
    setLocalMappings(localMappings.filter((m) => m.email !== email));
  };

  const handleSave = () => {
    onSave(localMappings);
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-base">User-Firm Mappings</CardTitle>
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
          Map user emails to specific firms. Mapped users will see the
          firm&apos;s custom configuration instead of defaults.
        </p>

        {/* Existing mappings */}
        {localMappings.length > 0 && (
          <div className="space-y-2">
            {localMappings.map((mapping) => {
              const firm = firms.find((f) => f.id === mapping.firmId);
              return (
                <div
                  key={mapping.email}
                  className="flex items-center gap-2 p-2 bg-muted/50 rounded-md"
                >
                  <span className="text-sm flex-1 truncate">
                    {mapping.email}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {firm?.name || `Firm #${mapping.firmId}`}
                  </span>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    onClick={() => removeMapping(mapping.email)}
                  >
                    <Trash2 className="h-3.5 w-3.5 text-destructive" />
                  </Button>
                </div>
              );
            })}
          </div>
        )}

        {/* Add new mapping */}
        <div className="flex items-center gap-2">
          <Input
            placeholder="user@example.com"
            value={newEmail}
            onChange={(e) => setNewEmail(e.target.value)}
            className="flex-1"
          />
          <Select value={newFirmId} onValueChange={setNewFirmId}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Select firm" />
            </SelectTrigger>
            <SelectContent>
              {firms
                .slice()
                .sort((a, b) => a.id - b.id)
                .map((firm) => (
                  <SelectItem key={firm.id} value={String(firm.id)}>
                    {firm.name}
                  </SelectItem>
                ))}
            </SelectContent>
          </Select>
          <Button
            size="sm"
            variant="outline"
            onClick={addMapping}
            disabled={!newEmail || !newFirmId}
          >
            <Plus className="h-4 w-4" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
