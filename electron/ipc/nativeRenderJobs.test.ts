import { expect, it, vi } from "vitest";
import { NativeRenderJobs } from "./nativeRenderJobs";

function deferred() {
	let resolve!: (n: number) => void, reject!: (error: Error) => void;
	const result = new Promise<number>((yes, no) => {
		resolve = yes;
		reject = no;
	});
	return { result, resolve, reject, cancel: vi.fn(() => true) };
}
it("holds the compute lease after cancel until actual native settlement and fences old handles", async () => {
	const jobs = new NativeRenderJobs(),
		native = deferred(),
		next = vi.fn(() => deferred());
	const job = jobs.start(() => native);
	expect(job.cancel()).toBe(true);
	expect(() => jobs.start(next)).toThrow("already running");
	expect(next).not.toHaveBeenCalled();
	native.resolve(1);
	await expect(job.result).rejects.toThrow("RENDER_JOB_INVALIDATED");
	const second = deferred(),
		active = jobs.start(() => second);
	expect(job.cancel()).toBe(false);
	job.invalidate?.();
	expect(second.cancel).not.toHaveBeenCalled();
	second.resolve(2);
	await expect(active.result).resolves.toBe(2);
});
it.each([
	false,
	"throw",
])("invalidates unsupported/failed cancellation %s without releasing live native work", async (behavior) => {
	const jobs = new NativeRenderJobs(),
		native = deferred();
	native.cancel.mockImplementation(() => {
		if (behavior === "throw") throw new Error("cancel failed");
		return false;
	});
	const job = jobs.start(() => native);
	job.invalidate?.();
	expect(() => jobs.start(() => deferred())).toThrow("already running");
	native.resolve(1);
	await expect(job.result).rejects.toThrow("RENDER_JOB_INVALIDATED");
	await expect(jobs.run(async () => 2)).resolves.toBe(2);
});
it("releases on synchronous start failure and asynchronous native rejection", async () => {
	const jobs = new NativeRenderJobs();
	expect(() =>
		jobs.start(() => {
			throw new Error("start failed");
		}),
	).toThrow("start failed");
	const native = deferred(),
		job = jobs.start(() => native);
	const failure = expect(job.result).rejects.toThrow("native failed");
	native.reject(new Error("native failed"));
	await failure;
	await expect(jobs.run(async () => 3)).resolves.toBe(3);
});
it("an outer timeout/abandoned waiter does not release native work", async () => {
	const jobs = new NativeRenderJobs(),
		native = deferred(),
		job = jobs.start(() => native);
	await expect(Promise.race([job.result, Promise.resolve("timeout")])).resolves.toBe("timeout");
	expect(() => jobs.start(() => deferred())).toThrow("already running");
	native.resolve(1);
	await job.result;
	await expect(jobs.run(async () => 2)).resolves.toBe(2);
});
