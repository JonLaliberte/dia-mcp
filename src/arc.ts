import { execSync } from "child_process";
import { readFileSync, writeFileSync, copyFileSync } from "fs";
import { homedir } from "os";
import { join } from "path";
import { randomUUID } from "crypto";

const ARC_DIR = join(homedir(), "Library/Application Support/Arc");
const SIDEBAR_FILE = join(ARC_DIR, "StorableSidebar.json");

export interface Space {
  id: string;
  title: string;
  icon?: string;
}

export interface Tab {
  id: string;
  title: string;
  url: string;
}

export interface Folder {
  id: string;
  title: string;
  children: Array<Tab | Folder>;
}

export interface SpaceTabs {
  spaceId: string;
  spaceTitle: string;
  pinned: Array<Tab | Folder>;
  unpinned: Array<Tab | Folder>;
}

interface SidebarData {
  sidebar: {
    containers: Array<{
      spaces?: Array<string | SpaceObject>;
      items?: Array<string | ItemObject>;
    }>;
  };
  sidebarSyncState?: {
    container?: {
      value?: {
        orderedSpaceIDs?: string[];
      };
    };
    spaceModels?: Array<string | { encodedCKRecordFields?: string | null; value: SpaceObject }>;
  };
  firebaseSyncState?: {
    syncData?: {
      orderedSpaceIDs?: {
        value?: string[];
        lastChangeDate?: number;
        lastChangedDevice?: string;
      };
      spaceModels?: Array<string | { id: string; lastChangeDate: number; lastChangedDevice: string; value: SpaceObject }>;
      items?: Array<string | { id: string; lastChangeDate: number; lastChangedDevice: string; value: ItemObject }>;
    };
  };
}

interface SpaceObject {
  id: string;
  title: string;
  profile?: { default: boolean };
  containerIDs?: string[];
  newContainerIDs?: Array<{ pinned?: object } | { unpinned?: { _0?: { shared?: object } } } | string>;
  customInfo?: {
    iconType?: { emoji?: string; icon?: string };
    windowTheme?: object;
  };
}

interface ItemObject {
  id: string;
  title?: string | null;
  parentID?: string | null;
  childrenIds?: string[];
  createdAt?: number;
  originatingDevice?: string;
  isUnread?: boolean;
  data?: {
    tab?: {
      savedURL?: string;
      savedTitle?: string;
      savedMuteStatus?: string;
      timeLastActiveAt?: number;
    };
    itemContainer?: {
      containerType?: {
        spaceItems?: { _0?: string };
      };
    };
  };
}

function loadSidebar(): SidebarData {
  const content = readFileSync(SIDEBAR_FILE, "utf-8");
  return JSON.parse(content) as SidebarData;
}

function saveSidebar(data: SidebarData): void {
  writeFileSync(SIDEBAR_FILE, JSON.stringify(data, null, 2));
}

function createBackup(): string {
  const timestamp = Date.now();
  const backupFile = join(ARC_DIR, `StorableSidebar.backup.${timestamp}.json`);
  copyFileSync(SIDEBAR_FILE, backupFile);
  return backupFile;
}

function getDeviceId(data: SidebarData): string {
  let deviceId = data.firebaseSyncState?.syncData?.orderedSpaceIDs?.lastChangedDevice || "";

  if (!deviceId) {
    const items = data.sidebar?.containers?.[1]?.items || [];
    for (const item of items) {
      if (typeof item === "object" && item.originatingDevice) {
        deviceId = item.originatingDevice;
        break;
      }
    }
  }

  return deviceId;
}

export function listSpaces(): Space[] {
  const data = loadSidebar();
  const spaces: Space[] = [];
  const spaceItems = data.sidebar?.containers?.[1]?.spaces || [];

  for (const item of spaceItems) {
    if (typeof item === "object" && item.id && item.title) {
      const iconType = item.customInfo?.iconType;
      const icon = iconType?.emoji || iconType?.icon;
      spaces.push({
        id: item.id,
        title: item.title,
        icon,
      });
    }
  }

  return spaces;
}

export function createSpace(name: string, icon: string = "star"): { success: boolean; spaceId?: string; error?: string } {
  try {
    const data = loadSidebar();
    createBackup();

    const spaceId = randomUUID().toUpperCase();
    const pinnedId = randomUUID().toUpperCase();
    const unpinnedId = randomUUID().toUpperCase();
    const ts = Date.now() / 1000;
    const deviceId = getDeviceId(data);

    // Get theme from existing space
    const existingSpaces = data.sidebar?.containers?.[1]?.spaces || [];
    let theme: object | undefined;
    for (const s of existingSpaces) {
      if (typeof s === "object" && s.customInfo?.windowTheme) {
        theme = s.customInfo.windowTheme;
        break;
      }
    }

    if (!theme) {
      return { success: false, error: "Could not find theme template from existing spaces" };
    }

    // Build icon object
    const iconObj = icon.includes(".") ? { icon } : { emoji: icon };

    // Build space object
    const spaceObj: SpaceObject = {
      id: spaceId,
      title: name,
      profile: { default: true },
      containerIDs: ["pinned", pinnedId, "unpinned", unpinnedId],
      newContainerIDs: [
        { pinned: {} },
        pinnedId,
        { unpinned: { _0: { shared: {} } } },
        unpinnedId,
      ],
      customInfo: {
        iconType: iconObj,
        windowTheme: theme,
      },
    };

    // Build container base
    const contBase: Omit<ItemObject, "id"> = {
      title: null,
      parentID: null,
      childrenIds: [],
      createdAt: ts,
      originatingDevice: deviceId,
      isUnread: false,
      data: {
        itemContainer: {
          containerType: {
            spaceItems: { _0: spaceId },
          },
        },
      },
    };

    const pinnedCont: ItemObject = { ...contBase, id: pinnedId };
    const unpinnedCont: ItemObject = { ...contBase, id: unpinnedId };

    // 1. sidebar.containers[1].spaces
    data.sidebar.containers[1].spaces = data.sidebar.containers[1].spaces || [];
    data.sidebar.containers[1].spaces.push(spaceId);
    data.sidebar.containers[1].spaces.push(spaceObj);

    // 2. sidebar.containers[1].items
    data.sidebar.containers[1].items = data.sidebar.containers[1].items || [];
    data.sidebar.containers[1].items.push(pinnedId);
    data.sidebar.containers[1].items.push(pinnedCont);
    data.sidebar.containers[1].items.push(unpinnedId);
    data.sidebar.containers[1].items.push(unpinnedCont);

    // 3. sidebarSyncState.container.value.orderedSpaceIDs
    if (data.sidebarSyncState?.container?.value?.orderedSpaceIDs) {
      data.sidebarSyncState.container.value.orderedSpaceIDs.push(spaceId);
    }

    // 4. sidebarSyncState.spaceModels
    if (data.sidebarSyncState?.spaceModels) {
      data.sidebarSyncState.spaceModels.push(spaceId);
      data.sidebarSyncState.spaceModels.push({
        encodedCKRecordFields: null,
        value: spaceObj,
      });
    }

    // 5. firebaseSyncState.syncData.orderedSpaceIDs
    const syncData = data.firebaseSyncState?.syncData;
    if (syncData?.orderedSpaceIDs) {
      syncData.orderedSpaceIDs.value = syncData.orderedSpaceIDs.value || [];
      syncData.orderedSpaceIDs.value.push(spaceId);
      syncData.orderedSpaceIDs.lastChangeDate = ts;
      syncData.orderedSpaceIDs.lastChangedDevice = deviceId;
    }

    // 6. firebaseSyncState.syncData.spaceModels
    if (syncData?.spaceModels) {
      syncData.spaceModels.push(spaceId);
      syncData.spaceModels.push({
        id: spaceId,
        lastChangeDate: ts,
        lastChangedDevice: deviceId,
        value: spaceObj,
      });
    }

    // 7. firebaseSyncState.syncData.items
    if (syncData?.items) {
      syncData.items.push(pinnedId);
      syncData.items.push({
        id: pinnedId,
        lastChangeDate: ts,
        lastChangedDevice: deviceId,
        value: pinnedCont,
      });
      syncData.items.push(unpinnedId);
      syncData.items.push({
        id: unpinnedId,
        lastChangeDate: ts,
        lastChangedDevice: deviceId,
        value: unpinnedCont,
      });
    }

    saveSidebar(data);
    return { success: true, spaceId };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  }
}

export function deleteSpace(spaceNameOrId: string): { success: boolean; error?: string } {
  try {
    const data = loadSidebar();
    createBackup();

    // Find the space
    const spaces = data.sidebar?.containers?.[1]?.spaces || [];
    let spaceId: string | undefined;
    let spaceIndex = -1;

    for (let i = 0; i < spaces.length; i++) {
      const item = spaces[i];
      if (typeof item === "object") {
        if (item.id === spaceNameOrId || item.title === spaceNameOrId) {
          spaceId = item.id;
          spaceIndex = i;
          break;
        }
      }
    }

    if (!spaceId || spaceIndex === -1) {
      return { success: false, error: `Space not found: ${spaceNameOrId}` };
    }

    // Get container IDs for this space
    const spaceObj = spaces[spaceIndex] as SpaceObject;
    const containerIds = spaceObj.containerIDs?.filter((id) => id !== "pinned" && id !== "unpinned") || [];

    // Remove from sidebar.containers[1].spaces (remove both the ID string and the object)
    const newSpaces: Array<string | SpaceObject> = [];
    for (const item of spaces) {
      if (typeof item === "string" && item === spaceId) continue;
      if (typeof item === "object" && item.id === spaceId) continue;
      newSpaces.push(item);
    }
    data.sidebar.containers[1].spaces = newSpaces;

    // Remove containers and their children from items
    const items = data.sidebar?.containers?.[1]?.items || [];
    const itemsToRemove = new Set(containerIds);

    // Find all children of the containers (tabs, folders, etc.)
    for (const item of items) {
      if (typeof item === "object" && item.parentID && containerIds.includes(item.parentID)) {
        itemsToRemove.add(item.id);
      }
    }

    const newItems: Array<string | ItemObject> = [];
    for (const item of items) {
      if (typeof item === "string" && itemsToRemove.has(item)) continue;
      if (typeof item === "object" && itemsToRemove.has(item.id)) continue;
      newItems.push(item);
    }
    data.sidebar.containers[1].items = newItems;

    // Remove from sidebarSyncState
    if (data.sidebarSyncState?.container?.value?.orderedSpaceIDs) {
      data.sidebarSyncState.container.value.orderedSpaceIDs =
        data.sidebarSyncState.container.value.orderedSpaceIDs.filter((id) => id !== spaceId);
    }

    if (data.sidebarSyncState?.spaceModels) {
      data.sidebarSyncState.spaceModels = data.sidebarSyncState.spaceModels.filter((item) => {
        if (typeof item === "string") return item !== spaceId;
        return item.value?.id !== spaceId;
      });
    }

    // Remove from firebaseSyncState
    const syncData = data.firebaseSyncState?.syncData;
    if (syncData?.orderedSpaceIDs?.value) {
      syncData.orderedSpaceIDs.value = syncData.orderedSpaceIDs.value.filter((id) => id !== spaceId);
    }

    if (syncData?.spaceModels) {
      syncData.spaceModels = syncData.spaceModels.filter((item) => {
        if (typeof item === "string") return item !== spaceId;
        return item.id !== spaceId;
      });
    }

    if (syncData?.items) {
      syncData.items = syncData.items.filter((item) => {
        if (typeof item === "string") return !itemsToRemove.has(item);
        return !itemsToRemove.has(item.id);
      });
    }

    saveSidebar(data);
    return { success: true };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  }
}

export function focusSpace(spaceNameOrId: string): { success: boolean; error?: string } {
  try {
    // First, find the space to get its exact title
    const spaces = listSpaces();
    const space = spaces.find((s) => s.id === spaceNameOrId || s.title === spaceNameOrId);

    if (!space) {
      return { success: false, error: `Space not found: ${spaceNameOrId}` };
    }

    const script = `
      tell application "Arc"
        tell front window
          tell space "${space.title}" to focus
        end tell
      end tell
    `;

    execSync(`osascript -e '${script.replace(/'/g, "'\\''")}'`);
    return { success: true };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  }
}

export function listTabs(spaceNameOrId?: string): SpaceTabs | null {
  const data = loadSidebar();
  const spaces = data.sidebar?.containers?.[1]?.spaces || [];
  const items = data.sidebar?.containers?.[1]?.items || [];

  // Build item map for quick lookup
  const itemMap = new Map<string, ItemObject>();
  for (const item of items) {
    if (typeof item === "object") {
      itemMap.set(item.id, item);
    }
  }

  // Find the target space
  let targetSpace: SpaceObject | undefined;
  for (const item of spaces) {
    if (typeof item === "object") {
      if (!spaceNameOrId || item.id === spaceNameOrId || item.title === spaceNameOrId) {
        targetSpace = item;
        break;
      }
    }
  }

  if (!targetSpace) {
    return null;
  }

  // Get container IDs (first is pinned, second is unpinned)
  const containerIDs = (targetSpace.containerIDs || []).filter((id) => id !== "pinned" && id !== "unpinned");
  const pinnedContainerId = containerIDs[0];
  const unpinnedContainerId = containerIDs[1];

  // Helper to determine item type
  function getItemType(item: ItemObject): "tab" | "folder" | "container" {
    if (item.data?.tab) return "tab";
    if (item.data?.itemContainer) return "container";
    if (item.childrenIds && item.childrenIds.length > 0) return "folder";
    return "folder"; // Empty folder
  }

  // Recursively build tree structure
  function buildTree(itemId: string): Tab | Folder | null {
    const item = itemMap.get(itemId);
    if (!item) return null;

    const itemType = getItemType(item);

    if (itemType === "tab") {
      return {
        id: item.id,
        title: item.data?.tab?.savedTitle || item.data?.tab?.savedURL || "Untitled",
        url: item.data?.tab?.savedURL || "",
      };
    }

    if (itemType === "folder") {
      const children: Array<Tab | Folder> = [];
      for (const childId of item.childrenIds || []) {
        const child = buildTree(childId);
        if (child) children.push(child);
      }
      return {
        id: item.id,
        title: item.title || "Untitled",
        children,
      };
    }

    return null;
  }

  // Build pinned items
  const pinned: Array<Tab | Folder> = [];
  const pinnedContainer = itemMap.get(pinnedContainerId);
  if (pinnedContainer) {
    for (const childId of pinnedContainer.childrenIds || []) {
      const child = buildTree(childId);
      if (child) pinned.push(child);
    }
  }

  // Build unpinned items
  const unpinned: Array<Tab | Folder> = [];
  const unpinnedContainer = itemMap.get(unpinnedContainerId);
  if (unpinnedContainer) {
    for (const childId of unpinnedContainer.childrenIds || []) {
      const child = buildTree(childId);
      if (child) unpinned.push(child);
    }
  }

  return {
    spaceId: targetSpace.id,
    spaceTitle: targetSpace.title,
    pinned,
    unpinned,
  };
}

function escapeAppleScriptString(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

// Arc wraps execute-javascript string results in "..." with \" for inner quotes.
function unquoteJsResult(s: string): string {
  if (s.length >= 2 && s.startsWith('"') && s.endsWith('"')) {
    return s.slice(1, -1).replace(/\\"/g, '"').replace(/\\\\/g, "\\");
  }
  return s;
}

function runAppleScript(script: string): string {
  return execSync(`osascript -e '${script.replace(/'/g, "'\\''")}'`).toString().trim();
}

export function addTab(
  spaceNameOrId: string,
  url: string
): { success: boolean; tabId?: string; error?: string } {
  try {
    const space = listSpaces().find((s) => s.id === spaceNameOrId || s.title === spaceNameOrId);
    if (!space) {
      return { success: false, error: `Space not found: ${spaceNameOrId}` };
    }

    const safeTitle = escapeAppleScriptString(space.title);
    const safeUrl = escapeAppleScriptString(url);

    const script = `
      tell application "Arc"
        tell front window
          set beforeIds to (id of every tab) as list
          tell space "${safeTitle}"
            make new tab with properties {URL:"${safeUrl}"}
          end tell
          set afterIds to (id of every tab) as list
          repeat with idx from 1 to count of afterIds
            set candidate to (item idx of afterIds) as string
            if beforeIds does not contain candidate then return candidate
          end repeat
          error "Could not identify newly created tab"
        end tell
      end tell
    `;

    const tabId = runAppleScript(script);
    return { success: true, tabId };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  }
}

function findTabIndex(tabId: string): number {
  const out = runAppleScript(`tell application "Arc" to tell front window to return (id of every tab) as list`);
  const ids = out ? out.split(", ") : [];
  const i = ids.indexOf(tabId);
  return i < 0 ? -1 : i + 1;
}

export function deleteTab(tabId: string): { success: boolean; error?: string } {
  try {
    const idx = findTabIndex(tabId);
    if (idx < 0) return { success: false, error: `Tab not found: ${tabId}` };
    runAppleScript(`tell application "Arc" to tell front window to close tab ${idx}`);
    return { success: true };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  }
}

export function getActiveTab(): { success: boolean; tab?: { id: string; title: string; url: string }; error?: string } {
  try {
    // Accessing properties of a stored `active tab` specifier fails with -1700 in Arc.
    // Use JS injection for URL/title (always works), then match against the tab list for the ID.
    const url = unquoteJsResult(runAppleScript(
      `tell application "Arc" to tell front window to execute active tab javascript "window.location.href"`
    ));
    const title = unquoteJsResult(runAppleScript(
      `tell application "Arc" to tell front window to execute active tab javascript "document.title"`
    ));
    const idsRaw = runAppleScript(
      `tell application "Arc" to tell front window to return (id of every tab) as list`
    );
    const urlsRaw = runAppleScript(
      `tell application "Arc" to tell front window to return (URL of every tab) as list`
    );
    const ids = idsRaw ? idsRaw.split(", ") : [];
    const urls = urlsRaw ? urlsRaw.split(", ") : [];
    const idx = urls.indexOf(url);
    const id = idx >= 0 ? ids[idx] : "";
    return { success: true, tab: { id, title, url } };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  }
}

const MARKDOWN_JS =
  `(function(){var NL=String.fromCharCode(10);var B3=String.fromCharCode(96,96,96);` +
  `function t(n){if(!n)return '';if(n.nodeType===3)return n.textContent;if(n.nodeType!==1)return '';` +
  `var g=n.tagName.toLowerCase();` +
  `if(['script','style','nav','aside','noscript','footer','header'].indexOf(g)>=0)return '';` +
  `var c=Array.from(n.childNodes).map(t).join('');` +
  `if(g==='h1')return NL+'# '+c.trim()+NL;` +
  `if(g==='h2')return NL+'## '+c.trim()+NL;` +
  `if(g==='h3')return NL+'### '+c.trim()+NL;` +
  `if(g==='h4')return NL+'#### '+c.trim()+NL;` +
  `if(g==='h5')return NL+'##### '+c.trim()+NL;` +
  `if(g==='h6')return NL+'###### '+c.trim()+NL;` +
  `if(g==='p')return NL+c.trim()+NL;` +
  `if(g==='br')return NL;` +
  `if(g==='hr')return NL+'---'+NL;` +
  `if(g==='strong'||g==='b')return '**'+c.trim()+'**';` +
  `if(g==='em'||g==='i')return '*'+c.trim()+'*';` +
  `if(g==='code')return n.parentElement&&n.parentElement.tagName==='PRE'?c:String.fromCharCode(96)+c+String.fromCharCode(96);` +
  `if(g==='pre')return NL+B3+NL+n.textContent.trim()+NL+B3+NL;` +
  `if(g==='a'&&n.href)return '['+c+']('+n.href+')';` +
  `if(g==='li')return '- '+c.trim()+NL;` +
  `if(g==='ul'||g==='ol')return NL+c+NL;` +
  `if(g==='blockquote')return c.split(NL).map(function(l){return '> '+l;}).join(NL);` +
  `if(g==='img')return n.alt?'!['+n.alt+']('+n.src+')':'';` +
  `return c;}` +
  `var r=document.querySelector('main,article,[role="main"]')||document.body;` +
  `var m=t(r);var prev='';` +
  `while(prev!==m){prev=m;m=m.split(NL+NL+NL).join(NL+NL);}` +
  `m=m.trim();` +
  `return m.length>50000?m.substring(0,50000)+NL+'...(truncated)':m;` +
  `})()`;

export function getTabContent(
  format: "markdown" | "text" | "html" = "markdown"
): { success: boolean; content?: string; error?: string } {
  try {
    let js: string;
    if (format === "text") {
      js = `(document.querySelector('main,article,[role="main"]')||document.body).innerText`;
    } else if (format === "html") {
      js = `(document.querySelector('main,article,[role="main"]')||document.body).innerHTML`;
    } else {
      js = MARKDOWN_JS;
    }

    const safeJs = escapeAppleScriptString(js);
    const raw = runAppleScript(
      `tell application "Arc" to tell front window to execute active tab javascript "${safeJs}"`
    );
    return { success: true, content: unquoteJsResult(raw) };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  }
}

export function openUrl(url: string, spaceNameOrId?: string): { success: boolean; error?: string } {
  try {
    let script: string;

    if (spaceNameOrId) {
      const spaces = listSpaces();
      const space = spaces.find((s) => s.id === spaceNameOrId || s.title === spaceNameOrId);

      if (!space) {
        return { success: false, error: `Space not found: ${spaceNameOrId}` };
      }

      script = `
        tell application "Arc"
          tell front window
            tell space "${space.title}"
              make new tab with properties {URL:"${url}"}
            end tell
          end tell
        end tell
      `;
    } else {
      script = `
        tell application "Arc"
          tell front window
            make new tab with properties {URL:"${url}"}
          end tell
        end tell
      `;
    }

    execSync(`osascript -e '${script.replace(/'/g, "'\\''")}'`);
    return { success: true };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  }
}

