# Agent Note: Shared Scheduler Slot Symbol Across Duplicate Module Evaluations

Status: implemented

English | [中文](2026-09-21-scheduler-slot-shared-symbol.zh.md)

## Problem

Web-server turns failed before dispatch with `TOOL_SCHEDULER_UNAVAILABLE` and `schedulerSlot: foreign`: `ctx.tools` was a genuine `ToolRuntime`, but the scheduler slot symbol on the instance differed from the symbol the agent loop imported. A per-evaluation `Symbol()` can only diverge this way when two evaluations of `dsh-tools` coexist in one process (source versus built copies, or two loader routes), so the loop read an absent slot on a healthy registry.

## Decision

`TOOL_RUNTIME_SCHEDULER` now comes from the global symbol registry (`Symbol.for`) instead of a per-evaluation `Symbol()`. Every evaluation of the module produces the same key, so the loop finds the scheduler regardless of which copy constructed the registry. The scheduler object itself stays per-instance and all instance behavior stays within its own copy, so no other touchpoint crosses the copy boundary: production performs no `instanceof ToolRuntime` checks, and tool error identity travels as string codes. The `foreign` detector in the loop is unchanged and still reports hand-made same-description symbols.

## Alternatives considered

**Force a single module evaluation.** Converging every loader route (profile fallback links, tsconfig-paths mapping, built `lib/` exports) on one file URL depends on deployment resolution behavior outside this package and re-breaks with each new route; the shared key holds regardless of route.

**Remount the tools plugin on mismatch.** Disposing and rebuilding the registry mid-turn would drop already-registered tools and session-attached policy state; the failure happens before any `tool/call` is committed, but the registry it rejects is fully functional.

**Key the slot by string.** A string key on the service object risks collision with Cordis internals and future service members; the registry symbol keeps its own namespace while sharing identity.

## Consequences

Duplicate evaluations remain possible and still waste one module record, but they no longer fail turns: the slot read is copy-transparent and the remaining cross-copy surface is structural (same method names, string codes, plain-data events), never identity. Regression tests pin the registry identity at both ends — the export equals `Symbol.for` of its description, and the loop runs a batch against a tools object keyed by an independently obtained registry symbol.
