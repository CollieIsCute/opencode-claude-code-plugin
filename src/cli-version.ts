import { execFile } from "node:child_process"
import { promisify } from "node:util"
import { log } from "./logger.js"

const execFileAsync = promisify(execFile)

export interface CliVersion {
  major: number
  minor: number
  patch: number
  raw: string
}

const cache = new Map<string, Promise<CliVersion | null>>()

/**
 * Run `claude --version` once per cliPath and parse the leading semver.
 * Returns null on any failure (binary missing, unparseable output, etc.)
 * so callers can fall back to the most conservative flag set.
 */
export function detectCliVersion(cliPath: string): Promise<CliVersion | null> {
  const cached = cache.get(cliPath)
  if (cached) return cached
  const promise = (async (): Promise<CliVersion | null> => {
    try {
      const { stdout } = await execFileAsync(cliPath, ["--version"], {
        timeout: 5000,
      })
      const match = /(\d+)\.(\d+)\.(\d+)/.exec(stdout.trim())
      if (!match) {
        log.warn("claude --version output unparseable", { stdout: stdout.trim() })
        return null
      }
      const v: CliVersion = {
        major: Number(match[1]),
        minor: Number(match[2]),
        patch: Number(match[3]),
        raw: stdout.trim(),
      }
      log.info("detected claude cli version", { cliPath, version: v.raw })
      if (!cliSupportsThinkingDisplay(v)) {
        log.notice(
          "claude cli < 2.1.142 detected; Opus 4.7 thinking summaries unavailable. Run `npm i -g @anthropic-ai/claude-code` to upgrade.",
          { version: v.raw },
        )
      }
      return v
    } catch (err) {
      log.warn("failed to detect claude cli version", {
        cliPath,
        error: err instanceof Error ? err.message : String(err),
      })
      return null
    }
  })()
  cache.set(cliPath, promise)
  return promise
}

function gte(v: CliVersion, target: { major: number; minor: number; patch: number }): boolean {
  if (v.major !== target.major) return v.major > target.major
  if (v.minor !== target.minor) return v.minor > target.minor
  return v.patch >= target.patch
}

/**
 * `--thinking-display` was introduced in Claude Code 2.1.142 alongside
 * Opus 4.7's "omitted by default" thinking behavior. Older CLIs reject
 * the flag with a parse error, so we gate it. Unknown version → return
 * false so we don't risk crashing the spawn.
 */
export function cliSupportsThinkingDisplay(v: CliVersion | null): boolean {
  if (!v) return false
  return gte(v, { major: 2, minor: 1, patch: 142 })
}

/**
 * `--thinking` has been part of Claude Code's CLI since the 2.x line.
 * We require a detected 2.0.0+ before passing it; unknown version → skip
 * to avoid crashing a pre-flag binary. Anyone on the 1.x line should
 * upgrade.
 */
export function cliSupportsThinking(v: CliVersion | null): boolean {
  if (!v) return false
  return gte(v, { major: 2, minor: 0, patch: 0 })
}

/** For tests. */
export function _clearCache(): void {
  cache.clear()
}
