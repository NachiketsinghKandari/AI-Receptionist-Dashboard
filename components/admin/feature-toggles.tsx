'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import type { FeatureToggles } from '@/types/client-config';

const FEATURE_ITEMS: {
  key: keyof FeatureToggles;
  label: string;
  description: string;
}[] = [
  { key: 'aiReports', label: 'AI Reports', description: 'AI-generated EOD and weekly reports' },
  { key: 'cekuraIntegration', label: 'Cekura Integration', description: 'Cekura call observability status and feedback' },
  { key: 'chat', label: 'Data Chat', description: 'AI chat panel for querying dashboard data' },
  { key: 'accurateTranscript', label: 'Accurate Transcript', description: 'AI-corrected transcript display' },
  { key: 'dynamicFilters', label: 'Dynamic Filters', description: 'Advanced dynamic filter builder on data pages' },
  { key: 'environmentSwitcher', label: 'Environment Switcher', description: 'Toggle between production and staging' },
];

interface FeatureTogglesEditorProps {
  features: FeatureToggles;
  onChange: (features: FeatureToggles) => void;
}

export function FeatureTogglesEditor({
  features,
  onChange,
}: FeatureTogglesEditorProps) {
  const toggle = (key: keyof FeatureToggles) => {
    onChange({ ...features, [key]: !features[key] });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Feature Toggles</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {FEATURE_ITEMS.map(({ key, label, description }) => (
          <div key={key} className="flex items-center justify-between">
            <div>
              <Label className="text-sm font-medium">{label}</Label>
              <p className="text-xs text-muted-foreground">{description}</p>
            </div>
            <Switch
              checked={features[key]}
              onCheckedChange={() => toggle(key)}
            />
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
