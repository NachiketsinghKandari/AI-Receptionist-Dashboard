'use client';

import { useEnvironment } from '@/components/providers/environment-provider';
import { ENVIRONMENTS, type Environment } from '@/lib/constants';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Database } from 'lucide-react';

export function EnvironmentSwitcher() {
  const { environment, setEnvironment } = useEnvironment();

  return (
    <Select value={environment} onValueChange={(value) => setEnvironment(value as Environment)}>
      <SelectTrigger className="w-[150px] sm:w-[160px] h-8 text-xs">
        <Database className="h-3 w-3 mr-1.5" />
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {ENVIRONMENTS.map((env) => (
          <SelectItem key={env} value={env} className="text-xs">
            {env.charAt(0).toUpperCase() + env.slice(1)}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
