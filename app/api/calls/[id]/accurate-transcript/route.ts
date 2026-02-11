/**
 * Accurate Transcript API route
 * Generates a corrected transcript by combining audio analysis (Gemini 3 Flash)
 * with ground-truth data from tool calls and the original STT transcription.
 */

import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenAI, ThinkingLevel } from '@google/genai';
import { authenticateRequest } from '@/lib/api/auth';
import { errorResponse } from '@/lib/api/utils';
import type { TranscriptionAccuracyResult } from '@/types/api';

// DB lookup tools whose results are considered absolute ground truth
const GROUND_TRUTH_TOOLS = new Set([
  'search_case_details',
  'staff_directory_lookup',
]);

// Maximum audio file size for inline data (20 MB)
const MAX_AUDIO_SIZE_BYTES = 20 * 1024 * 1024;

interface RouteParams {
  params: Promise<{ id: string }>;
}

// ---------------------------------------------------------------------------
// Context extraction helpers
// ---------------------------------------------------------------------------

/**
 * Extract numbered original transcript from webhook messages.
 * Maps bot -> "Assistant:" and user -> "User:".
 */
function buildOriginalTranscript(messages: Record<string, unknown>[]): string {
  const lines: string[] = [];
  let index = 1;

  for (const msg of messages) {
    const role = msg.role as string | undefined;
    const content = msg.content as string | undefined;

    if (!content) continue;

    if (role === 'bot' || role === 'assistant') {
      lines.push(`${index}. Assistant: ${content}`);
      index++;
    } else if (role === 'user') {
      lines.push(`${index}. User: ${content}`);
      index++;
    }
  }

  return lines.length > 0 ? lines.join('\n') : 'No transcript available.';
}

/**
 * Extract tool call ground-truth context from the messages array.
 * Only includes results from DB-lookup tools defined in GROUND_TRUTH_TOOLS.
 */
function buildToolCallContext(messages: Record<string, unknown>[]): string {
  const entries: string[] = [];

  for (const msg of messages) {
    const role = msg.role as string | undefined;

    // tool_call_result entries contain the actual data returned
    if (role === 'tool_call_result') {
      const name = msg.name as string | undefined;
      if (!name || !GROUND_TRUTH_TOOLS.has(name)) continue;

      const result = msg.result as string | undefined;
      if (result) {
        entries.push(`[${name}] Result:\n${result}`);
      }
      continue;
    }

    // Also capture tool_calls entries for request context
    if (role === 'tool_calls') {
      const toolCalls = msg.tool_calls as Record<string, unknown>[] | undefined;
      if (!toolCalls) continue;

      for (const tc of toolCalls) {
        const fn = tc.function as Record<string, unknown> | undefined;
        if (!fn) continue;
        const name = fn.name as string | undefined;
        if (!name || !GROUND_TRUTH_TOOLS.has(name)) continue;

        const args = fn.arguments as Record<string, unknown> | string | undefined;
        if (args) {
          const argsStr = typeof args === 'string' ? args : JSON.stringify(args);
          entries.push(`[${name}] Called with: ${argsStr}`);
        }
      }
    }
  }

  return entries.length > 0
    ? entries.join('\n\n')
    : 'No database lookups were performed during this call.';
}

/**
 * Extract transfer transcripts from the webhook artifact.transfers array.
 */
function buildTransferTranscripts(artifact: Record<string, unknown>): string {
  const transfers = artifact.transfers as Record<string, unknown>[] | undefined;
  if (!transfers || transfers.length === 0) {
    return 'No transfer conversations occurred.';
  }

  const transcripts: string[] = [];

  for (let i = 0; i < transfers.length; i++) {
    const transfer = transfers[i];
    const transcript = transfer.transcript as string | undefined;
    if (transcript) {
      transcripts.push(`--- Transfer ${i + 1} ---\n${transcript}`);
    }
  }

  return transcripts.length > 0
    ? transcripts.join('\n\n')
    : 'No transfer transcripts available.';
}

/**
 * Normalize audio MIME types to standard values accepted by Gemini.
 */
function normalizeAudioMime(contentType: string): string {
  const mime = contentType.split(';')[0].trim().toLowerCase();
  if (mime === 'audio/x-wav') return 'audio/wav';
  return mime;
}

// ---------------------------------------------------------------------------
// Gemini prompt
// ---------------------------------------------------------------------------

function buildPrompt(
  toolCallContext: string,
  transferTranscripts: string,
  originalTranscript: string,
  firmName?: string,
): string {
  const firmNameSection = firmName
    ? `\n## Firm Name (GROUND TRUTH)\nThis call was handled for the law firm: **${firmName}**. This is the correct spelling of the firm name. If the firm name is spoken in the call, ensure it is transcribed using this exact spelling.\n`
    : '';

  return `You are a transcription accuracy evaluator for a law firm call routing system. Your job is to produce the most accurate transcript possible by combining multiple sources of information.

## Your Inputs

1. **Audio Recording** (attached): The actual audio of the phone call. Listen carefully.
2. **Original Transcription**: The real-time STT transcription produced during the call.
3. **Tool Call Results**: Database lookups and system actions that occurred during the call. These are ABSOLUTE TRUTH for names, case numbers, dates, phone numbers, and all factual data.
4. **Transfer Transcripts**: Conversations during warm call transfers.

## Instructions

Listen to the entire audio recording and compare it against the original transcription. Produce what each speaker ACTUALLY said by:

1. **Preserving ALL speech artifacts**: Include every "um", "uh", "hmm", stutter, false start, self-correction, and verbal filler exactly as spoken. Do NOT clean up or normalize speech.
2. **Capturing pauses**: Mark significant pauses with "..." in the transcript.
3. **Including incomplete words**: If a speaker starts a word and stops, include the partial word.
4. **Using tool call results as ground truth**: When a name, case number, or other data was looked up via a tool call and the audio is unclear or the original transcription differs from the tool call result, use the tool call result as the correct value.
5. **Inferring from context**: When the audio is genuinely ambiguous, use the full conversation context to determine what was most likely said.
6. **Noting background speech**: If there is audible background speech, include it in brackets like [background: "..."].

${firmNameSection}## Database Lookup Results (ABSOLUTE TRUTH)
The following data was fetched from the database during the call. These are the DEFINITIVE correct values.

${toolCallContext}

## Transfer Transcripts

${transferTranscripts}

## Original Real-Time Transcription

${originalTranscript}

## Output Requirements

Return a JSON object with this exact structure:
- accurate_transcript: Array of utterance objects, each with:
  - role: "assistant" or "user"
  - content: What was ACTUALLY spoken (from audio + context), including all umms, pauses, fillers. This must be the most accurate version possible — fix EVERYTHING you find, no matter how minor.
  - original_transcription: What was originally transcribed by STT for this utterance
  - corrections: Array of ALL correction objects found for this utterance (empty if none needed). Include every correction — major and minor, names and fillers, everything. Each with:
    - original: The original incorrect text
    - corrected: The corrected text
    - source: One of "audio", "tool_call", "context_inference"
    - evidence: Brief explanation of why this correction was made
- accuracy_score: Float 0.0-1.0 representing how accurate the original transcription was on things that MATTER. Only factor in major corrections: name errors, data errors, number errors, missing speech, and meaning changes. Do NOT penalize for filler omissions, minor word variants that preserve meaning, or formatting differences. A transcript that only missed some "um"s but got all names and data right should score very high.
- total_utterances: Total number of utterances in the transcript
- corrected_utterances: Number of utterances that had at least one MAJOR correction (name, data, number, missing speech, or meaning change). Do NOT count utterances where the only corrections were minor (fillers, insignificant word differences).
- correction_categories: Object counting corrections by type:
  - name_corrections: Person names, firm names, staff names misspelled or wrong
  - data_corrections: Factual data errors
  - number_corrections: Phone numbers, case numbers, or any numeric data
  - missing_speech: Speech present in audio but entirely missing from transcript
  - word_corrections: General words misheard
  - filler_omissions: Filler words or pauses omitted
- major_corrections: Array of ONLY the corrections that materially affect accuracy. Each with:
  - original: The original incorrect text
  - corrected: The corrected text
  - category: One of "name", "data", "number", "missing_speech", "meaning_change"
  - source: One of "audio", "tool_call", "context_inference"
  - evidence: Clear explanation`;
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

function isValidAccuracyResult(data: unknown): data is TranscriptionAccuracyResult {
  if (typeof data !== 'object' || data === null) return false;
  const obj = data as Record<string, unknown>;

  if (!Array.isArray(obj.accurate_transcript)) return false;
  if (typeof obj.accuracy_score !== 'number') return false;
  if (typeof obj.total_utterances !== 'number') return false;
  if (typeof obj.corrected_utterances !== 'number') return false;
  if (typeof obj.correction_categories !== 'object' || obj.correction_categories === null) return false;
  if (!Array.isArray(obj.major_corrections)) return false;

  return true;
}

// ---------------------------------------------------------------------------
// Route handler
// ---------------------------------------------------------------------------

export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    // 1. Authenticate
    const auth = await authenticateRequest(request);
    if (!auth.authenticated) {
      return errorResponse(auth.error || 'Unauthorized', 401, 'UNAUTHORIZED');
    }

    // 2. Parse request body
    const body = await request.json().catch(() => ({}));
    const recordingUrl = body.recordingUrl as string | undefined;
    const webhookPayload = body.webhookPayload as Record<string, unknown> | undefined;
    const firmName = body.firmName as string | undefined;

    // Await params (required by Next.js 16 route signature)
    await params;

    if (!recordingUrl) {
      return errorResponse(
        'No recording URL provided',
        400,
        'NO_RECORDING_URL',
      );
    }

    if (!webhookPayload) {
      return errorResponse(
        'No webhook payload provided',
        400,
        'NO_WEBHOOK_DATA',
      );
    }

    // 3. Extract messages from the webhook payload
    const message = webhookPayload.message as Record<string, unknown> | undefined;
    const artifact = (message?.artifact ?? webhookPayload.artifact) as Record<string, unknown> | undefined;

    const messages = (
      (message?.messages as Record<string, unknown>[]) ??
      (artifact?.messages as Record<string, unknown>[]) ??
      []
    );

    if (messages.length === 0) {
      return errorResponse(
        'No message data available in webhook payload',
        400,
        'NO_WEBHOOK_DATA',
      );
    }

    // 4. Build context strings
    const originalTranscript = buildOriginalTranscript(messages);
    const toolCallContext = buildToolCallContext(messages);
    const transferTranscripts = artifact
      ? buildTransferTranscripts(artifact)
      : 'No transfer conversations occurred.';

    // 5. Download the audio file
    let audioBuffer: ArrayBuffer;
    let audioMimeType: string;

    try {
      const audioResponse = await fetch(recordingUrl, {
        signal: AbortSignal.timeout(60_000), // 60s timeout for audio download
      });

      if (!audioResponse.ok) {
        console.error('Audio download failed:', audioResponse.status, audioResponse.statusText);
        return errorResponse(
          `Failed to download audio file: ${audioResponse.status} ${audioResponse.statusText}`,
          502,
          'AUDIO_DOWNLOAD_FAILED',
        );
      }

      audioBuffer = await audioResponse.arrayBuffer();
      audioMimeType = normalizeAudioMime(
        audioResponse.headers.get('content-type') || 'audio/wav',
      );
    } catch (downloadError) {
      console.error('Audio download error:', downloadError);
      return errorResponse(
        `Failed to download audio file: ${downloadError instanceof Error ? downloadError.message : 'Unknown error'}`,
        502,
        'AUDIO_DOWNLOAD_FAILED',
      );
    }

    // 6. Validate audio size
    if (audioBuffer.byteLength > MAX_AUDIO_SIZE_BYTES) {
      return errorResponse(
        `Audio file too large (${(audioBuffer.byteLength / 1024 / 1024).toFixed(1)} MB). Maximum is 20 MB.`,
        413,
        'AUDIO_TOO_LARGE',
      );
    }

    // 7. Encode audio as base64
    const base64AudioData = Buffer.from(audioBuffer).toString('base64');

    // 8. Check for Gemini API key
    const geminiApiKey = process.env.GEMINI_API_KEY;
    if (!geminiApiKey) {
      return errorResponse(
        'GEMINI_API_KEY is not configured',
        500,
        'GEMINI_NOT_CONFIGURED',
      );
    }

    // 9. Call Gemini 3 Flash Preview with audio + text prompt
    const geminiClient = new GoogleGenAI({ apiKey: geminiApiKey });
    const promptText = buildPrompt(toolCallContext, transferTranscripts, originalTranscript, firmName);

    let geminiResponse;
    try {
      geminiResponse = await geminiClient.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: [
          {
            role: 'user',
            parts: [
              { inlineData: { mimeType: audioMimeType, data: base64AudioData } },
              { text: promptText },
            ],
          },
        ],
        config: {
          thinkingConfig: { thinkingLevel: ThinkingLevel.HIGH },
          responseMimeType: 'application/json',
          httpOptions: { timeout: 600_000 }, // 10-minute timeout
        },
      });
    } catch (geminiError) {
      console.error('Gemini API error:', geminiError);
      return errorResponse(
        `Gemini API error: ${geminiError instanceof Error ? geminiError.message : 'Unknown error'}`,
        500,
        'GEMINI_API_ERROR',
      );
    }

    // 10. Parse and validate the response
    const responseText = geminiResponse.text;
    if (!responseText) {
      return errorResponse(
        'Gemini returned an empty response',
        500,
        'GEMINI_EMPTY_RESPONSE',
      );
    }

    let parsedResult: unknown;
    try {
      parsedResult = JSON.parse(responseText);
    } catch (parseError) {
      console.error('Failed to parse Gemini response as JSON:', parseError);
      console.error('Raw response (first 1000 chars):', responseText.substring(0, 1000));
      return errorResponse(
        'Gemini returned invalid JSON',
        500,
        'GEMINI_INVALID_JSON',
      );
    }

    if (!isValidAccuracyResult(parsedResult)) {
      console.error('Gemini response failed validation. Keys:', Object.keys(parsedResult as object));
      return errorResponse(
        'Gemini returned a response that does not match the expected schema',
        500,
        'GEMINI_INVALID_SCHEMA',
      );
    }

    // 11. Return the result
    return NextResponse.json({ result: parsedResult });
  } catch (error) {
    console.error('Accurate transcript API error:', error);
    return errorResponse(
      `Internal server error: ${error instanceof Error ? error.message : 'Unknown error'}`,
      500,
      'INTERNAL_ERROR',
    );
  }
}
