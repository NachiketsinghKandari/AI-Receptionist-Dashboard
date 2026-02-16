'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import type { FeatureToggles, PiiMaskingConfig } from '@/types/client-config';

const FEATURE_ITEMS: {
  key: keyof Omit<FeatureToggles, 'piiMasking'>;
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

const PII_MASK_ITEMS: {
  key: keyof PiiMaskingConfig;
  label: string;
  description: string;
}[] = [
  { key: 'phones', label: 'Phone Numbers', description: 'Mask as ***-***-7890' },
  { key: 'names', label: 'Names', description: 'Mask as J*** D**' },
  { key: 'emails', label: 'Email Addresses', description: 'Mask as j***@e***.com' },
  { key: 'transcripts', label: 'Transcripts & Content', description: 'Mask phones/emails in transcripts and email bodies' },
];

interface FeatureTogglesEditorProps {
  features: FeatureToggles;
  onChange: (features: FeatureToggles) => void;
}

export function FeatureTogglesEditor({
  features,
  onChange,
}: FeatureTogglesEditorProps) {
  const toggleFeature = (key: keyof Omit<FeatureToggles, 'piiMasking'>) => {
    onChange({ ...features, [key]: !features[key] });
  };

  const togglePiiField = (key: keyof PiiMaskingConfig) => {
    onChange({
      ...features,
      piiMasking: { ...features.piiMasking, [key]: !features.piiMasking[key] },
    });
  };

  const allPiiOn = PII_MASK_ITEMS.every(({ key }) => features.piiMasking[key]);
  const anyPiiOn = PII_MASK_ITEMS.some(({ key }) => features.piiMasking[key]);

  const toggleAllPii = () => {
    const newValue = !allPiiOn;
    onChange({
      ...features,
      piiMasking: { phones: newValue, names: newValue, emails: newValue, transcripts: newValue },
    });
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
              onCheckedChange={() => toggleFeature(key)}
            />
          </div>
        ))}

        {/* PII Masking — granular sub-toggles */}
        <div className="border-t pt-4 mt-4">
          <div className="flex items-center justify-between mb-3">
            <div>
              <Label className="text-sm font-medium">PII Masking</Label>
              <p className="text-xs text-muted-foreground">
                Partially mask sensitive data for this firm&apos;s users
              </p>
            </div>
            <Switch
              checked={allPiiOn}
              onCheckedChange={toggleAllPii}
              className={anyPiiOn && !allPiiOn ? 'data-[state=unchecked]:bg-primary/40' : ''}
            />
          </div>
          <div className="ml-4 space-y-3 border-l-2 border-muted pl-4">
            {PII_MASK_ITEMS.map(({ key, label, description }) => (
              <div key={key} className="flex items-center justify-between">
                <div>
                  <Label className="text-xs font-medium">{label}</Label>
                  <p className="text-[11px] text-muted-foreground">{description}</p>
                </div>
                <Switch
                  checked={features.piiMasking[key]}
                  onCheckedChange={() => togglePiiField(key)}
                />
              </div>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
