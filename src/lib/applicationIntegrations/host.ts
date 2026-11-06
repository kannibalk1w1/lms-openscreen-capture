import {
	type IntegrationDescriptor,
	type IntegrationObservation,
	type IntegrationSession,
	type IntegrationStatus,
	integrationDescriptorSchema,
	integrationObservationSchema,
	integrationSessionSchema,
} from "./schema";

export interface IntegrationProvider {
	descriptor: IntegrationDescriptor;
	start(
		session: IntegrationSession,
		emit: (observation: unknown) => boolean,
	): Promise<() => void> | (() => void);
}
interface Connection {
	context: IntegrationSession;
	active: boolean;
	observations: IntegrationObservation[];
	bytes: number;
	nextSequence: number;
	lastTick: number;
	clockId: string | null;
	stop?: () => void;
}
const MAX_BYTES = 8 * 1024 * 1024 + 65536;
/** Internal optional producer boundary. It never owns or calls recorder lifecycle. */
export class ApplicationIntegrationHost {
	private readonly providers = new Map<string, IntegrationProvider>();
	private readonly descriptors = new Map<string, IntegrationDescriptor>();
	private readonly enabled = new Set<string>();
	private readonly sessions = new Map<string, Connection>();
	private readonly errors = new Map<string, IntegrationStatus["error"]>();
	constructor(
		descriptors: IntegrationDescriptor[] = [],
		providers: IntegrationProvider[] = [],
		private readonly timeoutMs = 5000,
	) {
		for (const descriptor of descriptors) {
			const valid = integrationDescriptorSchema.parse(descriptor);
			if (this.descriptors.has(valid.id)) throw new Error("Duplicate integration descriptor");
			this.descriptors.set(valid.id, valid);
		}
		for (const provider of providers) {
			const descriptor = this.descriptors.get(provider.descriptor.id);
			const parsed = integrationDescriptorSchema.safeParse(provider.descriptor);
			if (!descriptor) continue;
			if (
				!parsed.success ||
				JSON.stringify(descriptor) !== JSON.stringify(parsed.data) ||
				this.providers.has(descriptor.id) ||
				this.errors.get(descriptor.id) === "contract-mismatch"
			) {
				this.providers.delete(descriptor.id);
				this.errors.set(descriptor.id, "contract-mismatch");
				continue;
			}
			this.providers.set(descriptor.id, provider);
		}
	}
	setEnabled(ids: readonly string[]) {
		for (const id of [...this.enabled]) if (!ids.includes(id)) this.disable(id);
		for (const id of ids)
			if (this.descriptors.has(id)) {
				this.enabled.add(id);
				if (this.providers.has(id)) this.errors.delete(id);
			}
	}
	disable(id: string) {
		this.enabled.delete(id);
		for (const [key, connection] of this.sessions)
			if (connection.context.adapterId === id) this.close(key);
	}
	statuses(): IntegrationStatus[] {
		return [...this.descriptors.values()].map((descriptor) => ({
			descriptor: JSON.parse(JSON.stringify(descriptor)) as IntegrationDescriptor,
			enabled: this.enabled.has(descriptor.id),
			state: !this.enabled.has(descriptor.id)
				? "disabled"
				: !this.providers.has(descriptor.id)
					? this.errors.get(descriptor.id) === "contract-mismatch"
						? "incompatible"
						: "unavailable"
					: this.errors.has(descriptor.id)
						? "error"
						: [...this.sessions.values()].some(
									(c) => c.context.adapterId === descriptor.id && c.active,
								)
							? "connecting"
							: "available-offline",
			activeSessions: [...this.sessions.values()].filter(
				(c) => c.context.adapterId === descriptor.id && c.active,
			).length,
			...(this.errors.get(descriptor.id) ? { error: this.errors.get(descriptor.id) } : {}),
		}));
	}
	async open(value: unknown, permission: { selectedFileAuthorized: boolean }): Promise<string> {
		const context = integrationSessionSchema.parse(value);
		const provider = this.providers.get(context.adapterId);
		if (
			!this.enabled.has(context.adapterId) ||
			!permission.selectedFileAuthorized ||
			!provider ||
			!this.descriptors.get(context.adapterId)?.capabilities.includes(context.capability)
		)
			throw new Error("Integration capability is unavailable or not authorized");
		if (this.sessions.size >= 16 || this.sessions.has(context.instanceId))
			throw new Error("Integration instance is already used or at capacity");
		const connection: Connection = {
			context,
			active: true,
			observations: [],
			bytes: 0,
			nextSequence: 0,
			lastTick: 0,
			clockId: null,
		};
		this.sessions.set(context.instanceId, connection);
		this.errors.delete(context.adapterId);
		let timer: ReturnType<typeof setTimeout> | undefined;
		const started = Promise.resolve()
			.then(() =>
				provider.start(integrationSessionSchema.parse(context), (raw) =>
					this.accept(connection, raw),
				),
			)
			.then((stop) => {
				if (!connection.active) {
					try {
						stop();
					} catch {
						/* Optional teardown cannot break the recorder. */
					}
				} else connection.stop = stop;
			});
		try {
			await Promise.race([
				started,
				new Promise<never>((_, reject) => {
					timer = setTimeout(() => reject(new Error("timeout")), this.timeoutMs);
				}),
			]);
			if (!connection.active) throw new Error("stopped");
			return context.instanceId;
		} catch (error) {
			if (!this.errors.has(context.adapterId))
				this.errors.set(
					context.adapterId,
					error instanceof Error && error.message === "timeout" ? "timeout" : "start-failed",
				);
			this.close(context.instanceId);
			throw new Error("Optional integration could not start");
		} finally {
			if (timer) clearTimeout(timer);
		}
	}
	private accept(connection: Connection, raw: unknown): boolean {
		// Check permission/liveness before looking at or serializing a private payload.
		if (!connection.active || !this.enabled.has(connection.context.adapterId)) return false;
		try {
			const observation = integrationObservationSchema.parse(raw);
			const expected = connection.context;
			if (
				observation.adapterId !== expected.adapterId ||
				observation.instanceId !== expected.instanceId ||
				observation.sessionId !== expected.sessionId ||
				observation.capability !== expected.capability ||
				JSON.stringify(observation.scope) !== JSON.stringify(expected.scope) ||
				observation.sequence !== connection.nextSequence ||
				observation.clock.tickMs < connection.lastTick ||
				(connection.clockId !== null && observation.clock.id !== connection.clockId)
			)
				throw new Error("identity");
			const bytes = new TextEncoder().encode(JSON.stringify(observation)).byteLength;
			if (connection.observations.length >= 64 || connection.bytes + bytes > MAX_BYTES) {
				this.errors.set(expected.adapterId, "capacity");
				this.close(expected.instanceId);
				return false;
			}
			// Detach mutable producer objects before any consumer receives retained evidence.
			connection.observations.push(
				JSON.parse(JSON.stringify(observation)) as IntegrationObservation,
			);
			connection.bytes += bytes;
			connection.nextSequence++;
			connection.lastTick = observation.clock.tickMs;
			connection.clockId = observation.clock.id;
			return true;
		} catch {
			this.errors.set(connection.context.adapterId, "invalid-observation");
			this.close(connection.context.instanceId);
			return false;
		}
	}
	take(instanceId: string): IntegrationObservation[] {
		const connection = this.sessions.get(instanceId);
		if (!connection?.active) throw new Error("Integration session is unavailable");
		const observations = connection.observations;
		connection.observations = [];
		connection.bytes = 0;
		return observations;
	}
	close(instanceId: string) {
		const connection = this.sessions.get(instanceId);
		if (!connection) return;
		connection.active = false;
		connection.observations = [];
		connection.bytes = 0;
		this.sessions.delete(instanceId);
		try {
			connection.stop?.();
		} catch {
			this.errors.set(connection.context.adapterId, "stopped");
		}
	}
}
