# Agent Note: Slot entry boundaries self-heal DOM desync crashes

Status: implemented

English | [中文](2026-08-16-slot-boundary-dom-desync-recovery.zh.md)

## Problem

A user session logs `NotFoundError: Failed to execute 'removeChild' on 'Node': The node to be removed is not a child of this node.` at [scoped-slots.tsx](../../../../packages/client/web-react/src/scoped-slots.tsx) line 326, framed as `slot entry crashed in 'conversation.composer.bar'`. The message is `SlotErrorBoundary.componentDidCatch`, so the crash was contained — the app survived — but the composer bar did not. The bar is a `single`-kind slot with exactly one registration, and the boundary's crash report abdicated that registration (`reportEntryError(..., { abdicate: true })` for non-chain kinds), so `entriesOfSlot` returned no survivor and the outlet rendered the permanent crash face `<div data-slot-error="conversation.composer.bar" />`. The user's input UI stayed blank until the entry re-registered (HMR) or the page reloaded.

The thrown `NotFoundError` is React's own DOM bookkeeping losing sync with the real DOM: React tried to remove a node that was no longer a child of its recorded parent. The registrant's component did not throw; the environment did — a browser extension or script mutating React-managed DOM, a portal container torn down mid-commit, or an HMR re-registration racing an unmount. Treating that environmental failure as a registrant failure was the defect: it permanently retired a healthy entry.

## Decision

`SlotErrorBoundary` classifies the crash before reporting. A `DOMException` with `name === 'NotFoundError'` (the `removeChild`/`insertBefore` desync signature) is a React↔DOM desync, not a registrant failure. For that class the boundary:

- reports through `onEntryError` with `{ abdicate: false }`, so the entry keeps its cell and no survivor search starts;
- remounts its children once under a fresh key (a `remount` counter on a keyed `Fragment`), rebuilding the subtree and its fiber↔DOM bookkeeping from scratch;
- falls through to the ordinary crash face + abdicate path when the desync persists past one remount (`MAX_DESYNC_REMOUNTS = 1`), so a persistently hostile environment still fails loud instead of looping.

Registrant failures (component render throws, inject factory throws, everything else) keep the pre-existing behavior unchanged: immediate crash face and, for shadowing kinds, abdication to the cell's next survivor. Assembly errors still rethrow. The `onEntryError` contract widened from `(error) => void` to `(error, info?: { abdicate?: boolean }) => void`; the caller's default policy (`spec.kind !== 'chain'`) applies when the boundary does not override.

## Alternatives considered

**Let the boundary's crash face stand (no change).** Rejected: it is the reported bug. A transient environmental desync permanently destroys a single-entry slot's UI, and the only recovery is re-registration or reload — disproportionate for a crash that is not the registrant's fault.

**Always remount on any crash, not just the desync class.** Rejected: a registrant whose render throws will throw again on the fresh mount, so an unconditional remount adds a second render + report cycle before the same terminal face. Restricting the remount to the class whose failure remounting can actually heal (fiber↔DOM desync) keeps the registrant-failure path fast and its diagnostics clean.

**Remount unbounded (no budget).** Rejected: a mutator that keeps fighting React would pin the boundary in a crash/remount loop. One self-heal then fail-loud is the containment philosophy's bound.

**Fix the desync at its source instead.** Rejected as out of scope for this change: the sources are environmental (external DOM mutation) or cross-cutting races (HMR teardown, portals), not a single defect in this package. The boundary recovery is the containment seam's job: survive what the environment does to the subtree React hands it.

## Consequences

- A single-slot entry (the composer bar, and any future single-occupant UI) survives one DOM-desync incident: it remounts fresh, and the user keeps typing without a reload. A persistent mutator still produces the crash face after one retry.
- The desync incident remains observable: `componentDidCatch` still logs, and the non-abdicating report still reaches the ledger's `onEntryError` supervision listeners.
- The `onEntryError` prop contract grew an optional override argument; every call site (`guarded`, `StrictSessionEntry`, `RootOutlet`) threads it, with the kind-default policy untouched for registrant failures.
- The recovery is bounded to the boundary instance: a new winner (re-election, HMR re-registration) mounts a fresh boundary with a fresh remount budget.

## Testing

The new `DOM-desync recovery in entry boundaries` block in [scoped-slots.client.spec.tsx](../../../../packages/client/web-react/tests/scoped-slots.client.spec.tsx) covers: a single-slot `NotFoundError` self-healing without abdication (report arg `{ abdicate: false }`, no `[data-slot-error]`, two mounts); the same through `StrictSessionEntry`; a persistent desync falling through to crash face + abdicate after one remount (report args `{ abdicate: false }` then `{ abdicate: true }`); and a registrant `Error` keeping the immediate abdicate path with no remount. Existing crash-containment tests (list-slot sibling survival, inject-factory throw, chain re-election) are unchanged and pin the registrant path.
