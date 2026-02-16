/**
 * Google Sheets API client for logging dashboard visits.
 *
 * Uses OAuth2 with a pre-obtained refresh token.
 * Run `scripts/google-sheets-auth.mjs` once to get the refresh token.
 */

import { google } from 'googleapis';

function getOAuth2Client() {
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
  return oauth2Client;
}

/**
 * Append a visit log row to the configured Google Sheet.
 */
export async function logVisitToSheet(userId: string, email: string) {
  const spreadsheetId = process.env.GOOGLE_SHEET_ID;
  if (!spreadsheetId) {
    throw new Error('Missing GOOGLE_SHEET_ID environment variable.');
  }

  const auth = getOAuth2Client();
  const sheets = google.sheets({ version: 'v4', auth });

  const timestamp = new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' });

  await sheets.spreadsheets.values.append({
    spreadsheetId,
    range: 'Sheet1!A:C',
    valueInputOption: 'USER_ENTERED',
    requestBody: {
      values: [[userId, email, timestamp]],
    },
  });
}
