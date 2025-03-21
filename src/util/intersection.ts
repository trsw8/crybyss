import {AvlTree} from '@datastructures-js/binary-search-tree';
import {Graph} from '@datastructures-js/graph';
import {id} from '.';

export default class IntersectionSearchTree<TMarker extends Marker = Marker> {

	declare private xTree: AvlTree<TMarker>;
	declare private yTree: AvlTree<TMarker>;
	private coords: WeakMap<TMarker, {x: number, y: number}> = new WeakMap();

	constructor() {
		this.xTree = new AvlTree((a, b) => this.compare(a, b, 'x'));
		this.yTree = new AvlTree((a, b) => this.compare(a, b, 'y'));
	}

	add(marker: TMarker) {
		const {x, y} = marker;
		this.coords.set(marker, {x, y});
		for (const tree of [this.xTree, this.yTree])
			tree.insert(marker);
	}

	remove(marker: TMarker) {
		for (const tree of [this.xTree, this.yTree])
			tree.remove(marker);
	}

	update(marker: TMarker) {
		this.remove(marker);
		this.add(marker);
	}

	check<T = TMarker>(
		markers: Set<TMarker>,
		mapper: (marker: TMarker) => T = m => m as unknown as T,
	): Intersections<T> {
		const traversed = new Set<TMarker>();
		const entries = new Set<T>();
		const graph = new Graph<T>();
		const rectCache = new Map<TMarker, Rect>();
		for (const marker of markers) {
			traversed.add(marker);
			const xIntersections = this.find(
				marker, this.xTree, 'x', undefined, traversed, rectCache,
			);
			const intersections = this.find(
				marker, this.yTree, 'y', xIntersections, traversed, rectCache,
			);
			const value = mapper(marker);
			entries.add(value);
			graph.addVertex(value);
			for (const intersection of intersections) {
				const iValue = mapper(intersection);
				graph.addVertex(iValue).addEdge(value, iValue);
			}
		}
		return {entries, graph};
	}

	checkAll<T = TMarker>(
		mapper: (marker: TMarker) => T = m => m as unknown as T,
	): Intersections<T> {
		const markers = new Set<TMarker>();
		this.xTree.traverseInOrder(node => {
			markers.add(node.getValue());
		});
		return this.check(markers, mapper);
	}

	private compare(a: TMarker, b: TMarker, key: 'x' | 'y'): number {
		const aCoords = this.coords.get(a);
		const bCoords = this.coords.get(b);
		return aCoords[key] === bCoords[key] ? id(a) - id(b) :
			aCoords[key] - bCoords[key];
	}

	private find(
		marker: TMarker,
		tree: AvlTree<TMarker>,
		dimension: 'x' | 'y',
		include: Set<TMarker> | undefined = undefined,
		exclude: Set<TMarker> = new Set(),
		rectCache: Map<TMarker, Rect> = new Map(),
	): Set<TMarker> {
		const [start, end] = this.corners(
			this.getRect(marker, rectCache),
			dimension
		);

		const intersections = new Set<TMarker>();
		const stack = [tree.root()];
		while (stack.length > 0) {
			const node = stack.pop();
			if (!node) return intersections;
			const nMarker = node.getValue();
			if (
				exclude.has(nMarker)
				|| (include && !include.has(nMarker))
				|| nMarker === marker
			) {
				stack.push(...[
					node.getLeft(), node.getRight()
				].filter(Boolean));
				continue;
			}

			const [nStart, nEnd] = this.corners(
				this.getRect(nMarker, rectCache),
				dimension
			);

			if (
				(nStart <= start && start <= nEnd)
				|| (nStart <= end && end <= nEnd)
				|| (start <= nStart && nStart <= end)
				|| (start <= nEnd && nEnd <= end)
			) {
				intersections.add(nMarker);
				stack.push(...[
					node.getLeft(), node.getRight()
				].filter(Boolean));
			} else {
				if (node.hasLeft() && nEnd >= start)
					stack.push(node.getLeft());
				if (node.hasRight() && nStart <= end)
					stack.push(node.getRight());
			}
		}

		return intersections;
	}

	private getRect(marker: TMarker, rectCache: Map<TMarker, Rect> = new Map()) {
		if (!rectCache.has(marker))
			rectCache.set(marker, marker?.rect());
		return rectCache.get(marker);
	}

	private corners(rect: Rect, dimension: 'x' | 'y'): [number, number] {
		if (!rect) return [0, 0];
		const {x, y, width, height} = rect;
		return [
			dimension === 'x' ? x : y,
			dimension === 'x' ? x + width : y + height
		];
	}

}

export interface Marker {
	x: number;
	y: number;
	rect: () => Rect;
}

export interface Rect {
	x: number;
	y: number;
	width: number;
	height: number;
}

export interface Intersections<T = Marker> {
	entries: Set<T>;
	graph: Graph<T>;
}