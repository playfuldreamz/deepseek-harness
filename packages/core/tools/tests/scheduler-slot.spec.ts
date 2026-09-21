/**
 * The scheduler slot key survives duplicate module evaluations: source and
 * built copies of this package must resolve the same symbol, or the agent
 * loop cannot find the scheduler on a registry built by another copy.
 */

import { describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import ToolRuntime, { TOOL_RUNTIME_SCHEDULER, type ToolRuntimeScheduler } from '@deepseek-ai/dsh-tools'

/** The registry symbol a duplicate evaluation of this module produces. */
const duplicateCopyKey = Symbol.for('@deepseek-ai/dsh-tools.scheduler')

describe('tool runtime scheduler slot', () => {
  it('shares one symbol identity through the global symbol registry', () => {
    expect(TOOL_RUNTIME_SCHEDULER).toBe(duplicateCopyKey)
  })

  it('exposes the scheduler under an independently obtained registry symbol', async () => {
    const ctx = new Context()
    await ctx.plugin(SystemPrompt)
    await ctx.plugin(ToolRuntime)
    const scheduler = (ctx.tools as unknown as Record<symbol, unknown>)[duplicateCopyKey] as Pick<ToolRuntimeScheduler, 'prepare' | 'dispatch' | 'finalize' | 'finish'>
    expect(typeof scheduler.prepare).toBe('function')
    expect(typeof scheduler.dispatch).toBe('function')
    expect(typeof scheduler.finalize).toBe('function')
    expect(typeof scheduler.finish).toBe('function')
  })
})
