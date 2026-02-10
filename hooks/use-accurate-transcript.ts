'use client';

import { useMutation } from '@tanstack/react-query';
import { useEnvironment } from '@/components/providers/environment-provider';
import type { TranscriptionAccuracyResult } from '@/types/api';

async function generateAccurateTranscript(
  callId: number | string,
  environment: string
): Promise<TranscriptionAccuracyResult> {
  const response = await fetch(`/api/calls/${callId}/accurate-transcript`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ env: environment }),
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Failed to generate accurate transcript' }));
    throw new Error(error.error || 'Failed to generate accurate transcript');
  }
  const data = await response.json();
  return data.result;
}

export function useAccurateTranscript() {
  const { environment } = useEnvironment();

  return useMutation({
    mutationFn: (callId: number | string) => generateAccurateTranscript(callId, environment),
  });
}
