---
name: overstory-orchestrator
description: Multi-agent orchestration for OpenCode - spawn worker agents in git worktrees via SQLite mail system
---

# Overstory Orchestrator for OpenCode

## Overview

Multi-agent orchestration system adapted for OpenCode. Spawns parallel agents in isolated worktrees with SQLite-based coordination.

**Core principle:** Hybrid spawning (persistent + task-based) + worktree isolation + SQLite mail system.

## When to Use

- 3+ independent tasks that can run in parallel
- Need isolated environments per agent
- Require coordinated agent communication
- Complex multi-file changes across subsystems

## Architecture

### Agent Types

| Agent | Spawn Method | Persistence | Role |
|-------|-------------|-------------|------|
| **Coordinator** | Bun.spawn subprocess | 24/7 | Persistent orchestrator |
| **Supervisor** | Bun.spawn subprocess | 24/7 | Per-project team lead |
| **Monitor** | Bun.spawn subprocess | 24/7 | Fleet health monitoring |
| **Builder** | Task/ephemeral | Task duration | Implementation |
| **Scout** | Task/ephemeral | Task duration | Exploration |
| **Reviewer** | Task/ephemeral | Task duration | Code review |
| **Lead** | Task/ephemeral | Task duration | Can spawn sub-workers |

### Communication

Agents communicate via SQLite at `.overstory/mail.db`:

```bash
# Check for messages
sqlite3 .overstory/mail.db "SELECT * FROM messages WHERE to_agent = 'my-agent' AND read = FALSE;"

# Send message
sqlite3 .overstory/mail.db "INSERT INTO messages (from_agent, to_agent, subject, body, type) VALUES ('sender', 'recipient', 'Subject', 'Body', 'dispatch');"
```

## Workflow

### 1. Initialize Project

```bash
ov init
ov hooks install
```

### 2. Start Coordinator

```bash
ov coordinator start --watchdog
```

### 3. Spawn Workers

```bash
ov sling TASK-001 --capability builder --name builder-01
ov sling TASK-002 --capability scout --name scout-01
```

### 4. Check Status

```bash
ov status
ov dashboard
```

### 5. Merge Work

```bash
ov merge --all
```

## Key Commands

### Agent Management
```bash
ov sling <task-id> --capability <type> --name <name>     # Create agent
ov stop <name>                                           # Stop agent
ov status --verbose                                      # Detailed status
ov dashboard                                             # Live TUI
ov inspect <name>                                        # Deep inspection
```

### Messaging
```bash
ov mail send --to <agent> --subject "..." --body "..."
ov mail check --agent <name> --inject                    # Read messages
ov nudge <agent> "Message"                              # Send notification
```

### Worktrees
```bash
ov worktree list                                         # List worktrees
ov worktree clean --completed                           # Clean finished
```

## Configuration

Edit `.overstory/config.yaml`:

```yaml
project:
  name: my-project
  canonicalBranch: main

agents:
  maxConcurrent: 25
  maxDepth: 2
  
opencode:
  spawnMethod: hybrid  # persistent | task | hybrid
  pluginEnabled: true
```

## OpenCode Plugin

The plugin provides automatic integration:

### Hooks
- **tool.execute.before**: Blocks write tools for read-only agents
- **chat.system.transform**: Injects agent context
- **experimental.chat.messages.transform**: Surfaces unread mail

### Installation

Add to your `opencode.json`:

```json
{
  "mcp": {
    "overstory": {
      "type": "local",
      "command": ["bun", "run", "opencode-plugin/index.ts"],
      "enabled": true
    }
  }
}
```

## Constraints

- **Worktree Isolation**: All writes MUST target files within your worktree
- **Read-only Agents**: Scout, reviewer cannot modify files
- **Depth Limit**: Default max depth of 2 (coordinator → lead → worker)
- **SQLite Mail**: All coordination via `.overstory/mail.db`

## Completion Protocol

When finishing work:

1. Pass quality gates (tests, lint, typecheck)
2. Commit to your branch
3. Record learnings: `ml record <domain> ...`
4. Send completion mail: `ov mail send --type worker_done`
5. Close issue: `bd close <task-id>`

## Troubleshooting

### Agent not receiving messages
- Check `.overstory/mail.db` exists
- Verify agent name matches
- Ensure SQLite WAL mode is enabled

### Plugin not loading
- Verify `opencode.json` configuration
- Check Bun is installed
- Review plugin logs

### Worktree conflicts
- Use `ov worktree list` to see all worktrees
- Run `ov clean --worktrees` to remove stale worktrees

## Differences from Claude Code Version

| Feature | Claude Code | OpenCode |
|---------|-------------|----------|
| Spawn method | tmux + claude CLI | Bun.spawn + Task |
| Hooks | `.claude/settings.local.json` | Plugin + opencode.json |
| Sessions | tmux persistent | Bun subprocess |
| Dashboard | ANSI TUI | JSON API + CLI |

## Resources

- Original: https://github.com/jayminwest/overstory
- Fork: https://github.com/isaakdjedje-byte/overstory
- Documentation: CLAUDE.md in repository root
