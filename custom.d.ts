declare module '*.png' {
	const content: any;
	export default content;
}

declare module '*.svg' {
	const content: any;
	export default content;
}

declare module '@datastructures-js/graph' {

	export class DirectedGraph<T, U = undefined> {
		addVertex(key: T, value?: U): DirectedGraph<T, U>;
		hasVertex(key: T): boolean;
		getVertexValue(key: T): U;
		removeVertex(key: T): boolean;
		getVerticesCount(): number;
		getConnectedVertices(key: T): T[];
		addEdge(srcKey: T, destKey: T, weight?: number): DirectedGraph<T, U>;
		hasEdge(srcKey: T, destKey: T): boolean;
		getWeight(srcKey: T, destKey: T): number;
		removeEdge(srcKey: T, destKey: T): boolean;
		removeEdges(key: T): number;
		getEdgesCount(): number;
		getConnectedEdges(key: T): { [key: T]: number };
		traverseDfs(
			srcKey: T, cb: (key: T, value: U) => void, abortCb?: () => boolean
		): void;
		traverseBfs(
			srcKey: T, cb: (key: T, value: U) => void, abortCb?: () => boolean
		): void;
		clear(): void;
	}

	export class Graph<T, U = undefined> extends DirectedGraph<T, U> {
		addVertex(key: T, value?: U): Graph<T, U>;
		addEdge(srcKey: T, destKey: T, weight?: number): Graph<T, U>;
	}

}