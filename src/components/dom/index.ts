export abstract class DOMComponent<TElement extends Element = Element> {

	declare domNode: TElement;

	constructor(node: TElement) {
		this.domNode = node;
	}

}