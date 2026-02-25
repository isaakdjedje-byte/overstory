# Overstory for OpenCode

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Bun](https://img.shields.io/badge/Bun-%E2%89%A51.0-orange)](https://bun.sh)
[![OpenCode](https://img.shields.io/badge/OpenCode-Compatible-blue)](https://opencode.ai)

**Multi-agent orchestration system for OpenCode** — Spawn worker agents in git worktrees, coordinate through SQLite mail, merge with tiered conflict resolution.

> **⚠️ Fork Notice**: This is an OpenCode-compatible fork of [jayminwest/overstory](https://github.com/jayminwest/overstory). The original was designed for Claude Code; this version has been adapted to work with OpenCode using a hybrid spawning approach (Bun.spawn + Task tool).

## How It Works

SKILL.md + OpenCode plugin + the `ov` CLI turn your OpenCode session into a multi-agent orchestrator. A persistent coordinator agent manages task decomposition and dispatch, while ephemeral task agents execute specific work, all coordinated through a custom SQLite mail system.

```
Coordinator (persistent orchestrator at project root)
  --> Supervisor (per-project team lead, depth 1)
        --> Workers: Scout, Builder, Reviewer, Merger (depth 2)
```

### Agent Types

| Agent | Role | Spawn Method | Persistence |
|-------|------|--------------|---------------|
| **Coordinator** | Persistent orchestrator — decomposes objectives, dispatches agents, tracks task groups | Bun.spawn | 24/7 |
| **Supervisor** | Per-project team lead — manages worker lifecycle, handles nudge/escalation | Bun.spawn | 24/7 |
| **Scout** | Read-only exploration and research | Task tool | Ephemeral |
| **Builder** | Implementation and code changes | Task tool | Ephemeral |
| **Reviewer** | Validation and code review | Task tool | Ephemeral |
| **Lead** | Team coordination, can spawn sub-workers | Task tool | Ephemeral |
| **Merger** | Branch merge specialist | Task tool | Ephemeral |
| **Monitor** | Tier 2 continuous fleet patrol — ongoing health monitoring | Bun.spawn | 24/7 |

### Key Architecture

- **Hybrid Spawning**: Persistent agents (coordinator, supervisor, monitor) run as Bun.spawn subprocesses. Ephemeral agents (builder, scout, reviewer) spawn as Task tool instances.
- **Agent Definitions**: Two-layer system — base `.md` files define the HOW (workflow), per-task overlays define the WHAT (task scope). Base definition content is injected into spawned agent overlays automatically.
- **Messaging**: Custom SQLite mail system with typed protocol — 8 message types (`worker_done`, `merge_ready`, `dispatch`, `escalation`, etc.) for structured agent coordination, plus broadcast messaging with group addresses (`@all`, `@builders`, etc.)
- **Worktrees**: Each agent gets an isolated git worktree — no file conflicts between agents
- **Merge**: FIFO merge queue (SQLite-backed) with 4-tier conflict resolution
- **Watchdog**: Tiered health monitoring — Tier 0 mechanical daemon (process liveness), Tier 1 AI-assisted failure triage, Tier 2 monitor agent for continuous fleet patrol
- **OpenCode Plugin**: Provides tool interception (`tool.execute.before`), context injection (`chat.system.transform`), and mail surfacing (`experimental.chat.messages.transform`)
- **Task Groups**: Batch coordination with auto-close when all member issues complete
- **Session Lifecycle**: Checkpoint save/restore for compaction survivability, handoff orchestration for crash recovery

## Requirements

- [Bun](https://bun.sh) (v1.0+)
- [OpenCode](https://opencode.ai)
- git
- Optional: tmux (for advanced session management)

## Installation

```bash
# Clone the OpenCode fork
git clone https://github.com/isaakdjedje-byte/overstory.git
cd overstory

# Switch to opencode-adaptation branch
git checkout opencode-adaptation

# Install dev dependencies
bun install

# Link the CLI globally
bun link
```

## Quick Start

```bash
# Initialize overstory in your project
cd your-project
ov init

# Configure OpenCode plugin (create opencode.json)
cat > opencode.json << 'EOF'
{
  "mcp": {
    "overstory": {
      "type": "local",
      "command": ["bun", "run", "path/to/overstory/opencode-plugin/index.ts"],
      "enabled": true
    }
  }
}
EOF

# Start a coordinator (persistent orchestrator)
ov coordinator start

# Or spawn individual worker agents
ov sling <task-id> --capability builder --name my-builder

# Check agent status
ov status

# Live dashboard for monitoring the fleet
ov dashboard

# Nudge a stalled agent
ov nudge <agent-name>

# Check mail from agents
ov mail check --inject
```

## CLI Reference

```
ov agents discover               Discover agents by capability/state/parent
  --capability <type>                    Filter by capability type
  --state <state>                        Filter by agent state
  --parent <name>                        Filter by parent agent
  --json                                 JSON output

ov init                          Initialize .overstory/ in current project
                                        (deploys agent definitions automatically)
  --yes, -y                              Skip interactive prompts
  --name <name>                          Set project name (default: auto-detect)

ov coordinator start             Start persistent coordinator agent
  --watchdog                             Auto-start watchdog daemon with coordinator
  --monitor                              Auto-start Tier 2 monitor agent
ov coordinator stop              Stop coordinator
ov coordinator status            Show coordinator state

ov supervisor start              Start per-project supervisor agent
ov supervisor stop               Stop supervisor
ov supervisor status             Show supervisor state

ov sling <task-id>              Spawn a worker agent
  --capability <type>                    builder | scout | reviewer | lead | merger
                                         | coordinator | supervisor | monitor
  --name <name>                          Unique agent name
  --spec <path>                          Path to task spec file
  --files <f1,f2,...>                    Exclusive file scope
  --parent <agent-name>                  Parent (for hierarchy tracking)
  --depth <n>                            Current hierarchy depth
  --skip-scout                           Skip scout phase (passed to lead overlay)
  --skip-task-check                      Skip task existence validation
  --json                                 JSON output

ov stop <agent-name>            Terminate a running agent
  --clean-worktree                       Remove the agent's worktree (best-effort)
  --json                                 JSON output

ov prime                         Load context for orchestrator/agent
  --agent <name>                         Per-agent priming
  --compact                              Restore from checkpoint (compaction)

ov status                        Show all active agents, worktrees, tracker state
  --json                                 JSON output
  --verbose                              Show detailed agent info
  --all                                  Show all runs (default: current run only)

ov dashboard                     Live TUI dashboard for agent monitoring
  --interval <ms>                        Refresh interval (default: 2000)
  --all                                  Show all runs (default: current run only)

ov hooks install                 Install orchestrator hooks to opencode.json
  --force                                Overwrite existing hooks
ov hooks uninstall               Remove orchestrator hooks
ov hooks status                  Check if hooks are installed

ov mail send                     Send a message
  --to <agent>  --subject <text>  --body <text>
  --to @all | @builders | @scouts ...    Broadcast to group addresses
  --type <status|question|result|error>
  --priority <low|normal|high|urgent>    (urgent/high auto-nudges recipient)

ov mail check                    Check inbox (unread messages)
  --agent <name>  --inject  --json
  --debounce <ms>                        Skip if checked within window

ov mail list                     List messages with filters
  --from <name>  --to <name>  --unread

ov mail read <id>                Mark message as read
ov mail reply <id> --body <text> Reply in same thread

ov nudge <agent> [message]       Send a text nudge to an agent
  --from <name>                          Sender name (default: orchestrator)
  --force                                Skip debounce check
  --json                                 JSON output

ov group create <name>           Create a task group for batch tracking
ov group status <name>           Show group progress
ov group add <name> <issue-id>   Add issue to group
ov group list                    List all groups

ov merge                         Merge agent branches into canonical
  --branch <name>                        Specific branch
  --all                                  All completed branches
  --into <branch>                        Target branch (default: session-branch.txt > canonicalBranch)
  --dry-run                              Check for conflicts only

ov worktree list                 List worktrees with status
ov worktree clean                Remove completed worktrees
  --completed                            Only finished agents
  --all                                  Force remove all
  --force                                Delete even if branches are unmerged

ov monitor start                 Start Tier 2 monitor agent
ov monitor stop                  Stop monitor agent
ov monitor status                Show monitor state

ov log <event>                   Log a hook event
ov watch                         Start watchdog daemon (Tier 0)
  --interval <ms>                        Health check interval
  --background                           Run as background process
ov run list                      List orchestration runs
ov run show <id>                 Show run details
ov run complete <id>             Mark a run complete

ov trace                         View agent/bead timeline
  --agent <name>                         Filter by agent
  --run <id>                             Filter by run

ov clean                         Clean up worktrees, sessions, artifacts
  --completed                            Only finished agents
  --all                                  Force remove all
  --run <id>                             Clean a specific run

ov doctor                        Run health checks on overstory setup
  --json                                 JSON output
  --category <name>                      Run a specific check category only

ov inspect <agent>               Deep per-agent inspection
  --json                                 JSON output
  --follow                               Polling mode (refreshes periodically)
  --interval <ms>                        Refresh interval for --follow
  --limit <n>                            Limit events shown

ov spec write <task-id>          Write a task specification
  --body <content>                       Spec content (or pipe via stdin)

ov errors                        Aggregated error view across agents
  --agent <name>                         Filter by agent
  --run <id>                             Filter by run
  --since <ts>  --until <ts>             Time range filter
  --limit <n>  --json

ov replay                        Interleaved chronological replay
  --run <id>                             Filter by run
  --agent <name>                         Filter by agent(s)
  --since <ts>  --until <ts>             Time range filter
  --limit <n>  --json

ov feed [options]                Unified real-time event stream across agents
  --follow, -f                           Continuously poll for new events
  --interval <ms>                        Polling interval (default: 2000)
  --agent <name>  --run <id>             Filter by agent or run
  --json                                 JSON output

ov logs [options]                Query NDJSON logs across agents
  --agent <name>                         Filter by agent
  --level <level>                        Filter by log level (debug|info|warn|error)
  --since <ts>  --until <ts>             Time range filter
  --follow                               Tail logs in real time
  --json                                 JSON output

ov costs                         Token/cost analysis and breakdown
  --live                                 Show real-time token usage for active agents
  --self                                 Show cost for current orchestrator session
  --agent <name>                         Filter by agent
  --run <id>                             Filter by run
  --by-capability                        Group by capability type
  --last <n>  --json

ov metrics                       Show session metrics
  --last <n>                             Last N sessions
  --json                                 JSON output

Global Flags:
  --quiet, -q                            Suppress non-error output
  --completions <shell>                  Generate shell completions (bash, zsh, fish)
```

## OpenCode Plugin

The OpenCode plugin provides automatic integration:

### Installation

Add to your `opencode.json`:

```json
{
  "mcp": {
    "overstory": {
      "type": "local",
      "command": ["bun", "run", "./opencode-plugin/index.ts"],
      "enabled": true
    }
  }
}
```

### Hooks Provided

- **`tool.execute.before`**: Blocks write tools for read-only agents (scout, reviewer)
- **`chat.system.transform`**: Injects agent context (name, capability, worktree) into system prompts
- **`experimental.chat.messages.transform`**: Surfaces unread mail messages automatically

## Tech Stack

- **Runtime**: Bun (TypeScript directly, no build step)
- **Dependencies**: Minimal runtime — `chalk` (color output), `commander` (CLI framework), core I/O via Bun built-in APIs
- **Database**: SQLite via `bun:sqlite` (WAL mode for concurrent access)
- **Linting**: Biome (formatter + linter)
- **Testing**: `bun test` (colocated with source)
- **External CLIs**: `bd` (beads) or `sd` (seeds), `mulch`, `git` — invoked as subprocesses

## Development

```bash
# Run tests
bun test

# Run a single test
bun test src/config.test.ts

# Lint + format check
biome check .

# Type check
tsc --noEmit

# All quality gates
bun test && biome check . && tsc --noEmit
```

## Project Structure

```
overstory/
  src/
    index.ts                      CLI entry point
    opencode/                     OpenCode-specific modules
      agent-spawner.ts            Hybrid spawn dispatcher
      persistent-agent.ts         Long-running agents
      task-agent.ts               Ephemeral agents
    commands/                     One file per CLI subcommand
    agents/                       Agent lifecycle management
    worktree/                     Git worktree management
    mail/                         SQLite mail system
    merge/                        FIFO queue + conflict resolution
    watchdog/                     Tiered health monitoring
    ...
  opencode-plugin/
    index.ts                      OpenCode plugin (hooks)
  opencode-skill/
    SKILL.md                      OpenCode skill documentation
  agents/                         Base agent definitions
  templates/                      Templates for overlays
```

## Differences from Original

| Feature | Original (Claude Code) | This Fork (OpenCode) |
|---------|------------------------|----------------------|
| **Spawn Method** | tmux + `claude` CLI | Bun.spawn / Task tool |
| **Persistent Agents** | tmux sessions | Bun.spawn subprocess |
| **Ephemeral Agents** | tmux sessions | Task tool |
| **Hooks** | `.claude/settings.local.json` | OpenCode Plugin API |
| **Sessions** | tmux-based | Process-based |
| **Dashboard** | ANSI TUI | CLI JSON + custom |

## Documentation

- **OpenCode Skill**: `opencode-skill/SKILL.md`
- **Adaptation Guide**: `OPENCODE-ADAPTATION.md`
- **OpenCode README**: `README-OPENCODE.md`
- **Original**: https://github.com/jayminwest/overstory

## License

MIT

---

**Fork**: https://github.com/isaakdjedje-byte/overstory  
**Upstream**: https://github.com/jayminwest/overstory  
**Inspired by**: https://github.com/steveyegge/gastown/
