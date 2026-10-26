import { execFileSync } from "child_process";

export interface Profile {
  index: number;
  name: string;
  active: boolean;
}

export interface Tab {
  id: string;
  title: string;
  url: string;
}

export interface ProfileTabs {
  profile: string;
  tabs: Tab[];
}

// Runs a JXA script against Dia's front window. Arguments are passed as JSON via argv so URLs and
// names never need escaping; the script must return a JSON string.
function jxa<T>(body: string, args: unknown = {}): T {
  const script = `
    function run(argv) {
      const args = JSON.parse(argv[0]);
      const dia = Application("Dia");
      if (dia.windows.length === 0) throw new Error("Dia has no open windows");
      const win = dia.windows[0];
      function profileNamed(name) {
        if (!win.profiles.name().includes(name)) throw new Error("Profile not found: " + name);
        return win.profiles.byName(name);
      }
      ${body}
    }`;
  try {
    const out = execFileSync("osascript", ["-l", "JavaScript", "-e", script, JSON.stringify(args)], {
      stdio: ["ignore", "pipe", "pipe"],
    });
    return JSON.parse(out.toString()) as T;
  } catch (error) {
    const stderr = (error as { stderr?: Buffer }).stderr?.toString().trim();
    // osascript prefixes errors with "execution error: Error: Error: "; keep only the message.
    throw new Error(stderr ? stderr.replace(/^.*?Error: (Error: )?/, "").replace(/ \(-?\d+\)$/, "") : String(error));
  }
}

function attempt<T extends object>(fn: () => T): ({ success: true } & T) | { success: false; error: string } {
  try {
    return { success: true, ...fn() };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  }
}

export function listProfiles(): Profile[] {
  return jxa(`
    const active = win.activeProfile.name();
    return JSON.stringify(win.profiles.name().map((name, i) => ({ index: i + 1, name, active: name === active })));
  `);
}

export function focusProfile(name: string) {
  return attempt(() =>
    jxa<object>(`profileNamed(args.name).focus(); return "{}";`, { name })
  );
}

// Dia lists a profile's favorites, pinned tabs and normal tabs together, and its pinned flag is
// unreliable (tabs inside pinned folders report false), so no pinned/normal split is attempted.
export function listTabs(profile?: string) {
  return attempt(() =>
    jxa<ProfileTabs>(
      `
      const p = args.profile ? profileNamed(args.profile) : win.activeProfile;
      const ids = p.tabs.id(), titles = p.tabs.title(), urls = p.tabs.url();
      return JSON.stringify({
        profile: p.name(),
        tabs: ids.map((id, i) => ({ id, title: titles[i] || "", url: urls[i] || "" })),
      });
    `,
      { profile }
    )
  );
}

// New tabs land at the end of the profile, so the new ID is whichever wasn't there before.
export function addTab(url: string, profile?: string) {
  return attempt(() =>
    jxa<{ tabId: string; profile: string }>(
      `
      const p = args.profile ? profileNamed(args.profile) : win.activeProfile;
      const before = p.tabs.id();
      p.tabs.push(dia.Tab({ url: args.url }));
      const added = p.tabs.id().filter((id) => !before.includes(id));
      if (added.length !== 1) throw new Error("Could not identify the newly created tab");
      return JSON.stringify({ tabId: added[0], profile: p.name() });
    `,
      { url, profile }
    )
  );
}

export function deleteTab(tabId: string) {
  return attempt(() =>
    jxa<object>(
      `
      const name = win.profiles.name().find((n) => win.profiles.byName(n).tabs.id().includes(args.tabId));
      if (!name) throw new Error("Tab not found: " + args.tabId);
      dia.close(win.profiles.byName(name).tabs.byId(args.tabId));
      return "{}";
    `,
      { tabId }
    )
  );
}

export function getActiveTab() {
  return attempt(() => ({
    tab: jxa<Tab & { profile: string }>(`
      const t = win.activeTab;
      return JSON.stringify({ id: t.id(), title: t.title() || "", url: t.url() || "", profile: win.activeProfile.name() });
    `),
  }));
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

// Dia only allows this when launched with --enable-applescript-javascript.
export function getTabContent(format: "markdown" | "text" | "html" = "markdown") {
  const js =
    format === "text"
      ? `(document.querySelector('main,article,[role="main"]')||document.body).innerText`
      : format === "html"
        ? `(document.querySelector('main,article,[role="main"]')||document.body).innerHTML`
        : MARKDOWN_JS;
  return attempt(() => ({
    content: jxa<string>(`return JSON.stringify(String(dia.execute(win.activeTab, { javascript: args.js }) ?? ""));`, { js }),
  }));
}
