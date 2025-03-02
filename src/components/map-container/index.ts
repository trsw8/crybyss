import {DOMComponent} from '../dom';
import Map from '../map';
import MapOverlay from '../map-overlay';
import './index.css';

export default class MapContainer extends DOMComponent {

	static findMapElement(domNode: Element): HTMLElement {
		return domNode.getElementsByClassName('map')[0] as HTMLElement;
	}

	static findOverlayElement(domNode: Element): Element {
		return domNode.getElementsByClassName('map-overlay')[0];
	}

	constructor(
		domNode: Element,
		map: Map,
		overlay: MapOverlay,
	) {
		super(domNode);

		const setOverlayBounds = () => {
			map.setOverlayBounds(...overlay.bounds);
		};
		setOverlayBounds();
		overlay.events.addEventListener('resize', setOverlayBounds);
	}

}