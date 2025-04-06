import cruiseAPI from './state/cruise/api';
import OSM from './components/map/osm';
import CruiseMap from './components/cruise-map';
import MapOverlay from './components/map-overlay';
import MapContainer from './components/map-container';
import './site-globals.css';
import './index.css';

//~ const cruiseEntry = new CruiseAPIEntry("https://krubiss.ru");
const text = {
	GO_TO_TRACKSTOP: 'Перейти на стоянку',
};

const root = document.getElementById('root');
const mapContainerElement = root.getElementsByClassName('map-container')[0];

const map = new OSM(
	MapContainer.findMapElement(mapContainerElement),
	[58.1996, 68.2533], 5, 5
);

const cruiseMap = new CruiseMap(map, text);

const overlay = new MapOverlay(
	MapContainer.findOverlayElement(mapContainerElement),
	cruiseMap, cruiseAPI
);

new MapContainer(mapContainerElement, map, overlay);
