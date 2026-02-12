# HelloCounsel Dashboard - Product Demo Script

A walkthrough guide for recording a product demo video. Follow these sections sequentially.

---

## 1. Authentication

### Login Page
- Navigate to the login URL.
- Show the branded card with the HelloCounsel logo, email/password fields, and the password visibility toggle (eye icon).
- Mention the "Forgot your password?" link, which sends a reset email via Supabase Auth.
- Note: Google OAuth is built in but currently hidden. Only authorized team members can access.

### Password Reset Flow (optional)
- Click "Forgot your password?" to show the reset page.
- After submitting an email, the confirmation screen shows a mail icon and instructions to check your inbox.
- The reset password page validates the recovery session, enforces a 6-character minimum, and auto-redirects to login after success.

---

## 2. Dashboard Home

### Welcome and Navigation
- After logging in, show the home page with the personalized welcome message. On first load or page refresh, the username types out letter-by-letter (typing animation). On client-side navigation, it appears instantly.
- Point out the subtitle showing the current environment (e.g., "HelloCounsel Production") and the tagline "Call routing and management dashboard."

### Quick Links Grid
- Demonstrate the six quick-link cards: Calls, Reports, Emails, Transfers, Sentry, Webhooks.
- Each card has a colored icon, title, description, and hover effects (shadow lift, arrow icon reveal, color transition on title).
- Note: These links are filtered based on the client's configuration -- non-admin users may see fewer cards.

### KPI Overview
- Show the four KPI cards: Total Calls, Avg Duration, Transfer Rate, Emails Sent.
- Use the period selector dropdown (Yesterday / Today / This Month) to switch time periods. Each KPI shows a percentage delta comparing to the prior period.
- Demonstrate that the data loads with skeleton placeholders and then fills in.

### Call Volume Chart
- Show the area chart with gradient fill.
- Switch between the five time range tabs: Yesterday (hourly), Today (hourly), 7 Days, 30 Days, All.
- Hover over data points to see tooltips with exact counts.
- Below the chart, show the four summary stat cards: Total in Period, Peak Hour/Avg per Day, Peak Volume/Peak Day, and Date/Days.

---

## 3. Calls Page

### Filter Sidebar (Desktop)
- Show the left sidebar with all filter controls. It is permanently visible on desktop (approximately 256px wide).
- **Date Filter**: Toggle between Today, Yesterday, Custom, and All. In Custom mode, two date pickers appear for start and end dates. Dates use Eastern timezone (America/New_York) boundaries.
- **Search**: Type in the search field. Note the helper text: "ID, caller name, phone, correlation ID, summary, feedback." Search is debounced at 300ms.
- **Firm Filter**: Select a specific firm from the dropdown (sorted by ID).
- **Call Type Filter**: Filter by call type (e.g., All, inbound, outbound).
- **Transfer Type Filter**: Filter by transfer type.
- **Cekura Status Filter**: Filter by Cekura observability status (All, Success, Failure, Reviewed Success, Reviewed Failure, Other).
- **Multiple Transfers Toggle**: Switch to show only calls with multiple transfers.
- **Flagged Only Toggle**: Switch to show only flagged calls (those with Sentry errors, long duration over 5 minutes, important emails, or transfer-email mismatches). When enabled, the page title changes to "Flagged Calls" with a red flag icon.
- **Reset Filters Button**: Click to clear all filters and return to the default view.
- **Results Per Page**: Adjust the number of results per page (capped at 100).

### Dynamic Filter Builder
- Click the filter icon button (top of the sidebar, next to the header) to open the Dynamic Filter Builder.
- Add multiple filter rules. Each rule has: a field selector, a condition selector (equals, not equals, contains, starts with, is empty, etc.), a value input, and a combinator (AND / OR) toggle between rules.
- Available fields include: caller_name, phone_number, call_duration, call_type, transfer_type, cekura_status, feedback, firm_id, status, tool_call_result, multiple_transfers, and more.
- Demonstrate adding a filter (e.g., "call_duration greater_than 300"), then adding a second rule with OR combinator.
- Show that the filter builder works on mobile as a full-screen sheet overlay.

### Filter Sidebar (Mobile)
- On a mobile viewport, the sidebar collapses into a frosted-glass floating button at the bottom center of the screen.
- Tap it to open a bottom drawer with all the same filter controls.

### Data Table
- Show the paginated table with columns: ID, Correlation ID (copyable), Caller, Duration, Type (badge), Cekura Status, Feedback, Started (UTC), Phone, Status.
- **Column Sorting**: Click column headers for ID, Started, and Duration to toggle ascending/descending sort. An arrow indicator shows the current sort direction.
- **Row Highlighting**: Rows are color-coded by status:
  - Red background: Sentry errors detected for this call.
  - Yellow background: Transfer-email mismatch.
  - Orange background: Long call (over 5 minutes) or important email attached.
- **Pagination**: Use Previous/Next buttons at the bottom. The current page range and total count are shown.
- **Stats Bar**: Above the table, note the "Total" (date-filtered count), "Filtered" (with percentage), and "Showing" counts.
- **Loading States**: When data is loading, the table shows skeleton rows. When refetching in the background, a subtle loading indicator appears.

### Share Button
- Click the "Share" button in the top-right of the calls page.
- This copies a compressed URL to the clipboard that encodes all current filters (firm, date range, search, call type, transfer type, Cekura status, sort, pagination, dynamic filters, and environment).
- A toast notification confirms "Link copied to clipboard."
- Opening the shared link restores the exact filter state and environment.

### Call Detail Panel (Desktop)
- Click any table row to open the call detail panel. It slides in from the right as a full-height sheet, taking approximately the full width minus the sidebar.
- The panel has a **two-panel resizable layout**:
  - **Left Panel** (call info): scrollable with all call details.
  - **Right Panel** (transcript and related data): scrollable independently.
  - **Drag the center handle** (grip icon on a vertical divider) to resize the panels. The layout is persisted in localStorage.

#### Left Panel Content
- **Header**: Call correlation ID (copyable), caller name, phone number, with Previous/Next navigation arrows and "X of Y" counter.
- **Call Summary Section**: Expandable card with the AI-generated call summary text.
- **Call Metadata**: Status badge, call type badge, duration, started/ended timestamps, phone number, firm name.
- **Highlight Reasons**: If the call is flagged, colored badges explain why (Sentry error, long duration, important email, transfer mismatch).
- **External Links**: Buttons to open the call in the VAPI Dashboard and Sentry Logs (opens in new tabs).
- **Share Call Button**: Copy a shareable link for this specific call.
- **Cekura Observability Section**: If Cekura integration is enabled:
  - Shows the Cekura status (Success/Failure/Reviewed Success/Reviewed Failure) as a colored interactive dropdown button.
  - Click the status button to change the review status (mark as Reviewed Success or Reviewed Failure).
  - Link to open the call in the Cekura dashboard.
  - Shows the Cekura feedback text (editable inline -- click the pencil icon to edit, type feedback, press Enter or click the check icon to save).

#### Right Panel Content
- **Tabs**: Transcript, Emails, Transfers, Webhooks, Sentry.
- **Transcript Tab**:
  - Shows the conversation in a chat-bubble format: agent messages on the left (muted background), caller messages on the right (primary color background). Each bubble shows the speaker label and timestamp.
  - **Tool Call Cards**: Inline cards show function invocations (e.g., search_case, transfer_call) with expandable sections showing the function arguments (JSON) and result. Color-coded by success/failure.
  - **Accurate Transcript Button**: Click "Generate Accurate Transcript" to run an AI-corrected transcription against the call recording. Shows a comparison between the VAPI transcript and the corrected version, with accuracy scoring for names, phone numbers, and general content. A fullscreen dialog displays the detailed comparison.
  - **Audio Player**: If a recording URL exists, an inline audio player appears with play/pause, seek bar, volume control, mute toggle, and playback speed selector (0.5x, 0.75x, 1x, 1.25x, 1.5x, 2x). Default speed is 1.25x. A mini-player bar appears at the bottom when scrolling away from the player.
- **Emails Tab**: Lists all emails associated with this call, showing subject, recipients (expandable display), type badge, status badge, sent timestamp, and the full email body rendered with proper formatting.
- **Transfers Tab**: Lists all transfers for this call, showing recipient name, phone, transfer type, status, timing details (started, supervisor answered, time to pickup), and error messages if applicable. Includes external links to VAPI and Sentry.
- **Webhooks Tab**: Lists all webhooks for this call. Click to expand each webhook to see: squad overrides, assistant overrides, structured outputs, transfer details (enriched with database data showing caller to staff flow), and the full JSON payload in an interactive JSON viewer with syntax highlighting and collapsible nodes. Copy buttons for all JSON sections.
- **Sentry Tab**: Shows Sentry events correlated to this call. Each event is expandable, showing level (error/warning/info icons), type, timestamp, environment, logger, endpoint, and full message text.

### Call Detail (Mobile)
- On mobile, the detail panel is fullscreen with a **swipe carousel**. Swipe left/right to navigate between calls with spring-animated transitions (Framer Motion).
- Instead of side-by-side panels, content is in a tabbed layout: "Info" tab (left panel content) and "Transcript" tab (right panel content).

### Keyboard Navigation
- **Arrow Left/Right**: Navigate between calls in the detail panel.
- **Escape**: Close the detail panel.
- Navigation wraps around (going past the last call returns to the first, and vice versa), including across page boundaries.

---

## 4. Emails Page

### Layout and Filters
- Same sidebar/table layout as Calls. Filters include date range, search ("ID, call ID, subject, type, status"), firm, and results per page.
- Dynamic Filter Builder is available with email-specific fields.
- Table columns: ID, Call ID, Type (badge), Subject, Recipients (compact display), Status (with orange highlight for [Important] emails), Sent At.

### Email Detail Dialog
- Click a row to open a dialog. Navigate between emails with Previous/Next arrows.
- Shows status and type badges, then a card with the email subject as a prominent header, recipients (full list), date, type, and linked call ID.
- Below, the full email body is rendered with proper formatting (HTML sanitized).

---

## 5. Transfers Page

### Layout and Filters
- Sidebar filters: date range, search ("ID, call ID, recipient name, phone, type, status"), firm, status filter (All, completed, failed, etc.), transfer type filter, and results per page.
- Dynamic Filter Builder with transfer-specific fields.
- Table columns: ID, Call ID, Type (badge), Recipient, Phone, Status (color-coded badge), Started At.

### Transfer Detail Dialog
- Click a row to open a dialog with status and type badges.
- External link buttons: "VAPI Dashboard" and "Sentry Logs" (both open in new tabs).
- Metadata grid: Type, Status, Recipient (To), Phone, Call ID, Started, Supervisor Answered, Time to Pickup (in seconds), Supervisor Identity, Consultation Room.
- Error messages are highlighted in a red box if present.

---

## 6. Webhooks Page

### Layout and Filters
- Sidebar filters: date range, search ("ID, call ID, correlation ID, type, platform"), firm, platform filter (All, vapi, etc.), Multiple Transfers toggle, and results per page.
- Table columns: ID, Call ID, Platform (badge), Correlation ID (truncated with copy button), Type (badge), Received At.

### Webhook Detail Dialog
- Shows platform and type badges, external links to VAPI Dashboard and Sentry Logs.
- Metadata grid: ID, Type, Platform, Received, Platform Call ID (copyable), Call ID.
- **Collapsible Sections** (click to expand/collapse, each with a copy button):
  - **Squad Overrides**: JSON viewer for squad configuration overrides.
  - **Assistant Overrides**: JSON viewer for assistant configuration overrides.
  - **Structured Outputs**: JSON viewer for structured output data.
  - **Transfers**: Enriched transfer list showing "Caller -> Staff" flow with result badges (color-coded: green for executed, red for cancelled).
  - **Full Payload**: Complete JSON payload in an interactive JSON viewer with syntax highlighting, collapsible nodes, and copy button.

---

## 7. Sentry Page

### Filters and Metrics
- Filters are in a horizontal card (desktop) or a frosted-glass floating "Filters" button that opens a bottom drawer (mobile).
- Filter options: Search (correlation ID, call ID, message), Event Type (transfer, webhook, search_case, take_message, schedule_callback), Level (error, warning, info, debug), Time Period (24h, 7d, 30d), Sentry Environment (production, pre-prod, stage, develop, development).
- Three metric cards at the top: Total Events, Unique Calls, Mapped to DB.
- Refresh button to manually reload data.

### Summary Table
- Grouped by correlation ID. Columns: Call ID, Correlation ID (copyable), Events count (badge), Level (with icon), Types, Last Event timestamp.

### Event Detail Dialog
- Click a row to open a dialog showing all events for that correlation ID.
- Correlation ID displayed with copy button.
- Link to "View all logs in Sentry Explorer" (opens Sentry in a new tab).
- Summary card: Call ID, Events count, Level (with icon), Types.
- Events list: Each event is an expandable card. The collapsed view shows: level icon, timestamp, type icon, and message preview. Expand to see: Level, Type, Time, Environment, Logger, Event ID, Endpoint (if applicable), and the full message in a pre-formatted block.

---

## 8. Reports Page

### Sidebar (Desktop) / Generate Button (Mobile)
- Desktop: Left sidebar with report generation controls.
- Mobile: Frosted-glass "Generate" button at the bottom center opens a drawer.
- **Report Type Tabs**: Switch between "EOD Reports" and "Weekly Reports."
- **Firm Filter**: Filter reports by firm.

### EOD Report Generation
- Select a date using the date picker.
- Click "Generate Report" to trigger the three-step process:
  1. Fetches raw data from Cekura and Sentry.
  2. Saves the report payload to the database.
  3. Generates three AI reports in parallel (Success, Failure, Full).
- Progress indicators show each step: "Fetching data...", "Saving report...", "Generating AI..."
- **Data Format Selector**: Click the dropdown chevron on the Generate button to choose between JSON and TOON (experimental) formats for AI generation.

### Weekly Report Generation
- Select any date within the target week. The sidebar shows the computed week range (Mon-Sun).
- "Force regenerate all daily reports" checkbox option.
- Click "Generate Weekly" to trigger a multi-step process:
  1. Checks for existing daily EOD reports and generates missing ones.
  2. Aggregates daily data into a weekly summary.
  3. Saves the weekly report.
  4. Generates the AI weekly narrative.
- Progress updates show each step in real-time.

### Reports Table
- Columns: Report Date, Firm, Calls count, Errors count (red badge if > 0), Trigger type (badge), Generated At, AI Reports status (Ready with sparkle icon / Generating with spinner / Partial count like "1/3" / Pending).
- Sortable by report date and generated-at timestamp.

### Report Detail Panel
- Click a row to open a full-width detail panel (similar to calls detail). It slides in from the right.
- **Two-panel resizable layout** (desktop) with a draggable divider, or **tabbed layout** (mobile).
- **Share Button**: Copy a shareable link for this specific report. Opening the link auto-opens the report detail panel with the correct environment.
- **Keyboard Navigation**: Arrow keys to navigate between reports, Escape to close.

#### Left Panel
- **Summary Stats**: Three cards showing Total calls, Failure count (red), and Success count (green). Each shows a percentage change arrow compared to the previous report.
- **Report Metadata**: Date, Environment badge, Trigger type badge, Generated timestamp.
- **Tabs**: Errors (expandable list of failed calls with Cekura status badges, correlation IDs, copy buttons, VAPI and Cekura external links, error messages, and Sentry error titles) and Raw (full JSON payload in an interactive viewer with copy button).

#### Right Panel
- **AI Reports** with tabs: Failure, Success, Full (for EOD) or Weekly Report (for weekly).
- Each tab shows the AI-generated markdown report rendered with proper formatting (headings, lists, tables, bold/italic).
- **Export Options** per report:
  - **PDF Export**: Click the printer icon. Choose branding: firm logo, HelloCounsel logo, or no logo. Generates a branded PDF with header, title, and formatted content.
  - **DOCX Export**: Click the document icon. Downloads a Word document.
  - **Copy to Clipboard**: Click the copy icon.
  - **Regenerate**: Click the refresh icon dropdown to regenerate with JSON or TOON format.
- If a report has not been generated yet, a placeholder with a "Generate" button is shown with format selection.

---

## 9. AI Data Chat

### Opening the Chat
- Click the floating chat button (message icon) in the bottom-right corner of any dashboard page.
- On desktop, it opens as a **side sheet** (480px wide) sliding in from the right.
- Click the **expand button** (maximize icon) to switch to a **centered dialog** (up to 1200px wide, 850px tall).

### Chat Interactions
- Type natural language questions about your data. Examples:
  - "How many calls were there today?"
  - "Show me transfers by firm"
  - "What is the average call duration this week?"
  - "List the top 5 firms by call volume"
- Messages display in a chat bubble format: user messages on the right (primary color), assistant responses on the left with a sparkle icon.

### Response Types
- **SQL Badge**: Expandable badge showing the SQL query that was generated and executed. Click to expand, copy the SQL.
- **Data Table**: Results displayed in a scrollable table with column headers and monospace formatting. Row count shown below. Export to CSV via the download button.
- **Charts**: The AI can generate bar charts, line charts, and pie charts based on query results. Charts are rendered with Recharts. Download as PNG via the download button. Pie charts with more than 8 slices auto-group the smallest into "Other."
- **Markdown Text**: Explanatory text rendered with full markdown support (headings, lists, bold, code blocks, tables via GFM).
- **Error Messages**: Displayed in a red-tinted card with an error icon.

### Chat History
- Click the **sidebar toggle** (panel icon) to show/hide the chat history sidebar.
- History is persisted server-side as JSON files.
- Each conversation has a title (auto-generated from the first message), timestamp, rename option, delete option, and share option (copies full conversation text to clipboard).
- "New Chat" button starts a fresh conversation.
- "Clear All" option removes all saved conversations.

### Chat Controls
- **Stop button**: Appears during response generation. Click to abort the streaming response.
- **New Chat button** (plus icon): Starts a new conversation.
- **Close button** (X icon): Closes the chat panel.
- On mobile, chat opens as a **bottom drawer** (85% viewport height) with the same features.

---

## 10. Admin Panel

### Accessing the Admin Panel
- Click the user avatar in the top-right navbar, then click "Admin Panel" in the dropdown menu. This option is only visible to admin users.
- Non-admin users are automatically redirected away from /admin.

### Firm Configuration Tab

#### Firm Selector
- Select a firm from the dropdown. Firms with existing custom configurations are marked with an asterisk (*).
- After selecting, the configuration editor loads with four sub-tabs: Pages, Columns, Features, Branding.

#### Pages Tab
- Toggle on/off which pages are visible for this firm's users: Calls, Reports, Emails, Transfers, Sentry, Webhooks.
- Each toggle has an icon, label, and description. Disabled pages are hidden from the navbar and quick links.

#### Columns Tab
- Toggle on/off which table columns are visible per data page (Calls, Emails, Transfers, Webhooks, Sentry).
- This allows hiding sensitive or irrelevant columns for specific firm users.

#### Features Tab
- Toggle on/off individual features:
  - AI Reports
  - Cekura Integration
  - Data Chat (the floating chat button)
  - Accurate Transcript
  - Dynamic Filters (the advanced filter builder)
  - Environment Switcher

#### Branding Tab
- **Display Name**: Replace "HelloCounsel" with the firm's name throughout the UI (navbar, page title).
- **Logo URL**: Provide a URL to the firm's logo. A preview renders below the input.
- **Border Radius**: Choose corner roundness (Sharp/0, 0.25rem, 0.5rem, 0.625rem) with quick-select buttons or a custom value.
- **Color Theme**: Full color customization with sections:
  - Backgrounds and Text (background, foreground, card, popover)
  - Primary and Secondary (CTA buttons, secondary buttons)
  - Muted and Accent (subtle backgrounds, hover states)
  - Table (header background and text)
  - Borders and Inputs (borders, input borders, focus ring, destructive)
  - Sidebar (background, text, active item, hover)
  - Charts (5 chart colors)
  - Each color field shows a live preview swatch. Supports OKLCH and hex values.
  - Note: Non-admin users see the theme as a fixed style (no dark/light toggle).

#### Save and Delete
- Click "Save" to persist the configuration. Click "Remove" to delete a firm's custom config and revert to defaults.

### Global Settings Tab

#### User-Firm Mappings
- Map user email addresses to specific firm IDs. When a mapped user logs in, they see only that firm's data and theming.
- Add new mappings with email and firm selector. Remove existing mappings.

#### Admin Domains
- Configure which email domains have admin access to the dashboard.

---

## 11. Cross-Cutting Features

### Environment Switching
- In the navbar, show the environment switcher (toggle or dropdown) to switch between Production and Staging.
- Switching environments invalidates all TanStack Query caches and reloads data from the selected Supabase instance.
- The environment is stored in localStorage and persists across sessions.
- Shared URLs include the environment parameter so recipients see the correct data.

### Theme Toggle (Admin Only)
- In the user dropdown menu, admins can switch between Light, Dark, and System themes.
- Non-admin users with firm-specific branding see a fixed theme.

### Responsive Design
- Resize the browser window or use device emulation to show mobile adaptations:
  - **Navbar**: Collapses to a hamburger menu (left sheet) with navigation links.
  - **Filter Sidebars**: Collapse to frosted-glass floating buttons that open bottom drawers.
  - **Tables**: Hide less-important columns on mobile (e.g., correlation ID, phone, timestamps).
  - **Detail Panels**: Switch from side-by-side resizable panels to fullscreen tabbed layouts.
  - **Call Detail**: Mobile uses swipe carousel with spring animations (Framer Motion).
  - **Charts**: Responsive height adjustments.

### Data Fetching and Caching
- All data uses TanStack Query with a 60-second stale time (300 seconds for firms list).
- Background refetch on window focus -- switch away and come back to see data refresh automatically.
- Dashboard home prefetches all chart and overview data for instant tab switching.
- Call detail prefetches adjacent call details for smooth carousel navigation.

### Cekura Call Observability
- The Cekura integration loads call status data progressively (recent day first, then full range).
- On the calls table, the Cekura Status column shows colored badges with loading shimmer during initial fetch.
- The Feedback column shows inline editable text from Cekura.
- In the call detail panel, the Cekura status is an interactive dropdown for review status changes.

### Shared URLs and Deep Linking
- All filter states on the Calls page can be encoded into a compressed shareable URL (using lz-string compression).
- Call-specific shared links open directly to the call detail panel.
- Report shared links open directly to the report detail panel.
- Environment is synced from URL parameters on shared links.

### Security Patterns
- All external API calls go through Next.js API routes (BFF pattern) -- credentials never reach the client.
- JWT session validation on every request via proxy.ts.
- SQL injection prevention with escapeLikePattern() for LIKE queries.
- Input validation with parseIntOrNull(), parseIntOrDefault(), pagination capped at 100.
- Search terms trimmed and escaped via buildSafeSearchTerm().

---

## 12. Suggested Demo Flow (5-7 minutes)

1. **Login** (30s): Show the login page with animated background. Log in.
2. **Home** (45s): Welcome message with typing effect. Quick links. Switch KPI period. Interact with the call volume chart tabs.
3. **Calls** (90s): Apply a date filter. Search for a caller. Toggle flagged-only mode. Open a call detail -- show the two-panel layout, play audio, scroll through the transcript with tool call cards, check the emails and transfers tabs. Navigate between calls with arrow keys.
4. **Dynamic Filters** (30s): Open the filter builder, add a multi-condition filter with AND/OR logic. Show how it narrows results.
5. **Reports** (60s): Generate an EOD report. Watch the three-step progress. Open the report detail -- show the errors list, the AI-generated failure report, export as PDF.
6. **Chat** (45s): Open the chat, ask "How many calls were there yesterday?" Show the SQL badge, data table, and chart response. Expand to fullscreen mode. Show chat history.
7. **Admin** (45s): Open the admin panel. Select a firm. Toggle off a page. Change the display name and a primary color. Save.
8. **Environment Switch** (15s): Switch from Production to Staging. Show data reload.
9. **Mobile** (30s): Resize to mobile. Show the hamburger menu, floating filter button, and swipe carousel on call detail.
