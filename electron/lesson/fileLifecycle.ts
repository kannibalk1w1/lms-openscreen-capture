/** One caller/connection lifetime; disconnect aborts only its work and drain awaits actual settlement. */
export function createLessonFileLifecycle() {
	const controller = new AbortController(),
		pending = new Set<Promise<unknown>>();
	return {
		signal: controller.signal,
		abort: () => controller.abort(),
		track(promise: Promise<unknown>) {
			pending.add(promise);
			void promise.then(
				() => pending.delete(promise),
				() => pending.delete(promise),
			);
		},
		async drain() {
			while (pending.size) await Promise.allSettled([...pending]);
		},
	};
}
export type LessonFileLifecycle = ReturnType<typeof createLessonFileLifecycle>;
