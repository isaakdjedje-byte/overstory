/**
 * OpenCode Agent Spawner
 * 
 * Adapts Overstory's agent spawning for OpenCode.
 * Uses hybrid approach:
 * - Persistent agents (coordinator, supervisor, monitor): Bun.spawn subprocess
 * - Task agents (builder, scout, reviewer): Task tool
 */

import { join } from "node:path";
import { AgentError } from "../errors.ts";
import type { AgentSession } from "../types.ts";

/** Capabilities that need persistent processes (24/7) */
const PERSISTENT_CAPABILITIES = new Set([
	"coordinator",
	"supervisor",
	"monitor",
]);

/** Capabilities that can use Task tool (ephemeral) */
const TASK_CAPABILITIES = new Set([
	"builder",
	"scout",
	"reviewer",
	"merger",
	"lead",
]);

export interface AgentConfig {
	name: string;
	capability: string;
	taskId: string;
	worktreePath: string;
	branchName: string;
	parentAgent: string | null;
	depth: number;
	specPath: string | null;
	fileScope: string[];
	runId: string;
}

export interface SpawnResult {
	session: AgentSession;
	pid?: number;
	taskId?: string;
}

function isPersistent(capability: string): boolean {
	return PERSISTENT_CAPABILITIES.has(capability);
}

function buildAgentEnv(config: AgentConfig): Record<string, string> {
	return {
		OVERSTORY_AGENT_NAME: config.name,
		OVERSTORY_AGENT_CAPABILITY: config.capability,
		OVERSTORY_TASK_ID: config.taskId,
		OVERSTORY_WORKTREE_PATH: config.worktreePath,
		OVERSTORY_BRANCH_NAME: config.branchName,
		OVERSTORY_PARENT_AGENT: config.parentAgent ?? "",
		OVERSTORY_DEPTH: String(config.depth),
		OVERSTORY_RUN_ID: config.runId,
		OVERSTORY_MODE: "agent",
	};
}

async function spawnPersistentAgent(config: AgentConfig): Promise<SpawnResult> {
	const env = buildAgentEnv(config);
	const scriptPath = join(
		new URL(import.meta.url).pathname,
		"..",
		"persistent-agent.ts",
	);

	const proc = Bun.spawn(
		[
			"bun",
			"run",
			scriptPath,
			"--role",
			config.capability,
			"--name",
			config.name,
		],
		{
			cwd: config.worktreePath,
			env,
			stdio: ["pipe", "pipe", "pipe"],
		},
	);

	const session: AgentSession = {
		id: `session-${Date.now()}-${config.name}`,
		agentName: config.name,
		capability: config.capability,
		worktreePath: config.worktreePath,
		branchName: config.branchName,
		taskId: config.taskId,
		tmuxSession: null,
		state: "booting",
		pid: proc.pid,
		parentAgent: config.parentAgent,
		depth: config.depth,
		runId: config.runId,
		startedAt: new Date().toISOString(),
		lastActivity: new Date().toISOString(),
		escalationLevel: 0,
		stalledSince: null,
	};

	proc.exited.then((code) => {
		console.log(`Agent ${config.name} exited with code ${code}`);
	});

	return { session, pid: proc.pid };
}

async function spawnTaskAgent(config: AgentConfig): Promise<SpawnResult> {
	const env = buildAgentEnv(config);
	const scriptPath = join(
		new URL(import.meta.url).pathname,
		"..",
		"task-agent.ts",
	);

	const proc = Bun.spawn(
		[
			"bun",
			"run",
			scriptPath,
			"--config",
			JSON.stringify(config),
		],
		{
			cwd: config.worktreePath,
			env,
			stdio: ["pipe", "pipe", "pipe"],
		},
	);

	const session: AgentSession = {
		id: `session-${Date.now()}-${config.name}`,
		agentName: config.name,
		capability: config.capability,
		worktreePath: config.worktreePath,
		branchName: config.branchName,
		taskId: config.taskId,
		tmuxSession: null,
		state: "booting",
		pid: proc.pid,
		parentAgent: config.parentAgent,
		depth: config.depth,
		runId: config.runId,
		startedAt: new Date().toISOString(),
		lastActivity: new Date().toISOString(),
		escalationLevel: 0,
		stalledSince: null,
	};

	return { session, pid: proc.pid };
}

export async function spawnAgent(config: AgentConfig): Promise<SpawnResult> {
	if (
		!PERSISTENT_CAPABILITIES.has(config.capability) &&
		!TASK_CAPABILITIES.has(config.capability)
	) {
		throw new AgentError(
			`Unknown capability "${config.capability}"`,
			{ agentName: config.name },
		);
	}

	if (isPersistent(config.capability)) {
		return spawnPersistentAgent(config);
	}

	return spawnTaskAgent(config);
}

export async function stopAgent(pid: number, force = false): Promise<boolean> {
	try {
		process.kill(pid, force ? "SIGKILL" : "SIGTERM");
		return true;
	} catch {
		return false;
	}
}

export function isAgentRunning(pid: number): boolean {
	try {
		process.kill(pid, 0);
		return true;
	} catch {
		return false;
	}
}
