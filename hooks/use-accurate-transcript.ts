'use client';

import { useMutation } from '@tanstack/react-query';
import { useEnvironment } from '@/components/providers/environment-provider';
import type { TranscriptionAccuracyResult } from '@/types/api';

export interface GenerateAccurateTranscriptParams {
  callId: number | string;
  recordingUrl: string;
  webhookPayload: Record<string, unknown>;
  firmName?: string;
}

async function generateAccurateTranscript(
  params: GenerateAccurateTranscriptParams,
  environment: string
): Promise<TranscriptionAccuracyResult> {
  const { callId, recordingUrl, webhookPayload, firmName } = params;
  const response = await fetch(`/api/calls/${callId}/accurate-transcript`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ env: environment, recordingUrl, webhookPayload, firmName }),
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
    mutationFn: (params: GenerateAccurateTranscriptParams) =>
      generateAccurateTranscript(params, environment),
  });
}
