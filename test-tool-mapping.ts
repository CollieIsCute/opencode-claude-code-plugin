import assert from "node:assert/strict"
import { test } from "node:test"
import {
  _resetAllLedgersForTests,
  applyTaskCreateToolResult,
  getLedger,
} from "./src/todo-ledger.js"
import { mapTool } from "./src/tool-mapping.js"

test("Read-only Claude CLI Task* tools are still skipped, not forwarded", () => {
  for (const name of ["TaskList", "TaskGet", "TaskStop"]) {
    const result = mapTool(name, { foo: "bar" })
    assert.equal(result.skip, true, `${name} should be skipped`)
    assert.equal(result.executed, true, `${name} should be marked executed`)
    assert.equal(result.name, name, `${name} should preserve the original name for logging`)
  }
})

test("TaskCreate without sessionId falls back to skip (preserves pre-ledger safety)", () => {
  _resetAllLedgersForTests()
  const result = mapTool("TaskCreate", { subject: "x" })
  assert.equal(result.skip, true)
  assert.equal(result.executed, true)
  assert.equal(result.name, "TaskCreate")
})

test("TaskUpdate without sessionId falls back to skip", () => {
  _resetAllLedgersForTests()
  const result = mapTool("TaskUpdate", { taskId: "1", status: "in_progress" })
  assert.equal(result.skip, true)
  assert.equal(result.executed, true)
  assert.equal(result.name, "TaskUpdate")
})

test("TaskCreate tool_use with sessionId stashes pending and returns skip (no emission yet)", () => {
  _resetAllLedgersForTests()
  const result = mapTool(
    "TaskCreate",
    { subject: "Write tests" },
    { sessionId: "tm-1", toolUseId: "tu-1" },
  )
  assert.equal(result.skip, true)
  assert.deepEqual(getLedger("tm-1"), [], "ledger remains empty until tool_result commits")
})

test("TaskUpdate with sessionId emits todowrite when task is known", () => {
  _resetAllLedgersForTests()
  mapTool("TaskCreate", { subject: "Step one" }, { sessionId: "tm-2", toolUseId: "tu-1" })
  applyTaskCreateToolResult("tm-2", "tu-1", "Task #1 created successfully")

  const result = mapTool(
    "TaskUpdate",
    { taskId: "1", status: "in_progress" },
    { sessionId: "tm-2" },
  )
  assert.equal(result.skip, undefined)
  assert.equal(result.executed, false)
  assert.equal(result.name, "todowrite")
  assert.deepEqual(result.input, {
    todos: [{ id: "1", content: "Step one", status: "in_progress", priority: "medium" }],
  })
})

test("TaskUpdate with sessionId returns skip when task id is unknown to the ledger", () => {
  _resetAllLedgersForTests()
  const result = mapTool(
    "TaskUpdate",
    { taskId: "999", status: "completed" },
    { sessionId: "tm-3" },
  )
  assert.equal(result.skip, true)
  assert.equal(result.executed, true)
  assert.equal(result.name, "TaskUpdate")
})

test("TaskOutput is still surfaced as a bash echo (not internalized)", () => {
  const result = mapTool("TaskOutput", { content: "hello" })
  assert.equal(result.skip, undefined)
  assert.equal(result.executed, false)
  assert.equal(result.name, "bash")
  assert.ok(typeof result.input?.command === "string")
  assert.ok(result.input.command.includes("hello"))
})

test("Pre-existing internal tools still skip", () => {
  for (const name of ["ToolSearch", "Agent", "AskFollowupQuestion"]) {
    const result = mapTool(name)
    assert.equal(result.skip, true, `${name} should remain skipped`)
  }
})

test("TodoWrite path is unaffected by the Task* ledger additions", () => {
  const result = mapTool("TodoWrite", { todos: [{ id: "1", content: "x", status: "pending" }] })
  assert.equal(result.skip, undefined)
  assert.equal(result.executed, false)
  assert.equal(result.name, "todowrite")
})
