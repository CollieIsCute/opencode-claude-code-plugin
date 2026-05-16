import assert from "node:assert/strict"
import { test } from "node:test"
import { mapTool } from "./src/tool-mapping.js"

test("Claude CLI Task* internal tools are skipped, not forwarded", () => {
  for (const name of ["TaskCreate", "TaskUpdate", "TaskList", "TaskGet", "TaskStop"]) {
    const result = mapTool(name, { foo: "bar" })
    assert.equal(result.skip, true, `${name} should be skipped`)
    assert.equal(result.executed, true, `${name} should be marked executed`)
    assert.equal(result.name, name, `${name} should preserve the original name for logging`)
  }
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

test("TodoWrite is unaffected by the Task* additions", () => {
  const result = mapTool("TodoWrite", { todos: [{ id: "1", content: "x", status: "pending" }] })
  assert.equal(result.skip, undefined)
  assert.equal(result.executed, false)
  assert.equal(result.name, "todowrite")
})
