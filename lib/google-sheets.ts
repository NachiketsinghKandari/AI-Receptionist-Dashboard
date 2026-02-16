/**
 * Google Sheets API client for logging dashboard visits and chat messages.
 *
 * Uses OAuth2 with a pre-obtained refresh token.
 * Run `scripts/google-sheets-auth.mjs` once to get the refresh token.
 */

import { google, type sheets_v4 } from 'googleapis';

let cachedClient: sheets_v4.Sheets | null = null;

function getSheetsClient(): sheets_v4.Sheets {
  if (cachedClient) return cachedClient;

  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const refreshToken = process.env.GOOGLE_REFRESH_TOKEN;

  if (!clientId || !clientSecret || !refreshToken) {
    throw new Error(
      'Missing Google Sheets credentials. Set GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, and GOOGLE_REFRESH_TOKEN.'
    );
  }

  const oauth2Client = new google.auth.OAuth2(clientId, clientSecret);
  oauth2Client.setCredentials({ refresh_token: refreshToken });
  cachedClient = google.sheets({ version: 'v4', auth: oauth2Client });
  return cachedClient;
}

function getSpreadsheetId(): string {
  const id = process.env.GOOGLE_SHEET_ID;
  if (!id) throw new Error('Missing GOOGLE_SHEET_ID environment variable.');
  return id;
}

function istTimestamp(): string {
  return new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' });
}

/**
 * Append a visit log row to the "Sheet1" tab.
 */
export async function logVisitToSheet(userId: string, email: string) {
  const sheets = getSheetsClient();
  await sheets.spreadsheets.values.append({
    spreadsheetId: getSpreadsheetId(),
    range: 'Sheet1!A:C',
    valueInputOption: 'USER_ENTERED',
    requestBody: {
      values: [[userId, email, istTimestamp()]],
    },
  });
}

/**
 * Append a chat message row to the "Chats" tab.
 */
export async function logChatToSheet(
  userId: string,
  email: string,
  message: string,
) {
  const sheets = getSheetsClient();
  await sheets.spreadsheets.values.append({
    spreadsheetId: getSpreadsheetId(),
    range: 'Chats!A:D',
    valueInputOption: 'USER_ENTERED',
    requestBody: {
      values: [[userId, email, message, istTimestamp()]],
    },
  });
}

/**
 * Ensure the "Chats" tab exists in the spreadsheet, creating it if needed.
 * Called once on first chat log.
 */
let chatsTabReady = false;
export async function ensureChatsTab() {
  if (chatsTabReady) return;

  const sheets = getSheetsClient();
  const spreadsheetId = getSpreadsheetId();

  const { data } = await sheets.spreadsheets.get({ spreadsheetId, fields: 'sheets.properties.title' });
  const exists = data.sheets?.some((s) => s.properties?.title === 'Chats');

  if (!exists) {
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId,
      requestBody: {
        requests: [{ addSheet: { properties: { title: 'Chats' } } }],
      },
    });
    // Add headers
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: 'Chats!A1:D1',
      valueInputOption: 'USER_ENTERED',
      requestBody: {
        values: [['User ID', 'Email', 'Message', 'Timestamp']],
      },
    });
  }

  chatsTabReady = true;
}
