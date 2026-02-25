# Overstory for OpenCode

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Bun](https://img.shields.io/badge/Bun-%E2%89%A51.0-orange)](https://bun.sh)

**Multi-agent orchestration for OpenCode** — Fork of Overstory adapted for OpenCode compatibility.

This fork replaces Claude Code-specific features (tmux, `claude` CLI) with OpenCode-compatible alternatives (Bun.spawn subprocesses, Task tool, Plugin system).

> **⚠️ Fork Notice**: This is an unofficial fork of [jayminwest/overstory](https://github.com/jayminwest/overstory) adapted for OpenCode. For the original Claude Code version, see the upstream repository.

## Quick Start

```bash
# Clone this fork
git clone https://github.com/isaakdjedje-byte/overstory.git
cd overstory

# Switch to opencode branch
git checkout opencode-adaptation

# Install dependencies
bun install

# Link CLI globally
bun link

# Initialize in your project
cd your-project
ov init

# Configure OpenCode plugin
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

# Start coordinator
ov coordinator start

# Spawn agents
ov sling TASK-001 --capability builder --name builder-01
```

## What's Different?

### Original (Claude Code) → This Fork (OpenCode)

| Feature | Original | This Fork |
|---------|----------|-----------|
| **Spawn Method** | tmux + `claude` CLI | Bun.spawn subprocess + Task tool |
| **Persistent Agents** | tmux sessions | Bun.spawn (coordinator, supervisor, monitor) |
| **Ephemeral Agents** | tmux sessions | Task tool (builder, scout, reviewer) |
| **Hooks** | `.claude/settings.local.json` | OpenCode Plugin (`opencode-plugin/`) |
| **Overlay Template** | `templates/overlay.md.tmpl` | `templates/opencode-overlay.md.tmpl` |
| **Dashboard** | ANSI TUI | CLI JSON output + custom dashboard |
| **Documentation** | CLAUDE.md | SKILL.md (OpenCode skill format) |

### New Components

```
opencode-overstory/
├── src/opencode/
│   ├── agent-spawner.ts      # Hybrid spawn (persistent + task)
│   ├── persistent-agent.ts    # Long-running agents (coordinator, etc.)
│   └── task-agent.ts          # Ephemeral agents (builder, etc.)
├── opencode-plugin/
│   └── index.ts               # OpenCode plugin (hooks)
├── opencode-skill/
│   └── SKILL.md               # OpenCode skill documentation
└── templates/
    └── opencode-overlay.md.tmpl  # Agent overlay template
```

## Architecture

### Hybrid Spawning

| Agent Type | Spawn Method | Persistence | Use Case |
|------------|--------------|-------------|----------|
| **Coordinator** | `Bun.spawn` subprocess | 24/7 | Persistent orchestrator |
| **Supervisor** | `Bun.spawn` subprocess | 24/7 | Team lead |
| **Monitor** | `Bun.spawn` subprocess | 24/7 | Health monitoring |
| **Builder** | Task tool | Task duration | Implementation |
| **Scout** | Task tool | Task duration | Exploration |
| **Reviewer** | Task tool | Task duration | Code review |

### Communication

All agents communicate via SQLite (`~/.overstory/mail.db`):

```sql
-- Check messages
SELECT * FROM messages WHERE to_agent = 'my-agent' AND read = FALSE;

-- Send message
INSERT INTO messages (from_agent, to_agent, subject, body, type)
VALUES ('sender', 'recipient', 'Subject', 'Body', 'dispatch');
```

### Plugin Hooks

The OpenCode plugin provides:

- **`tool.execute.before`**: Blocks write tools for read-only agents
- **`chat.system.transform`**: Injects agent context into prompts
- **`experimental.chat.messages.transform`**: Surfaces unread mail

## Installation

### Prerequisites

- [Bun](https://bun.sh) v1.0+
- [git](https://git-scm.com/)
- [OpenCode](https://opencode.ai)

### Steps

```bash
# Clone fork
git clone https://github.com/isaakdjedje-byte/overstory.git
cd overstory

# Checkout opencode branch
git checkout opencode-adaptation

# Install dependencies
bun install

# Link CLI
bun link

# Verify installation
ov --version
ov doctor
```

## Configuration

### Project Setup

```bash
# Initialize Overstory
cd your-project
ov init

# This creates:
# .overstory/
#   ├── config.yaml           # Project config
#   ├── mail.db               # SQLite messages
#   └── worktrees/            # Git worktrees
```

### OpenCode Plugin

Create `opencode.json` in your project root:

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

## Usage

### Start Coordinator

```bash
ov coordinator start --watchdog
```

### Spawn Agents

```bash
# Builder agent
ov sling TASK-001 --capability builder --name builder-01

# Scout agent
ov sling TASK-002 --capability scout --name scout-01

# With file scope
ov sling TASK-003 --capability builder --name builder-02 --files src/auth.ts,src/users.ts
```

### Check Status

```bash
ov status
ov dashboard
```

### Communication

```bash
# Check mail
ov mail check --agent builder-01

# Send mail
ov mail send --to builder-01 --subject "Update" --body "Priority changed"

# Broadcast
ov mail send --to @all --subject "Standup" --body "Daily sync"
```

### Merge Work

```bash
# Merge specific branch
ov merge --branch overstory/builder-01

# Merge all completed
ov merge --all
```

## Documentation

- **Full Documentation**: See `opencode-skill/SKILL.md`
- **Original Docs**: See upstream [jayminwest/overstory](https://github.com/jayminwest/overstory)
- **Adaptation Details**: See `OPENCODE-ADAPTATION.md`

## Development

```bash
# Run tests
bun test

# Lint
biome check .

# Type check
tsc --noEmit

# All gates
bun test && biome check . && tsc --noEmit
```

## License

MIT - See [LICENSE](LICENSE)

---

**Upstream**: https://github.com/jayminwest/overstory  
**Fork**: https://github.com/isaakdjedje-byte/overstory
