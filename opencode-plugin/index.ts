/**
 * OpenCode Plugin for Overstory
 * 
 * Provides hooks for OpenCode integration:
 * - tool.execute.before: Intercept tool calls for coordination
 * - chat.system.transform: Inject agent context
 * - experimental.chat.messages.transform: Surface mail messages
 */

import type { AgentContext } from "./types";

interface PluginConfig {
	enabled: boolean;
	overstoryDir?: string;
}

interface ToolInput {
	tool: string;
	args: unknown;
	sessionID: string;
}

interface ToolOutput {
	result?: unknown;
	error?: string;
}

interface SystemInput {
	system: string[];
}

interface SystemOutput {
	system: string[];
}

interface MessagesInput {
	messages: Array<{ role: string; content: string }>;
}

interface MessagesOutput {
	messages: Array<{ role: string; content: string }>;
}

// Read-only capabilities that should not modify files
const READ_ONLY_CAPABILITIES = new Set([
	"scout",
	"reviewer",
	"monitor",
]);

// Write tools that should be blocked for read-only agents
const WRITE_TOOLS = new Set([
	"Read",
	"Write",
	"Edit",
	"Bash",
]);

/**
 * Check if agent is read-only based on environment
 */
function isReadOnlyAgent(): boolean {
	const capability = process.env.OVERSTORY_AGENT_CAPABILITY;
	if (!capability) return false;
	return READ_ONLY_CAPABILITIES.has(capability);
}

/**
 * Get agent context from environment
 */
function getAgentContext(): AgentContext | null {
	const name = process.env.OVERSTORY_AGENT_NAME;
	if (!name) return null;

	return {
		name,
		capability: process.env.OVERSTORY_AGENT_CAPABILITY ?? "unknown",
		taskId: process.env.OVERSTORY_TASK_ID ?? "unknown",
		worktreePath: process.env.OVERSTORY_WORKTREE_PATH ?? process.cwd(),
		parentAgent: process.env.OVERSTORY_PARENT_AGENT || null,
		depth: parseInt(process.env.OVERSTORY_DEPTH ?? "0", 10),
	};
}

/**
 * Check if tool is a write operation
 */
function isWriteTool(tool: string): boolean {
	return WRITE_TOOLS.has(tool);
}

/**
 * Load agent overlay from CLAUDE.md
 */
async function loadAgentOverlay(worktreePath: string): Promise<string | null> {
	try {
		const claudeMdPath = `${worktreePath}/.claude/CLAUDE.md`;
		const file = Bun.file(claudeMdPath);
		if (await file.exists()) {
			return await file.text();
		}
	} catch {
		// Ignore errors
	}
	return null;
}

/**
 * Check for unread mail messages
 */
async function checkUnreadMail(agentName: string): Promise<Array<{
	from: string;
	subject: string;
	body: string;
}>> {
	// This would query the SQLite database
	// For now, return empty
	return [];
}

/**
 * Main plugin export
 */
export default async function OverstoryPlugin({
	client,
	directory,
}: {
	client: unknown;
	directory: string;
}): Promise<{
	"tool.execute.before"?: (input: ToolInput, output: ToolOutput) => Promise<void>;
	"chat.system.transform"?: (input: SystemInput, output: SystemOutput) => Promise<void>;
	"experimental.chat.messages.transform"?: (input: MessagesInput, output: MessagesOutput) => Promise<void>;
}> {
	const ctx = getAgentContext();

	// If not running as an Overstory agent, return empty hooks
	if (!ctx) {
		return {};
	}

	console.log(`[Overstory Plugin] Initializing for agent: ${ctx.name}`);

	return {
		/**
		 * Hook: tool.execute.before
		 * Intercepts tool calls before execution
		 */
		async "tool.execute.before"(input: ToolInput, _output: ToolOutput): Promise<void> {
			// Block write tools for read-only agents
			if (isReadOnlyAgent() && isWriteTool(input.tool)) {
				throw new Error(
					`Read-only agent "${ctx.name}" (${ctx.capability}) cannot use ${input.tool}. ` +
					"This agent is restricted to read-only operations."
				);
			}

			// Log tool use for tracking
			console.log(`[${ctx.name}] Tool: ${input.tool}`);
		},

		/**
		 * Hook: chat.system.transform
		 * Inject agent context into system prompt
		 */
		async "chat.system.transform"(_input: SystemInput, output: SystemOutput): Promise<void> {
			// Load agent overlay
			const overlay = await loadAgentOverlay(ctx.worktreePath);

			if (overlay) {
				output.system.push(overlay);
			}

			// Add agent context
			output.system.push(`
## Overstory Agent Context

You are agent "${ctx.name}" with capability "${ctx.capability}".
- Task: ${ctx.taskId}
- Worktree: ${ctx.worktreePath}
- Parent: ${ctx.parentAgent ?? "coordinator"}
- Depth: ${ctx.depth}

Communication:
- Check mail: ov mail check --agent ${ctx.name}
- Send mail: ov mail send --to ${ctx.parentAgent ?? "coordinator"} --subject "..." --body "..."

${isReadOnlyAgent() ? "You are a READ-ONLY agent. Do not modify files." : "You can modify files in your worktree."}
`);
		},

		/**
		 * Hook: experimental.chat.messages.transform
		 * Surface unread mail messages
		 */
		async "experimental.chat.messages.transform"(
			_input: MessagesInput,
			output: MessagesOutput,
		): Promise<void> {
			// Check for unread mail
			const unread = await checkUnreadMail(ctx.name);

			if (unread.length > 0) {
				// Add mail notification to messages
				output.messages.push({
					role: "system",
					content: `You have ${unread.length} unread message(s):\n\n${unread
						.map((m) => `- From: ${m.from}, Subject: ${m.subject}`)
						.join("\n")}\n\nUse "ov mail check --agent ${ctx.name}" to read them.`,
				});
			}
		},
	};
}

/**
 * Agent context type
 */
interface AgentContext {
	name: string;
	capability: string;
	taskId: string;
	worktreePath: string;
	parentAgent: string | null;
	depth: number;
}
