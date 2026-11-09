import { NativeRenderBusyError, NativeRenderInvalidatedError } from "./nativeRenderJobs";

/** A real window or transport lifetime, keyed by object identity, never a caller-supplied ID. */
export interface ExportOwner {
	isDestroyed(): boolean;
	once(event: string, listener: () => void): unknown;
	removeListener(event: string, listener: () => void): unknown;
}

export interface ExportJob<T> {
	result: Promise<T>;
	cancel: () => boolean;
	invalidate?: () => void;
}

export function isExportId(value: unknown): value is string {
	return typeof value === "string" && /^[A-Za-z0-9_-]{1,128}$/.test(value);
}

/** Controls never leave main. Unknown and foreign IDs have the same result. */
export const MAX_OWNER_RENDER_OPERATIONS = 4096;
export class ExportJobs {
	private readonly used = new WeakMap<ExportOwner, Set<string>>();
	private readonly jobs = new Map<
		ExportOwner,
		{ exportId: string; channel: string; cancel: () => boolean; invalidate: () => void }
	>();

	cancel(owner: ExportOwner, exportId: string, channel = "export"): boolean {
		const job = this.jobs.get(owner);
		return job?.exportId === exportId && job.channel === channel && job.cancel();
	}

	invalidate(owner: ExportOwner) {
		this.jobs.get(owner)?.invalidate();
	}

	async run<T>(
		owner: ExportOwner,
		exportId: string,
		start: (progress: (frames: number) => void) => ExportJob<T>,
		onProgress: (frames: number) => void,
		channel = "export",
	): Promise<T> {
		if (!isExportId(exportId)) throw new Error("Invalid export ID.");
		if (owner.isDestroyed()) throw new Error("Export window is closed.");
		if (this.jobs.has(owner)) throw new NativeRenderBusyError();
		const used = this.used.get(owner) ?? new Set<string>();
		const key = `${channel}:${exportId}`;
		if (used.has(key)) throw new Error("This render operation ID has already been used.");
		if (used.size >= MAX_OWNER_RENDER_OPERATIONS)
			throw new Error("Reopen this window before starting more render operations.");
		used.add(key);
		this.used.set(owner, used);
		let active = true,
			invalidated = false;
		// Reserve the window before start: synchronous progress/reentrancy cannot take it.
		let job: ExportJob<T> | undefined;
		const invalidate = () => {
			if (!active) return;
			invalidated = true;
			try {
				if (job?.invalidate) job.invalidate();
				else job?.cancel();
			} catch {
				/* A failed native cancel never releases a still-running job. */
			}
		};
		const entry = {
			exportId,
			channel,
			cancel: () => {
				const accepted = active && !!job?.cancel();
				if (accepted) invalidated = true;
				return accepted;
			},
			invalidate,
		};
		this.jobs.set(owner, entry);
		// ExportOwner deliberately exposes only the emitter surface shared by callers/tests.
		try {
			owner.once("destroyed", invalidate);
			owner.once("render-process-gone", invalidate);
			owner.once("did-start-navigation", invalidate);
			job = start((frames) => {
				if (active && !invalidated && !owner.isDestroyed()) {
					try {
						onProgress(frames);
					} catch {
						/* Sender teardown can race delivery. */
					}
				}
			});
			if (invalidated) invalidate();
			const result = await job.result;
			if (invalidated || owner.isDestroyed()) throw new NativeRenderInvalidatedError();
			return result;
		} finally {
			active = false;
			owner.removeListener("destroyed", invalidate);
			owner.removeListener("render-process-gone", invalidate);
			owner.removeListener("did-start-navigation", invalidate);
			if (this.jobs.get(owner) === entry) this.jobs.delete(owner);
		}
	}
}
export const renderOwnerJobs = new ExportJobs();
