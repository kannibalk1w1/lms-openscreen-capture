import type { ExportJob } from "./exportJobs";

export class NativeRenderBusyError extends Error {
	constructor() {
		super("A native render is already running. Wait for it to finish, then retry.");
	}
}
export class NativeRenderInvalidatedError extends Error {
	constructor() {
		super("RENDER_JOB_INVALIDATED");
	}
}
/** One native-compute lease per process, across compositor service instances.
 * Cancellation is scoped to this returned handle; only actual settlement releases it.
 * No deadline/AbortSignal pretends to interrupt an unsupported native operation. */
export class NativeRenderJobs {
	private active?: object;
	start<T>(start: () => ExportJob<T>): ExportJob<T> {
		if (this.active) throw new NativeRenderBusyError();
		const lease = {};
		this.active = lease;
		let job: ExportJob<T>;
		let settled = false,
			invalidated = false;
		try {
			job = start();
		} catch (error) {
			this.active = undefined;
			throw error;
		}
		const cancel = () => {
			if (settled || this.active !== lease) return false;
			const accepted = job.cancel();
			if (accepted) invalidated = true;
			return accepted;
		};
		return {
			cancel,
			invalidate: () => {
				if (settled || this.active !== lease) return;
				invalidated = true;
				// A lifecycle cancellation is best effort; failure still invalidates the result.
				try {
					job.invalidate?.();
					cancel();
				} catch {
					/* Hold ownership until settlement. */
				}
			},
			result: Promise.resolve(job.result)
				.then((value) => {
					if (invalidated) throw new NativeRenderInvalidatedError();
					return value;
				})
				.finally(() => {
					settled = true;
					if (this.active === lease) this.active = undefined;
				}),
		};
	}
	run<T>(start: () => Promise<T>) {
		return this.start(() => ({ result: start(), cancel: () => false })).result;
	}
}
export const nativeRenderJobs = new NativeRenderJobs();
