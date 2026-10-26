#!/usr/bin/env node
import { listProfiles, listTabs, addTab, deleteTab, getActiveTab } from "./src/dia.js";

const profileArg = process.argv[2];
if (!profileArg) {
  console.error("usage: npx tsx test.ts <profile-name>");
  console.error("  uses the given profile as a throwaway target — tabs will be added and closed");
  process.exit(1);
}

const target = listProfiles().find((p) => p.name === profileArg);
if (!target) {
  console.error(`profile not found: ${profileArg}`);
  process.exit(1);
}
console.log(`testing against profile: "${target.name}"\n`);

let pass = 0;
let fail = 0;

function check(name: string, fn: () => void) {
  try {
    fn();
    console.log(`  ok   ${name}`);
    pass++;
  } catch (e) {
    console.log(`  FAIL ${name}`);
    console.log(`         ${e instanceof Error ? e.message : String(e)}`);
    fail++;
  }
}

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}

function tabIds(): string[] {
  const r = listTabs(target.name);
  assert(r.success, `listTabs failed: ${!r.success && r.error}`);
  return r.tabs.map((t) => t.id);
}

// Dia closes tabs asynchronously, a moment after the close command returns.
function waitUntilGone(tabId: string): boolean {
  for (let i = 0; i < 20; i++) {
    if (!tabIds().includes(tabId)) return true;
    Bun.sleepSync(100);
  }
  return false;
}

function addAndClose(url: string) {
  const r = addTab(url, target.name);
  assert(r.success, `addTab failed: ${!r.success && r.error}`);
  const d = deleteTab(r.tabId);
  assert(d.success, `deleteTab failed: ${!d.success && d.error}`);
  assert(waitUntilGone(r.tabId), "tab still present after delete");
}

check("listProfiles marks exactly one active profile", () => {
  assert(listProfiles().filter((p) => p.active).length === 1, "expected one active profile");
});

check("round-trip add + delete", () => {
  const r = addTab("https://example.com/round-trip", target.name);
  assert(r.success, `addTab failed: ${!r.success && r.error}`);
  assert(r.profile === target.name, `tab landed in "${r.profile}"`);
  assert(tabIds().includes(r.tabId), "tab missing after add");
  const d = deleteTab(r.tabId);
  assert(d.success, `deleteTab failed: ${!d.success && d.error}`);
  assert(waitUntilGone(r.tabId), "tab still present after delete");
});

check("URL with single quote in path", () => addAndClose("https://example.com/it's-fine?a=1"));

check("URL with double quote in query", () => addAndClose('https://example.com/?q="hello"'));

check("getActiveTab returns a tab with an ID", () => {
  const r = getActiveTab();
  assert(r.success && r.tab.id, `getActiveTab failed: ${!r.success && r.error}`);
});

check("addTab to nonexistent profile returns error", () => {
  const r = addTab("https://example.com", "__definitely_not_a_real_profile__");
  assert(!r.success, "expected failure");
  assert(r.error.includes("not found"), `expected 'not found' error, got: ${r.error}`);
});

check("deleteTab with bogus ID returns error", () => {
  const r = deleteTab("00000000-0000-0000-0000-000000000000");
  assert(!r.success, "expected failure");
});

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail > 0 ? 1 : 0);
