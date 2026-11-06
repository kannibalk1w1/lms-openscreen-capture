import { createHash, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import fs from "node:fs/promises";
import http from "node:http";
import path from "node:path";
import type {
	ApplicationIntegrationHost,
	IntegrationProvider,
} from "../../src/lib/applicationIntegrations/host";
import {
	GODOT_CLOCK_DESCRIPTOR,
	type IntegrationSession,
} from "../../src/lib/applicationIntegrations/schema";
import {
	type ClockBridgeStatus,
	type ClockRequest,
	clockLinkSchema,
	clockRequestSchema,
	type NativeClockSnapshot,
	NativeClockSourceEndedError,
	nativeClockSnapshotSchema,
} from "../../src/lib/clockBridge/schema";

interface Peer {
	context: IntegrationSession;
	emit?: (value: unknown) => boolean;
	lastSequence: number;
	lastTick: number;
	observationSequence: number;
	lastAccess: number;
	inFlight: boolean;
}
interface Grant {
	id: string;
	projectId: string;
	projectPath: string;
	token: string;
	file: string;
	deadline: number;
	server: http.Server;
	peers: Map<string, Peer>;
	inFlight: number;
	sourceClockId: string | null;
}
/** Read-only localhost transport. It cannot start/pause recording or accept editor text. */
export class RecordingClockBridge {
	readonly provider: IntegrationProvider;
	private host: ApplicationIntegrationHost | null = null;
	private grant: Grant | null = null;
	private timer: ReturnType<typeof setInterval> | undefined;
	private lastPoint: NativeClockSnapshot | null = null;
	private lastSampleAt = 0;
	private expired = false;
	private ended = false;
	private creating = false;
	private operation = 0;
	constructor(
		private readonly queryNative: (expectedClockId?: string) => Promise<NativeClockSnapshot>,
		private readonly isAvailable: () => boolean,
		private readonly now = () => performance.now(),
		private readonly ttlMs = 3600000,
	) {
		this.provider = {
			descriptor: GODOT_CLOCK_DESCRIPTOR,
			start: (context, emit) => {
				const grant = this.grant;
				const peer = grant?.peers.get(context.instanceId);
				if (
					!grant ||
					this.now() >= grant.deadline ||
					!peer ||
					context.scope.kind !== "paired-project" ||
					context.scope.grantId !== grant.id ||
					context.scope.projectId !== grant.projectId
				)
					throw new Error("Clock project pairing is unavailable");
				peer.emit = emit;
				return () => {
					grant.peers.delete(context.instanceId);
				};
			},
		};
	}
	attachHost(host: ApplicationIntegrationHost) {
		if (this.host && this.host !== host) throw new Error("Clock host already attached");
		this.host = host;
	}
	snapshot(): ClockBridgeStatus {
		const grant = this.grant;
		const age = this.lastPoint ? Math.max(0, this.now() - this.lastSampleAt) : undefined;
		let state: ClockBridgeStatus["state"] = this.ended
			? "ended"
			: this.expired
				? "expired"
				: "disabled";
		if (grant)
			state =
				this.now() >= grant.deadline
					? "expired"
					: !grant.peers.size
						? "paired"
						: !this.lastPoint
							? "waiting"
							: age !== undefined && age > 1500
								? "stale"
								: this.lastPoint.state === "recording"
									? "recording"
									: this.lastPoint.state === "paused"
										? "paused"
										: "waiting";
		return {
			available: this.isAvailable(),
			state,
			peers: grant?.peers.size ?? 0,
			...(grant
				? { pairFilePath: grant.file, projectLabel: path.basename(grant.projectPath) }
				: {}),
			...(age !== undefined ? { lastSampleAgeMs: Math.round(age) } : {}),
		};
	}
	async createPair(projectDirectory: string, file: string): Promise<ClockBridgeStatus> {
		if (this.creating) throw new Error("Clock pairing is already changing");
		this.creating = true;
		const operation = ++this.operation;
		try {
			if (!this.host || !this.isAvailable())
				throw new Error("Native Linux recording clock is unavailable");
			const projectPath = await fs.realpath(projectDirectory);
			const project = await fs.stat(path.join(projectPath, "project.godot"));
			if (!project.isFile()) throw new Error("Choose a Godot project");
			try {
				await fs.lstat(file);
				throw new Error("Clock link destination already exists");
			} catch (error) {
				if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
			}
			if (operation !== this.operation) throw new Error("Clock pairing was cancelled");
			await this.closeGrant();
			if (operation !== this.operation) throw new Error("Clock pairing was cancelled");
			this.expired = false;
			const server = http.createServer(
				{
					headersTimeout: 2000,
					requestTimeout: 2000,
					connectionsCheckingInterval: 500,
					maxHeaderSize: 2048,
				},
				(request, response) => {
					void this.receive(request, response).catch(() =>
						this.reply(response, 503, { success: false, code: "clock-unavailable" }),
					);
				},
			);
			server.maxConnections = 8;
			server.maxHeadersCount = 16;
			server.keepAliveTimeout = 1000;
			server.maxRequestsPerSocket = 64;
			const grant: Grant = {
				id: randomUUID(),
				projectId: createHash("sha256").update(projectPath).digest("hex"),
				projectPath,
				token: randomBytes(32).toString("hex"),
				file: path.resolve(file),
				deadline: this.now() + this.ttlMs,
				server,
				peers: new Map(),
				inFlight: 0,
				sourceClockId: null,
			};
			this.grant = grant;
			try {
				await new Promise<void>((resolve, reject) => {
					server.once("error", reject);
					server.listen(0, "127.0.0.1", () => {
						server.removeListener("error", reject);
						resolve();
					});
				});
				if (operation !== this.operation) throw new Error("Clock pairing was cancelled");
				server.on("error", () => {
					if (this.grant === grant) void this.stop();
				});
				const address = server.address();
				if (!address || typeof address === "string")
					throw new Error("Clock listener is unavailable");
				const link = clockLinkSchema.parse({
					format: "openscreen-clock-link",
					version: 1,
					endpoint: `http://127.0.0.1:${address.port}/clock`,
					token: grant.token,
					grantId: grant.id,
					projectId: grant.projectId,
					projectPath,
				});
				await fs.writeFile(grant.file, JSON.stringify(link, null, 2) + "\n", {
					flag: "wx",
					mode: 0o600,
				});
				if (process.platform !== "win32" && ((await fs.stat(grant.file)).mode & 0o077) !== 0)
					throw new Error("Clock link is not private");
				if (operation !== this.operation) throw new Error("Clock pairing was cancelled");
				this.host.enable(GODOT_CLOCK_DESCRIPTOR.id);
				this.timer = setInterval(() => {
					const current = this.grant;
					if (!current) return;
					if (this.now() >= current.deadline) {
						this.expired = true;
						void this.stop(true);
						return;
					}
					for (const [id, peer] of current.peers)
						if (!peer.inFlight && this.now() - peer.lastAccess > 10000) this.host?.close(id);
				}, 1000);
				this.timer.unref();
				return this.snapshot();
			} catch {
				await this.closeGrant();
				throw new Error("Could not create private recording clock link");
			}
		} finally {
			this.creating = false;
		}
	}
	async stop(expired = false): Promise<ClockBridgeStatus> {
		this.operation++;
		return this.closeGrant(expired);
	}
	private async closeGrant(expired = false, ended = false): Promise<ClockBridgeStatus> {
		const grant = this.grant;
		this.grant = null;
		this.expired = expired;
		this.ended = ended;
		this.lastPoint = null;
		if (this.timer) clearInterval(this.timer);
		this.timer = undefined;
		this.host?.disable(GODOT_CLOCK_DESCRIPTOR.id);
		if (grant) {
			grant.token = "";
			grant.server.closeAllConnections();
			await new Promise<void>((resolve) => grant.server.close(() => resolve()));
		}
		return this.snapshot();
	}
	private reply(response: http.ServerResponse, status: number, body: unknown) {
		if (response.destroyed) return;
		response.writeHead(status, { "Content-Type": "application/json", "Cache-Control": "no-store" });
		response.end(JSON.stringify(body));
	}
	private async receive(request: http.IncomingMessage, response: http.ServerResponse) {
		const grant = this.grant;
		request.setTimeout(2000, () => request.destroy());
		if (!grant || this.now() >= grant.deadline) {
			this.reply(response, 410, { success: false, code: "expired" });
			return;
		}
		const auth = request.headers.authorization;
		if (
			request.method !== "POST" ||
			request.url !== "/clock" ||
			request.headers.origin ||
			typeof auth !== "string" ||
			!/^Bearer [0-9a-f]{64}$/.test(auth) ||
			!timingSafeEqual(Buffer.from(auth.slice(7)), Buffer.from(grant.token))
		) {
			this.reply(response, 403, { success: false, code: "unauthorized" });
			return;
		}
		let body: ClockRequest;
		try {
			let text = "";
			let bytes = 0;
			for await (const chunk of request) {
				bytes += Buffer.byteLength(chunk);
				if (bytes > 2048) {
					this.reply(response, 413, { success: false, code: "request-limit" });
					request.destroy();
					return;
				}
				text += chunk.toString("utf8");
			}
			body = clockRequestSchema.parse(JSON.parse(text));
		} catch {
			this.reply(response, 400, { success: false, code: "invalid-request" });
			return;
		}
		if (this.grant !== grant || body.grantId !== grant.id || body.projectId !== grant.projectId) {
			this.reply(response, 403, { success: false, code: "scope-mismatch" });
			return;
		}
		let peer = grant.peers.get(body.instanceId);
		if (!peer) {
			if (grant.peers.size >= 4) {
				this.reply(response, 429, { success: false, code: "peer-limit" });
				return;
			}
			peer = {
				context: {
					version: 1,
					adapterId: GODOT_CLOCK_DESCRIPTOR.id,
					instanceId: body.instanceId,
					sessionId: grant.id,
					capability: "recording.clock",
					scope: {
						kind: "paired-project",
						applicationId: "godot",
						projectId: grant.projectId,
						grantId: grant.id,
					},
				},
				lastSequence: -1,
				lastTick: 0,
				observationSequence: 0,
				lastAccess: -Infinity,
				inFlight: false,
			};
			grant.peers.set(body.instanceId, peer);
			try {
				await this.host!.open(peer.context, { pairedProjectGrantId: grant.id });
			} catch {
				grant.peers.delete(body.instanceId);
				this.reply(response, 503, { success: false, code: "capability-unavailable" });
				return;
			}
		}
		if (peer.inFlight || grant.inFlight >= 4 || this.now() - peer.lastAccess < 100) {
			this.reply(response, 429, { success: false, code: "query-limit" });
			return;
		}
		if (body.sequence <= peer.lastSequence || body.clientSendMs < peer.lastTick) {
			this.reply(response, 409, { success: false, code: "stale-request" });
			return;
		}
		peer.lastSequence = body.sequence;
		peer.lastTick = body.clientSendMs;
		peer.lastAccess = this.now();
		peer.inFlight = true;
		grant.inFlight++;
		try {
			let point: NativeClockSnapshot | undefined;
			let sourceEnded = false;
			try {
				point = nativeClockSnapshotSchema.parse(
					await this.queryNative(grant.sourceClockId ?? undefined),
				);
				if (grant.sourceClockId && point.clockId !== grant.sourceClockId) {
					point = undefined;
					sourceEnded = true;
				} else grant.sourceClockId = point.clockId;
			} catch (error) {
				if (error instanceof NativeClockSourceEndedError) sourceEnded = true;
				/* Unavailable is an explicit gap; never create a media timestamp. */
			}
			if (this.grant !== grant || !peer.emit) {
				this.reply(response, 410, { success: false, code: "revoked" });
				return;
			}
			if (sourceEnded) {
				const payload = { requestSequence: body.sequence, reason: "source-ended" };
				peer.emit({
					...peer.context,
					sequence: peer.observationSequence++,
					type: "clock-gap",
					clock: { id: body.instanceId, tickMs: body.clientSendMs, relation: "unmapped" },
					provenance: "observed",
					payload,
				});
				try {
					this.host!.take(body.instanceId);
				} catch {
					/* The session may already be revoked. */
				}
				let closed = false;
				const close = () => {
					if (closed) return;
					closed = true;
					if (this.grant !== grant) return;
					this.operation++;
					void this.closeGrant(false, true);
				};
				if (response.destroyed) close();
				else {
					response.once("finish", close);
					response.once("close", close);
				}
				this.reply(response, 410, {
					success: false,
					code: "source-ended",
					version: 1,
					grantId: grant.id,
					instanceId: body.instanceId,
					sequence: body.sequence,
					clientSendMs: body.clientSendMs,
				});
				return;
			}
			const payload = point
				? { requestSequence: body.sequence, nativeClock: point }
				: { requestSequence: body.sequence, reason: "native-unavailable" };
			if (
				!peer.emit({
					...peer.context,
					sequence: peer.observationSequence++,
					type: point ? "clock-sample" : "clock-gap",
					clock: { id: body.instanceId, tickMs: body.clientSendMs, relation: "unmapped" },
					provenance: "observed",
					payload,
				})
			) {
				this.reply(response, 503, { success: false, code: "capability-unavailable" });
				return;
			}
			const retained = this.host!.take(body.instanceId);
			if (retained.length !== 1) {
				this.reply(response, 503, { success: false, code: "capability-unavailable" });
				return;
			}
			if (point) {
				this.lastPoint = point;
				this.lastSampleAt = this.now();
				this.reply(response, 200, {
					success: true,
					version: 1,
					grantId: grant.id,
					instanceId: body.instanceId,
					sequence: body.sequence,
					clientSendMs: body.clientSendMs,
					nativeClock: point,
				});
			} else {
				this.lastPoint = null;
				this.lastSampleAt = 0;
				this.reply(response, 503, {
					success: false,
					code: "native-unavailable",
					version: 1,
					grantId: grant.id,
					instanceId: body.instanceId,
					sequence: body.sequence,
					clientSendMs: body.clientSendMs,
				});
			}
		} catch {
			this.reply(response, 503, { success: false, code: "capability-unavailable" });
		} finally {
			peer.inFlight = false;
			grant.inFlight--;
		}
	}
}
