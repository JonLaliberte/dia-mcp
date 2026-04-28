#!/usr/bin/env node
import { execSync } from "child_process";
import { listSpaces, addTab, deleteTab } from "./src/arc.js";

const spaceArg = process.argv[2];
if (!spaceArg) {
  console.error("usage: npx tsx test.ts <space-name-or-id>");
  console.error("  uses the given space as a throwaway target — tabs will be added and deleted");
  process.exit(1);
}

const target = listSpaces().find((s) => s.id === spaceArg || s.title === spaceArg);
if (!target) {
  console.error(`space not found: ${spaceArg}`);
  process.exit(1);
}
console.log(`testing against space: "${target.title}" (${target.id})\n`);

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

function osa(script: string): string {
  return execSync(`osascript -e '${script.replace(/'/g, "'\\''")}'`).toString().trim();
}

function windowTabIds(): string[] {
  const out = osa(`tell application "Arc" to tell front window to return (id of every tab) as list`);
  return out ? out.split(", ") : [];
}

check("round-trip add + delete", () => {
  const r = addTab(target.title, "https://example.com/round-trip");
  assert(r.success && r.tabId, `addTab failed: ${r.error}`);
  assert(windowTabIds().includes(r.tabId), "tab missing after add");
  const d = deleteTab(r.tabId);
  assert(d.success, `deleteTab failed: ${d.error}`);
  assert(!windowTabIds().includes(r.tabId), "tab still present after delete");
});

check("space lookup by ID works", () => {
  const r = addTab(target.id, "https://example.com/by-id");
  assert(r.success && r.tabId, `addTab by ID failed: ${r.error}`);
  deleteTab(r.tabId);
});

check("URL with single quote in path", () => {
  const r = addTab(target.title, "https://example.com/it's-fine?a=1");
  assert(r.success && r.tabId, `addTab failed: ${r.error}`);
  deleteTab(r.tabId);
});

check("URL with double quote in query", () => {
  const r = addTab(target.title, 'https://example.com/?q="hello"');
  assert(r.success && r.tabId, `addTab failed: ${r.error}`);
  deleteTab(r.tabId);
});

check("addTab to nonexistent space returns error", () => {
  const r = addTab("__definitely_not_a_real_space__", "https://example.com");
  assert(!r.success, "expected failure");
  assert(r.error?.includes("not found"), `expected 'not found' error, got: ${r.error}`);
});

check("deleteTab with bogus ID returns error", () => {
  const r = deleteTab("00000000-0000-0000-0000-000000000000");
  assert(!r.success, "expected failure");
});

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail > 0 ? 1 : 0);
