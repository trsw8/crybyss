import {tileLayer} from 'leaflet';
import LeafletMap from './leaflet';

export default class OSM extends LeafletMap {

	protected tileLayer() {
		return tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png');
	}

}