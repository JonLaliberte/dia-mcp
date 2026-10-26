# dia-mcp

MCP (Model Context Protocol) server for the Dia browser. Manage profiles and tabs programmatically.

## Features

- **List profiles** - Get Dia's profiles and which one is active
- **Focus profile** - Switch the front window to a profile
- **List tabs** - Get the tabs in a profile
- **Add tab / Open URL** - Open a URL in a profile
- **Delete tab** - Close a tab by ID
- **Get active tab** - ID, title, URL and profile of the current tab
- **Get tab content** - Read the current page as markdown, text or HTML

Everything goes through Dia's AppleScript dictionary (via JXA), so changes take effect immediately.

## Requirements

- macOS
- Dia browser installed and running with at least one window open
- For `get_tab_content` only: Dia launched with the `--enable-applescript-javascript` flag (see below)

## Installation

```bash
bun install
```

## Usage

### With Claude Code

Add to your Claude Code MCP settings:

```json
{
  "mcpServers": {
    "dia": {
      "command": "npx",
      "args": ["tsx", "/path/to/dia-mcp/src/index.ts"]
    }
  }
}
```

### Running directly

```bash
bun start
# or
npx tsx src/index.ts
```

### Tests

`test.ts` adds and closes throwaway tabs in the profile you name:

```bash
bun test.ts <profile-name>
```

## Tools

### `list_profiles`

List the profiles in Dia's front window, in sidebar order, with the active one marked.

### `focus_profile`

Switch the front window to a profile.

| Parameter | Type   | Required | Description         |
| --------- | ------ | -------- | ------------------- |
| profile   | string | Yes      | Name of the profile |

### `list_tabs`

List a profile's tabs (ID, title, URL).

| Parameter | Type   | Required | Description                                  |
| --------- | ------ | -------- | -------------------------------------------- |
| profile   | string | No       | Name of the profile (default: active profile) |

### `add_tab`

Open a URL in a new tab and return its ID.

| Parameter | Type   | Required | Description                                  |
| --------- | ------ | -------- | -------------------------------------------- |
| url       | string | Yes      | URL for the tab                              |
| profile   | string | No       | Name of the profile (default: active profile) |

### `open_url`

Same as `add_tab`, without returning the tab ID.

| Parameter | Type   | Required | Description                                  |
| --------- | ------ | -------- | -------------------------------------------- |
| url       | string | Yes      | URL to open                                  |
| profile   | string | No       | Name of the profile (default: active profile) |

### `delete_tab`

Close a tab by ID, in any profile of the front window.

| Parameter | Type   | Required | Description        |
| --------- | ------ | -------- | ------------------ |
| tabId     | string | Yes      | ID of tab to close |

### `get_active_tab`

Get the ID, title, URL and profile of the active tab in the front window.

### `get_tab_content`

Get the active tab's content by injecting JavaScript. Returns markdown by default (strips nav/footer/aside), or plain text or raw HTML.

| Parameter | Type   | Required | Description                                  |
| --------- | ------ | -------- | -------------------------------------------- |
| format    | string | No       | `markdown` (default), `text`, or `html`      |

## Important Notes

1. **JavaScript needs a launch flag**: Dia refuses to run JavaScript from AppleScript unless it was started with `--enable-applescript-javascript`. There is no setting for it. Quit Dia, then start it with:

   ```bash
   open -a Dia --args --enable-applescript-javascript
   ```

2. **No pinned/folder info**: Dia lists a profile's favorites, pinned tabs and normal tabs together, in that order. It doesn't expose folders, and its `isPinned` flag reports `false` for most pinned tabs, so `list_tabs` doesn't try to tell them apart.

3. **Front window only**: All tools act on Dia's frontmost window.

4. **Closing is asynchronous**: `delete_tab` returns before Dia has finished closing the tab, so a `list_tabs` call right afterwards may still show it.

5. **No profile management**: Dia's AppleScript dictionary can't create, rename or delete profiles.

## License

MIT
