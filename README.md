# arc-mcp

MCP (Model Context Protocol) server for Arc browser. Manage spaces and tabs programmatically.

## Features

- **List spaces** - Get all Arc browser spaces
- **Create space** - Create new spaces with custom names and icons (file I/O — requires restart)
- **Delete space** - Remove spaces (file I/O — requires restart)
- **Focus space** - Switch to a specific space (AppleScript)
- **List tabs** - Get tabs from all spaces or a specific space
- **Add tab** - Add a tab to a space (AppleScript — immediate)
- **Delete tab** - Close a tab (AppleScript — immediate)
- **Open URL** - Open URLs in Arc immediately (AppleScript)

## Requirements

- macOS (Arc browser is macOS-only)
- Arc browser installed
- **Arc Sync must be disabled** for `create_space` / `delete_space` to persist (tab operations are unaffected)

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
    "arc": {
      "command": "npx",
      "args": ["tsx", "/path/to/arc-mcp/src/index.ts"]
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

## Tools

### `list_spaces`

List all Arc browser spaces.

### `create_space`

Create a new space. Requires Arc restart to take effect, and Arc Sync must be disabled or the change will be overwritten.

| Parameter | Type   | Required | Description                                    |
| --------- | ------ | -------- | ---------------------------------------------- |
| name      | string | Yes      | Name of the new space                          |
| icon      | string | No       | Emoji or SF Symbol name (default: "star")      |

### `delete_space`

Delete a space. Requires Arc restart to take effect, and Arc Sync must be disabled.

| Parameter | Type   | Required | Description                    |
| --------- | ------ | -------- | ------------------------------ |
| space     | string | Yes      | Name or ID of space to delete  |

### `focus_space`

Switch to a space (uses AppleScript).

| Parameter | Type   | Required | Description                   |
| --------- | ------ | -------- | ----------------------------- |
| space     | string | Yes      | Name or ID of space to focus  |

### `list_tabs`

List tabs, optionally filtered by space.

| Parameter | Type   | Required | Description                         |
| --------- | ------ | -------- | ----------------------------------- |
| space     | string | No       | Name or ID of space to filter by    |

### `add_tab`

Add a tab to a space (uses AppleScript). Takes effect immediately. Tab title is set by the page once it loads. Tab is always added unpinned — Arc's AppleScript dictionary advertises a writable `location` property but the implementation rejects writes, so pinning has to be done manually (Cmd+D or right-click → Pin).

| Parameter | Type   | Required | Description         |
| --------- | ------ | -------- | ------------------- |
| space     | string | Yes      | Name or ID of space |
| url       | string | Yes      | URL for the tab     |

### `delete_tab`

Close a tab by ID (uses AppleScript). Takes effect immediately. Only finds tabs in the front Arc window.

| Parameter | Type   | Required | Description        |
| --------- | ------ | -------- | ------------------ |
| tabId     | string | Yes      | ID of tab to close |

### `open_url`

Open a URL immediately in Arc (uses AppleScript).

| Parameter | Type   | Required | Description                    |
| --------- | ------ | -------- | ------------------------------ |
| url       | string | Yes      | URL to open                    |
| space     | string | No       | Space to open the URL in       |

## Important Notes

1. **Arc Sync**: `create_space` and `delete_space` write to Arc's local sidebar JSON. If Arc Sync is enabled, the sync engine will overwrite those changes with the cloud copy on the next reconciliation. Tab operations go through AppleScript and are unaffected.

2. **Restart Required**: `create_space` / `delete_space` require restarting Arc to take effect. Tab operations are immediate.

3. **Backup**: The server automatically creates a timestamped backup of `StorableSidebar.json` before any space modification.

4. **Front window only**: AppleScript-based tab operations (`add_tab`, `delete_tab`, `open_url`) target Arc's frontmost window. If you have multiple Arc windows, a tab in a background window won't be found.

## How It Works

Arc stores its sidebar data in `~/Library/Application Support/Arc/StorableSidebar.json`. For space management, this server reads and modifies that file directly — there is no AppleScript API to create or delete spaces.

For tab management and live navigation (add/close tab, focus space, open URL), it uses AppleScript via `osascript` to drive Arc directly.

## License

MIT
