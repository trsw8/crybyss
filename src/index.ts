import initAPI from './state/cruise/api';
import OSM from './components/map/osm';
import CruiseMap from './components/cruise-map';
import MapOverlay from './components/map-overlay';
import MapContainer from './components/map-container';
import './site-globals.css';
import './index.css';

const text = {
	GO_TO_TRACKSTOP: 'Перейти на стоянку',
	GO_TO_PLACE: 'Перейти на место',
};

let mapMode;
let entityId;
const url = new URL( location.toString() );
if (url.searchParams.has('cruise')) {
	mapMode = 'cruise';
	entityId = url.searchParams.get('cruise');
}
else if (url.searchParams.has('stops')) {
	mapMode = 'stops';
}
else if (url.searchParams.has('stop')) {
	mapMode = 'single-stop';
	entityId = url.searchParams.get('stop');
}
else if (url.searchParams.has('places')) {
	mapMode = 'places';
}
else if (url.searchParams.has('place')) {
	mapMode = 'single-place';
	entityId = url.searchParams.get('place');
}
else {
	mapMode = 'default';
}

const root = document.getElementById('root');
const mapContainerElement = root.getElementsByClassName('map-container')[0];

const map = new OSM(
	MapContainer.findMapElement(mapContainerElement),
	[55.7978, 49.1073], 5
);

const cruiseMap = new CruiseMap(map, text, mapMode);

const cruiseAPI = initAPI( mapMode, entityId );

const overlay = new MapOverlay(
	MapContainer.findOverlayElement(mapContainerElement),
	cruiseMap, cruiseAPI
);

new MapContainer(mapContainerElement, map, overlay);
