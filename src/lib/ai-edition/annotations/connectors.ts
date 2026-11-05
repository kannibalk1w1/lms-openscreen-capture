import type { AxcutAnnotationRegion } from "../schema";
export interface ArrowPoint {
	x: number;
	y: number;
}
export interface Connector {
	shape: "straight" | "curved" | "elbow";
	tail: ArrowPoint;
	head: ArrowPoint;
	bend: ArrowPoint;
}
const clamp = (n: number) => Math.max(0, Math.min(100, n));
/** Endpoints are frame percentages; the stored connector is normalized inside its scalable box. */
export function connectorPatch(
	tail: ArrowPoint,
	head: ArrowPoint,
	bend: ArrowPoint,
	shape: Connector["shape"],
): Pick<AxcutAnnotationRegion, "position" | "size"> & {
	space: "frame";
	figureData: NonNullable<AxcutAnnotationRegion["figureData"]> & { connector: Connector };
} {
	const points = [tail, head, bend].map((p) => ({ x: clamp(p.x), y: clamp(p.y) }));
	const x = Math.max(0, Math.min(...points.map((p) => p.x)) - 2);
	const y = Math.max(0, Math.min(...points.map((p) => p.y)) - 2);
	const width = Math.max(2, Math.min(100, Math.max(...points.map((p) => p.x)) + 2) - x);
	const height = Math.max(2, Math.min(100, Math.max(...points.map((p) => p.y)) + 2) - y);
	const local = (p: ArrowPoint) => ({ x: (p.x - x) / width, y: (p.y - y) / height });
	return {
		space: "frame",
		position: { x, y },
		size: { width, height },
		figureData: {
			arrowDirection: "right",
			color: "#34B27B",
			strokeWidth: 4,
			connector: { shape, tail: local(points[0]), head: local(points[1]), bend: local(points[2]) },
		},
	};
}
export function connectorPoints(region: AxcutAnnotationRegion) {
	const c = region.figureData?.connector;
	const absolute = (p: ArrowPoint) => ({
		x: region.position.x + p.x * region.size.width,
		y: region.position.y + p.y * region.size.height,
	});
	if (!c) throw new Error("annotation is not a connector");
	return { tail: absolute(c.tail), head: absolute(c.head), bend: absolute(c.bend) };
}
export function changeConnectorShape(
	region: AxcutAnnotationRegion,
	shape: Connector["shape"],
	aspect = 16 / 9,
) {
	let tail: ArrowPoint, head: ArrowPoint;
	if (region.figureData?.connector) ({ tail, head } = connectorPoints(region));
	else {
		const direction = region.figureData?.arrowDirection ?? "right";
		const endpoints: Record<string, [number, number, number, number]> = {
			right: [0.2, 0.5, 0.8, 0.5],
			left: [0.8, 0.5, 0.2, 0.5],
			up: [0.5, 0.8, 0.5, 0.2],
			down: [0.5, 0.2, 0.5, 0.8],
			"up-right": [0.25, 0.75, 0.75, 0.25],
			"up-left": [0.75, 0.75, 0.25, 0.25],
			"down-right": [0.25, 0.25, 0.75, 0.75],
			"down-left": [0.75, 0.25, 0.25, 0.75],
		};
		const e = endpoints[direction];
		const scale = Math.min(region.size.width * aspect, region.size.height);
		const point = (x: number, y: number) => ({
			x: region.position.x + ((region.size.width * aspect - scale) / 2 + x * scale) / aspect,
			y: region.position.y + (region.size.height - scale) / 2 + y * scale,
		});
		tail = point(e[0], e[1]);
		head = point(e[2], e[3]);
	}
	const bend = {
		x: (tail.x + head.x) / 2 - (shape === "curved" ? ((head.y - tail.y) * 0.3) / aspect : 0),
		y: (tail.y + head.y) / 2 + (shape === "curved" ? (head.x - tail.x) * 0.3 * aspect : 0),
	};
	const patch = connectorPatch(tail, head, bend, shape);
	return {
		...patch,
		figureData: {
			...patch.figureData,
			...region.figureData,
			connector: patch.figureData.connector,
			color: region.figureData?.color ?? "#34B27B",
			strokeWidth: region.figureData?.strokeWidth ?? 4,
		},
	};
}
export function connectorPath(c: Connector, scale = { x: 1, y: 1 }): string {
	const p = (v: ArrowPoint) => `${v.x * scale.x} ${v.y * scale.y}`;
	if (c.shape === "curved") return `M ${p(c.tail)} Q ${p(c.bend)} ${p(c.head)}`;
	if (c.shape === "elbow")
		return `M ${p(c.tail)} L ${p({ x: c.bend.x, y: c.tail.y })} L ${p({ x: c.bend.x, y: c.head.y })} L ${p(c.head)}`;
	return `M ${p(c.tail)} L ${p(c.head)}`;
}
export function nextStepNumber(annotations: readonly { type: string; content: string }[]) {
	return (
		1 +
		Math.max(
			0,
			...annotations
				.filter((a) => a.type === "text")
				.map((a) => Number(/^\s*(\d+)\.\s/.exec(a.content)?.[1] ?? 0)),
		)
	);
}
