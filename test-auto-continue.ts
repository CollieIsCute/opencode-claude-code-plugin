/**
 * Unit tests for smart auto-continuation policy in
 * src/claude-code-language-model.ts.
 */
import { test } from "node:test"
import assert from "node:assert/strict"

import { shouldAutoContinueIncompleteTurn } from "./src/claude-code-language-model.js"

function state(overrides: Record<string, unknown> = {}) {
  return {
    enabled: "smart" as const,
    attempts: 0,
    startedAt: 1_000,
    noProgressCount: 0,
    ...overrides,
  } as any
}

function snap(overrides: Record<string, unknown> = {}) {
  return {
    text: "",
    hadReasoning: false,
    hadToolActivity: false,
    hadProxyActivity: false,
    now: 1_500,
    ...overrides,
  } as any
}

test("smart auto-continue is disabled by false", () => {
  const result = shouldAutoContinueIncompleteTurn(
    state({ enabled: false }),
    snap({ hadReasoning: true }),
  )
  assert.deepEqual(result, { continue: false, reason: "disabled" })
})

test("continues reasoning-only result with no visible answer", () => {
  const result = shouldAutoContinueIncompleteTurn(
    state(),
    snap({ hadReasoning: true }),
  )
  assert.equal(result.continue, true)
  assert.equal(result.reason, "activity-without-visible-answer")
})

test("continues tool activity without visible answer", () => {
  const result = shouldAutoContinueIncompleteTurn(
    state(),
    snap({ hadToolActivity: true }),
  )
  assert.equal(result.continue, true)
})

test("continues non-final visible progress", () => {
  const result = shouldAutoContinueIncompleteTurn(
    state(),
    snap({ text: "I found the relevant files and am checking the tests.", hadToolActivity: true }),
  )
  assert.deepEqual(result, { continue: true, reason: "non-final-progress" })
})

test("stops for final-looking visible answer", () => {
  const result = shouldAutoContinueIncompleteTurn(
    state(),
    snap({ text: "Done. Implemented the fix and tests passed successfully.", hadToolActivity: true }),
  )
  assert.deepEqual(result, { continue: false, reason: "final-answer" })
})

test("stops for question", () => {
  const result = shouldAutoContinueIncompleteTurn(
    state(),
    snap({ text: "Which option do you want me to use?", hadReasoning: true }),
  )
  assert.deepEqual(result, { continue: false, reason: "question" })
})

test("stops for blocker", () => {
  const result = shouldAutoContinueIncompleteTurn(
    state(),
    snap({ text: "I cannot proceed because the required token is missing.", hadToolActivity: true }),
  )
  assert.deepEqual(result, { continue: false, reason: "blocker" })
})

test("stops for errors", () => {
  const result = shouldAutoContinueIncompleteTurn(
    state(),
    snap({ isError: true, hadToolActivity: true }),
  )
  assert.deepEqual(result, { continue: false, reason: "error" })
})

test("stops at max attempts", () => {
  const result = shouldAutoContinueIncompleteTurn(
    state({ attempts: 8 }),
    snap({ hadReasoning: true }),
  )
  assert.deepEqual(result, { continue: false, reason: "max-attempts" })
})

test("stops when elapsed budget is exhausted", () => {
  const result = shouldAutoContinueIncompleteTurn(
    state({ startedAt: 0 }),
    snap({ hadReasoning: true, now: 10 * 60 * 1000 + 1 }),
  )
  assert.deepEqual(result, { continue: false, reason: "max-elapsed" })
})

test("stops on repeated no-progress continuation", () => {
  const snapshot = snap({ hadReasoning: true })
  const first = shouldAutoContinueIncompleteTurn(state(), snapshot)
  assert.equal(first.continue, true)

  const second = shouldAutoContinueIncompleteTurn(
    state({
      lastSignature: JSON.stringify({
        text: "",
        reasoning: true,
        tools: false,
        proxy: false,
      }),
      noProgressCount: 1,
    }),
    snapshot,
  )
  assert.deepEqual(second, { continue: false, reason: "no-progress" })
})

test("stops when there was no activity", () => {
  const result = shouldAutoContinueIncompleteTurn(state(), snap())
  assert.deepEqual(result, { continue: false, reason: "no-activity" })
})
