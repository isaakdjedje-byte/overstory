/**
 * Persistent Agent Runner
 * 
 * Long-running process for coordinator, supervisor, and monitor agents.
 * Maintains SQLite connection and responds to mail messages.
 */

import { parseArgs } from "node:util";
import { Database } from "bun:sqlite";
import { join } from "node:path";
import { existsSync } from "node:fs";

interface AgentContext {
	role: string;
	name: string;
	worktreePath: string;
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

function parseArguments() {
	const { values } = parseArgs({
		args: Bun.argv,
		options: {
			role: { type: "string" },
			name: { type: "string" },
		},
		strict: true,
		allowPositionals: true,
	});

	return {
		role: values.role ?? "coordinator",
		name: values.name ?? "unnamed",
	};
}

function initializeContext(role: string, name: string): AgentContext {
	const worktreePath = process.env.OVERSTORY_WORKTREE_PATH ?? process.cwd();
	const overstoryDir = join(worktreePath, ".overstory");

	if (!existsSync(overstoryDir)) {
		throw new Error(`Overstory directory not found: ${overstoryDir}`);
	}

	const mailDbPath = join(overstoryDir, "mail.db");
	const mailDb = new Database(mailDbPath);
	mailDb.exec("PRAGMA journal_mode=WAL");
	mailDb.exec("PRAGMA busy_timeout=5000");

	mailDb.exec(`
		CREATE TABLE IF NOT EXISTS messages (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			from_agent TEXT NOT NULL,
			to_agent TEXT NOT NULL,
			subject TEXT NOT NULL,
			body TEXT NOT NULL,
			type TEXT DEFAULT 'message',
			priority TEXT DEFAULT 'normal',
			created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
			read BOOLEAN DEFAULT FALSE
		)
	`);

	return {
		role,
		name,
		worktreePath,
		overstoryDir,
		mailDb,
	};
}

function checkMail(ctx: AgentContext): MailMessage[] {
	const stmt = ctx.mailDb.prepare(
		"SELECT * FROM messages WHERE to_agent = ? AND read = FALSE ORDER BY created_at ASC",
	);
	return stmt.all(ctx.name) as MailMessage[];
}

function markRead(ctx: AgentContext, messageId: number): void {
	const stmt = ctx.mailDb.prepare("UPDATE messages SET read = TRUE WHERE id = ?");
	stmt.run(messageId);
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
	stmt.run(ctx.name, to, subject, body, type);
}

async function handleMessage(ctx: AgentContext, msg: MailMessage): Promise<void> {
	console.log(`[${ctx.name}] Received ${msg.type} from ${msg.from_agent}: ${msg.subject}`);

	switch (msg.type) {
		case "dispatch":
			await handleDispatch(ctx, msg);
			break;
		case "status":
			await handleStatusRequest(ctx, msg);
			break;
		case "stop":
			await handleStop(ctx, msg);
			break;
		default:
			console.log(`[${ctx.name}] Unknown message type: ${msg.type}`);
	}

	markRead(ctx, msg.id);
}

async function handleDispatch(ctx: AgentContext, msg: MailMessage): Promise<void> {
	if (ctx.role === "coordinator" || ctx.role === "supervisor") {
		console.log(`[${ctx.name}] Dispatching task: ${msg.body}`);
		sendMessage(ctx, msg.from_agent, "Dispatch received", `Task dispatched: ${msg.subject}`, "ack");
	}
}

async function handleStatusRequest(ctx: AgentContext, msg: MailMessage): Promise<void> {
	const status = {
		role: ctx.role,
		name: ctx.name,
		worktree: ctx.worktreePath,
		uptime: process.uptime(),
		pid: process.pid,
	};
	sendMessage(ctx, msg.from_agent, "Status report", JSON.stringify(status, null, 2), "status");
}

async function handleStop(ctx: AgentContext, msg: MailMessage): Promise<void> {
	console.log(`[${ctx.name}] Received stop command from ${msg.from_agent}`);
	sendMessage(ctx, msg.from_agent, "Stopping", "Agent shutting down", "ack");
	process.exit(0);
}

async function runAgent(ctx: AgentContext): Promise<void> {
	console.log(`[${ctx.name}] ${ctx.role} agent started`);
	console.log(`[${ctx.name}] Worktree: ${ctx.worktreePath}`);
	console.log(`[${ctx.name}] PID: ${process.pid}`);

	sendMessage(
		ctx,
		"orchestrator",
		"Agent started",
		`${ctx.role} agent ${ctx.name} is now running`,
		"startup",
	);

	const POLL_INTERVAL = 5000;

	while (true) {
		try {
			const messages = checkMail(ctx);

			for (const msg of messages) {
				await handleMessage(ctx, msg);
			}
		} catch (err) {
			console.error(`[${ctx.name}] Error checking mail:`, err);
		}

		await Bun.sleep(POLL_INTERVAL);
	}
}

function cleanup(ctx: AgentContext): void {
	console.log(`[${ctx.name}] Cleaning up...`);
	ctx.mailDb.close();
}

async function main(): Promise<void> {
	const { role, name } = parseArguments();

	try {
		const ctx = initializeContext(role, name);

		process.on("SIGINT", () => {
			cleanup(ctx);
			process.exit(0);
		});

		process.on("SIGTERM", () => {
			cleanup(ctx);
			process.exit(0);
		});

		await runAgent(ctx);
	} catch (err) {
		console.error(`[${name}] Fatal error:`, err);
		process.exit(1);
	}
}

if (import.meta.main) {
	main();
}
