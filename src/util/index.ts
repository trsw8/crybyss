const idMap = new WeakMap<object, number>();
let currentId = 0;
export function id(obj: object): number {
	if (!idMap.has(obj))
		idMap.set(obj, currentId++);
	return idMap.get(obj);
}

const domParser = new DOMParser();
export function svgAsset(
	source: string,
	...classNames: string[]
): SVGElement {
	const svg = domParser.parseFromString(source, 'text/xml').rootElement;
	svg.classList.add(...classNames);
	return svg;
}