# OpenCode Adaptation Guide

This document details the changes made to adapt Overstory for OpenCode compatibility.

## Overview

Overstory was originally designed for **Claude Code**, using:
- tmux for session management
- `claude` CLI for spawning agents
- `.claude/settings.local.json` for hooks

This fork adapts it for **OpenCode**, using:
- Bun.spawn subprocesses for persistent agents
- Task tool for ephemeral agents
- OpenCode Plugin API for hooks

## Major Changes

### 1. Agent Spawning (`src/opencode/`)

#### Original (Claude Code)
```typescript
// Spawn via tmux + claude CLI
const claudeCmd = `claude --model ${model} --permission-mode bypassPermissions`;
const pid = await createSession(tmuxSessionName, worktreePath, claudeCmd, env);
```

#### Adapted (OpenCode)
```typescript
// Hybrid approach
if (isPersistent(capability)) {
  // Bun.spawn for coordinator, supervisor, monitor
  return spawnPersistentAgent(config);
} else {
  // Task tool for builder, scout, reviewer
  return spawnTaskAgent(config);
}
```

**Files Created:**
- `src/opencode/agent-spawner.ts` - Main spawn dispatcher
- `src/opencode/persistent-agent.ts` - Long-running agents
- `src/opencode/task-agent.ts` - Ephemeral agents

### 2. Hooks System (`opencode-plugin/`)

#### Original (Claude Code)
```json
// .claude/settings.local.json
{
  "hooks": {
    "PreToolUse": "python3 /path/to/hook.py"
  }
}
```

#### Adapted (OpenCode)
```typescript
// opencode-plugin/index.ts
export default async function OverstoryPlugin() {
  return {
    async 'tool.execute.before'(input, output) {
      // Block write tools for read-only agents
    },
    async 'chat.system.transform'(input, output) {
      // Inject agent context
    },
    async 'experimental.chat.messages.transform'(input, output) {
      // Surface unread mail
    }
  };
}
```

**Files Created:**
- `opencode-plugin/index.ts` - Plugin implementation

### 3. Template System (`templates/`)

#### Original
- `templates/overlay.md.tmpl` - Claude Code specific

#### Adapted
- `templates/opencode-overlay.md.tmpl` - OpenCode specific
  - Documents spawn method
  - Includes OpenCode environment variables
  - Provides plugin instructions

### 4. Configuration

#### package.json Changes
```json
{
  "name": "@os-eco/overstory-cli-opencode",
  "files": [
    "src",
    "agents",
    "templates",
    "opencode-plugin",      // Added
    "opencode-skill"        // Added
  ],
  "scripts": {
    "plugin:run": "bun run opencode-plugin/index.ts",
    "opencode:setup": "bun scripts/setup-opencode.ts"
  },
  "opencode": {             // Added section
    "plugin": {
      "entry": "opencode-plugin/index.ts",
      "enabled": true
    },
    "skill": {
      "path": "opencode-skill/SKILL.md",
      "name": "overstory-orchestrator"
    }
  }
}
```

### 5. Documentation

#### Created Files
- `README-OPENCODE.md` - OpenCode-specific README
- `OPENCODE-ADAPTATION.md` - This document
- `opencode-skill/SKILL.md` - OpenCode skill format

## Feature Matrix

| Feature | Original | This Fork | Notes |
|---------|----------|-----------|-------|
| **Agent Spawning** | tmux + claude | Bun.spawn / Task | Hybrid approach |
| **Persistent Agents** | tmux | Bun.spawn | coordinator, supervisor, monitor |
| **Ephemeral Agents** | tmux | Task tool | builder, scout, reviewer |
| **Hooks** | .claude/settings | Plugin API | OpenCode native |
| **Dashboard** | ANSI TUI | CLI JSON | Can build custom UI |
| **Sessions** | tmux sessions | SQLite + PIDs | Process-based |
| **Mail System** | SQLite | SQLite | Unchanged |
| **Worktrees** | git worktree | git worktree | Unchanged |
| **Merge Queue** | SQLite | SQLite | Unchanged |
| **Watchdog** | tmux-based | Process-based | Bun.spawn |

## Technical Details

### Agent Lifecycle

```
┌─────────────────────────────────────────────┐
│  OpenCode Main Session                      │
│  (Orchestrator)                             │
└──────────┬──────────────────────────────────┘
           │ ov sling TASK-001 --capability builder
           ▼
┌─────────────────────────────────────────────┐
│  Bun.spawn(["bun", "run",                  │
│    "src/opencode/task-agent.ts",           │
│    "--config", JSON.stringify(config)])    │
│                                             │
│  └─► Task Agent Process                     │
│      ├─► Load CLAUDE.md                     │
│      ├─► Check SQLite mail                 │
│      ├─► Execute task                     │
│      ├─► Report completion via mail        │
│      └─► Exit                               │
└─────────────────────────────────────────────┘
```

### Persistent Agents

```
┌─────────────────────────────────────────────┐
│  Bun.spawn(["bun", "run",                  │
│    "src/opencode/persistent-agent.ts",     │
│    "--role", "coordinator",                │
│    "--name", "coordinator-01"])            │
│                                             │
│  └─► Coordinator Process (24/7)             │
│      ├─► Poll SQLite mail.db (5s interval) │
│      ├─► Handle dispatch messages          │
│      ├─► Spawn child agents                │
│      └─► Respond to status requests         │
└─────────────────────────────────────────────┘
```

### Communication Flow

1. **Orchestrator** spawns agent via `ov sling`
2. Agent writes startup message to SQLite
3. Agent polls SQLite for commands
4. Orchestrator sends commands via `ov mail send`
5. Agent executes and reports via `ov mail send`
6. Orchestrator merges work via `ov merge`

## Limitations

### Compared to Original

1. **No tmux**: Cannot attach to agent sessions directly
   - Mitigation: Use `ov logs --follow` or `ov inspect`

2. **No Claude-specific hooks**: PreToolUse behavior differs
   - Mitigation: Plugin provides equivalent functionality

3. **No transcript parsing**: Different session format
   - Mitigation: Custom metrics implementation needed

4. **Process-based**: Agents die if parent process dies
   - Mitigation: Use `ov coordinator start --watchdog`

## Migration Guide

### From Original Overstory

1. **Update imports**: Change package name
2. **Configure plugin**: Add `opencode.json`
3. **Update workflows**: Replace tmux commands
4. **Test thoroughly**: Verify all commands work

### To Original Overstory

1. **Revert package.json**: Remove opencode sections
2. **Remove plugin**: Delete `opencode.json`
3. **Switch branch**: `git checkout main`
4. **Re-link**: `bun link`

## Testing

```bash
# Run all tests
bun test

# Test specific module
bun test src/opencode/agent-spawner.test.ts

# Test integration
bun test src/commands/sling.test.ts
```

## Contributing

1. Fork this repository
2. Create feature branch: `git checkout -b feature/my-feature`
3. Commit changes: `git commit -am 'feat: add feature'`
4. Push to branch: `git push origin feature/my-feature`
5. Create Pull Request

## References

- **Original**: https://github.com/jayminwest/overstory
- **Fork**: https://github.com/isaakdjedje-byte/overstory
- **OpenCode**: https://opencode.ai
- **Bun**: https://bun.sh
