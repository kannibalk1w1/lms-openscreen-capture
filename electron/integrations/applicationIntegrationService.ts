import { randomUUID } from "node:crypto";
import { z } from "zod";
import {
	ApplicationIntegrationHost,
	type IntegrationProvider,
} from "../../src/lib/applicationIntegrations/host";
import {
	GODOT_JOURNAL_DESCRIPTOR,
	type IntegrationSettings,
	integrationSettingsSchema,
} from "../../src/lib/applicationIntegrations/schema";
import { importTypingFiles } from "../../src/lib/typing/import";
import type { ImportedTypingFile } from "../../src/lib/typing/portable";
import { MAX_TYPING_BYTES, typingTakeSchema } from "../../src/lib/typing/schema";
import type { AppSettingsStore } from "../app-settings";

export class TypingIntegrationDisabledError extends Error {
	constructor() {
		super("Enable Godot journal import before reading this raw journal");
	}
}

/** The only current integration is an explicitly selected-file decoder, never a live watcher. */
export class ApplicationIntegrationService {
	private readonly sources = new Map<string, string>();
	readonly host: ApplicationIntegrationHost;
	private saveFailed = false;
	constructor(
		private readonly settings: Pick<
			AppSettingsStore,
			"getIntegrationSettings" | "setIntegrationSettings"
		>,
	) {
		const provider: IntegrationProvider = {
			descriptor: GODOT_JOURNAL_DESCRIPTOR,
			start: (session, emit) => {
				const source = this.sources.get(session.instanceId);
				this.sources.delete(session.instanceId);
				if (source === undefined) throw new Error("Selected import is unavailable");
				const files = importTypingFiles(source);
				if (files.length !== 1 || files[0].take.producer !== "godot-codeedit")
					throw new Error("Unsupported Godot journal");
				const take = files[0].take;
				emit({
					...session,
					sequence: 0,
					type: "typing-take",
					clock: { id: take.id, tickMs: take.durationMs, relation: "unmapped" },
					provenance: "observed",
					payload: { take },
				});
				return () => undefined;
			},
		};
		this.host = new ApplicationIntegrationHost([GODOT_JOURNAL_DESCRIPTOR], [provider]);
		this.host.setEnabled(settings.getIntegrationSettings().enabledAdapterIds);
	}
	snapshot() {
		const settings = this.settings.getIntegrationSettings();
		for (const status of this.host.statuses())
			if (!settings.enabledAdapterIds.some((id) => id === status.descriptor.id))
				this.host.disable(status.descriptor.id);
		return { settings, statuses: this.host.statuses(), saveFailed: this.saveFailed };
	}
	setSettings(value: unknown) {
		const next = integrationSettingsSchema.parse(value);
		// Denial stops active optional sessions even when the subsequent durable save fails.
		for (const status of this.host.statuses())
			if (!next.enabledAdapterIds.some((id) => id === status.descriptor.id))
				this.host.disable(status.descriptor.id);
		try {
			this.settings.setIntegrationSettings(next);
			this.host.setEnabled(next.enabledAdapterIds);
			this.saveFailed = false;
			return { success: true, ...this.snapshot() };
		} catch {
			this.saveFailed = true;
			return { success: false, ...this.snapshot() };
		}
	}
	async importTypingSource(source: unknown): Promise<ImportedTypingFile[]> {
		if (
			typeof source !== "string" ||
			new TextEncoder().encode(source).byteLength > MAX_TYPING_BYTES
		)
			throw new Error("Typing source exceeds its import limit");
		// Portable/normalized evidence and capture-pad files are core data, usable with every integration disabled.
		let wholeJson = false;
		try {
			JSON.parse(source);
			wholeJson = true;
		} catch {
			/* Raw journals require the optional decoder below. */
		}
		if (wholeJson) return importTypingFiles(source);
		if (
			!this.snapshot().statuses.some(
				(status) => status.descriptor.id === "godot-codeedit" && status.enabled,
			)
		)
			throw new TypingIntegrationDisabledError();
		const instanceId = randomUUID(),
			sessionId = randomUUID(),
			artifactId = randomUUID();
		this.sources.set(instanceId, source);
		try {
			await this.host.open(
				{
					version: 1,
					adapterId: "godot-codeedit",
					instanceId,
					sessionId,
					capability: "typing.journal-import",
					scope: { kind: "selected-file", artifactId },
				},
				{ selectedFileAuthorized: true },
			);
			const observations = this.host.take(instanceId);
			if (observations.length !== 1 || observations[0].type !== "typing-take")
				throw new Error("Integration did not deliver a complete take");
			const { take } = z.object({ take: typingTakeSchema }).strict().parse(observations[0].payload);
			return [
				{
					mode: "captured-edits",
					take: typingTakeSchema.parse({
						...take,
						id: `integration-${instanceId}`,
						integration: {
							version: 1,
							adapterId: "godot-codeedit",
							adapterVersion: "1",
							instanceId,
							sessionId,
							artifactId,
							capability: "typing.journal-import",
							originalClockId: take.id,
							clockRelation: "unmapped",
						},
					}),
				},
			];
		} finally {
			this.sources.delete(instanceId);
			this.host.close(instanceId);
		}
	}
}
export type IntegrationSnapshot = ReturnType<ApplicationIntegrationService["snapshot"]>;
export type IntegrationSettingsResult = ReturnType<ApplicationIntegrationService["setSettings"]>;
export type { IntegrationSettings };
