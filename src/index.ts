#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import {
  listProfiles,
  focusProfile,
  listTabs,
  addTab,
  deleteTab,
  getActiveTab,
  getTabContent,
} from "./dia.js";

const server = new McpServer({
  name: "dia-mcp",
  version: "2.0.0",
});

function text(t: string) {
  return { content: [{ type: "text" as const, text: t }] };
}

// Tool: List profiles
server.tool(
  "list_profiles",
  "List the Dia browser profiles in the front window, in sidebar order, marking the active one.",
  {},
  async () => {
    try {
      return text(JSON.stringify(listProfiles(), null, 2));
    } catch (error) {
      return text(`Failed to list profiles: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
);

// Tool: Focus profile
server.tool(
  "focus_profile",
  "Switch Dia's front window to a profile by name.",
  {
    profile: z.string().describe("Name of the profile to focus"),
  },
  async ({ profile }) => {
    const result = focusProfile(profile);
    return text(result.success ? `Switched to profile "${profile}"` : `Failed to focus profile: ${result.error}`);
  }
);

// Tool: List tabs
server.tool(
  "list_tabs",
  "List the tabs in a Dia profile (ID, title, URL). Favorites, pinned tabs and normal tabs are listed together in that order; Dia doesn't expose folders or a reliable pinned flag.",
  {
    profile: z.string().optional().describe("Name of the profile (optional, defaults to the active profile)"),
  },
  async ({ profile }) => {
    const result = listTabs(profile);
    if (!result.success) return text(`Failed to list tabs: ${result.error}`);
    const { success, ...tabs } = result;
    return text(JSON.stringify(tabs, null, 2));
  }
);

// Tool: Add tab
server.tool(
  "add_tab",
  "Open a URL in a new Dia tab, in the given profile or the active one. Takes effect immediately.",
  {
    url: z.string().url().describe("URL for the new tab"),
    profile: z.string().optional().describe("Name of the profile to add the tab to (optional, defaults to the active profile)"),
  },
  async ({ url, profile }) => {
    const result = addTab(url, profile);
    return text(
      result.success
        ? `Opened ${url} in profile "${result.profile}" (tab ID: ${result.tabId}).`
        : `Failed to add tab: ${result.error}`
    );
  }
);

// Tool: Open URL
server.tool(
  "open_url",
  "Open a URL in Dia immediately, in the given profile or the active one.",
  {
    url: z.string().url().describe("URL to open"),
    profile: z.string().optional().describe("Name of the profile to open the URL in (optional)"),
  },
  async ({ url, profile }) => {
    const result = addTab(url, profile);
    return text(result.success ? `Opened ${url} in profile "${result.profile}"` : `Failed to open URL: ${result.error}`);
  }
);

// Tool: Delete tab
server.tool(
  "delete_tab",
  "Close a Dia tab by its ID, in any profile of the front window. Takes effect immediately.",
  {
    tabId: z.string().describe("ID of the tab to close"),
  },
  async ({ tabId }) => {
    const result = deleteTab(tabId);
    return text(result.success ? "Tab closed." : `Failed to close tab: ${result.error}`);
  }
);

// Tool: Get active tab
server.tool(
  "get_active_tab",
  "Get the ID, title, URL and profile of the active tab in Dia's front window.",
  {},
  async () => {
    const result = getActiveTab();
    return text(result.success ? JSON.stringify(result.tab, null, 2) : `Failed to get active tab: ${result.error}`);
  }
);

// Tool: Get tab content
server.tool(
  "get_tab_content",
  "Get the content of the active tab in Dia's front window by injecting JavaScript. Returns markdown by default (strips nav/footer/aside), or plain text or raw HTML. Requires Dia to be launched with --enable-applescript-javascript.",
  {
    format: z
      .enum(["markdown", "text", "html"])
      .optional()
      .default("markdown")
      .describe("Output format: markdown (default), text (innerText), or html (innerHTML)"),
  },
  async ({ format }) => {
    const result = getTabContent(format);
    return text(result.success ? result.content : `Failed to get tab content: ${result.error}`);
  }
);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Dia MCP server running on stdio");
}

main().catch((error) => {
  console.error("Server error:", error);
  process.exit(1);
});
