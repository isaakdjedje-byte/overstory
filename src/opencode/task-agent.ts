/**
 * Task Agent Runner
 * 
 * Ephemeral agent for builder, scout, reviewer, merger, and lead.
 * Executes a single task and reports completion.
 */

import { parseArgs } from "node:util";
import { Database } from "bun:sqlite";
import { join } from "node:path";
import { existsSync } from "node:fs";

interface TaskConfig {
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

interface AgentContext {
	config: TaskConfig;
	overstoryDir: string;
	mailDb: Database;
}

interface MailMessage {
	id: number;
	from_agent: string;
	to_agent: string;
	subject: string;
	body: string;
	type: string;
	priority: string;
	created_at: string;
	read: boolean;
}

function parseArguments(): TaskConfig {
	const { values } = parseArgs({
		args: Bun.argv,
		options: {
			config: { type: "string" },
		},
		strict: true,
		allowPositionals: true,
	});

	if (!values.config) {
		throw new Error("--config is required");
	}

	return JSON.parse(values.config) as TaskConfig;
}

function initializeContext(config: TaskConfig): AgentContext {
	const overstoryDir = join(config.worktreePath, ".overstory");

	if (!existsSync(overstoryDir)) {
		throw new Error(`Overstory directory not found: ${overstoryDir}`);
	}

	const mailDbPath = join(overstoryDir, "mail.db");
	const mailDb = new Database(mailDbPath);
	mailDb.exec("PRAGMA journal_mode=WAL");
	mailDb.exec("PRAGMA busy_timeout=5000");

	return {
		config,
		overstoryDir,
		mailDb,
	};
}

function checkMail(ctx: AgentContext): MailMessage[] {
	const stmt = ctx.mailDb.prepare(
		"SELECT * FROM messages WHERE to_agent = ? AND read = FALSE ORDER BY created_at ASC",
	);
	return stmt.all(ctx.config.name) as MailMessage[];
}

function sendMessage(
	ctx: AgentContext,
	to: string,
	subject: string,
	body: string,
	type = "response",
): void {
	const stmt = ctx.mailDb.prepare(
		"INSERT INTO messages (from_agent, to_agent, subject, body, type) VALUES (?, ?, ?, ?, ?)",
	);
	stmt.run(ctx.config.name, to, subject, body, type);
}

async function executeTask(ctx: AgentContext): Promise<void> {
	const { config } = ctx;

	console.log(`[${config.name}] Starting task execution`);
	console.log(`[${config.name}] Capability: ${config.capability}`);
	console.log(`[${config.name}] Task: ${config.taskId}`);

	// Send startup message
	sendMessage(
		ctx,
		config.parentAgent ?? "orchestrator",
		"Task started",
		`Starting task ${config.taskId} as ${config.capability}`,
		"startup",
	);

	// TODO: Implement task execution logic
	// This is where the actual work happens
	// - Read CLAUDE.md
	// - Execute based on capability
	// - Report progress

	console.log(`[${config.name}] Executing task...`);

	// Simulate work
	await Bun.sleep(10000);

	// Mark task as complete
	sendMessage(
		ctx,
		config.parentAgent ?? "orchestrator",
		"Task complete",
		`Task ${config.taskId} completed successfully`,
		"worker_done",
	);

	console.log(`[${config.name}] Task completed`);
}

async function runTaskAgent(ctx: AgentContext): Promise<void> {
	try {
		await executeTask(ctx);
	} catch (err) {
		console.error(`[${ctx.config.name}] Task execution failed:`, err);
		sendMessage(
			ctx,
			ctx.config.parentAgent ?? "orchestrator",
			"Task failed",
			`Task ${ctx.config.taskId} failed: ${err}`,
			"error",
		);
		process.exit(1);
	}
}

function cleanup(ctx: AgentContext): void {
	console.log(`[${ctx.config.name}] Cleaning up...`);
	ctx.mailDb.close();
}

async function main(): Promise<void> {
	try {
		const config = parseArguments();
		const ctx = initializeContext(config);

		process.on("SIGINT", () => {
			cleanup(ctx);
			process.exit(0);
		});

		process.on("SIGTERM", () => {
			cleanup(ctx);
			process.exit(0);
		});

		await runTaskAgent(ctx);
		cleanup(ctx);
		process.exit(0);
	} catch (err) {
		console.error("Fatal error:", err);
		process.exit(1);
	}
}

if (import.meta.main) {
	main();
}
