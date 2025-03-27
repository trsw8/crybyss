import {tileLayer} from 'leaflet';
import LeafletMap from './leaflet';

export default class OSM extends LeafletMap {

	// protected tileLayer() {
	// 	// let key = false
	// 	// document.addEventListener('click', (e) => {
	// 	// 	console.log(e);
	// 	// 	key = !key;
	// 	// });
	// 	// if (key) {
	// 	// 	return tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png');
	// 	// }
	// 	// return tileLayer('https://core-renderer-tiles.maps.yandex.net/tiles?l=map&x={x}&y={y}&z={z}', {
	// 	// 	maxZoom: 19,
	// 	// 	attribution: '© Яндекс'
	// 	// });
	// 	return tileLayer('https://core-sat.maps.yandex.net/tiles?l=sat&x={x}&y={y}&z={z}');
	// 	// return tileLayer('https://tile2.maps.2gis.com/tiles?x={x}&y={y}&z={z}', {
	// 	// 	maxZoom: 18,
	// 	// 	attribution: '© 2ГИС'
	// 	// });
	// }
}