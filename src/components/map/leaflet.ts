import {
	map, Map as LMap, canvas, Renderer, TileLayer,
	Layer as LLayer,
	marker, Marker, DivIcon,
	polyline, circleMarker,
	point, Point, LatLngExpression,
} from 'leaflet';
import 'leaflet/dist/leaflet.css';
import IntersectionSearchTree, {
	Marker as IntersectionMarker
} from '../../util/intersection';
import Map, {
	Layer,
	MapMarker, InteractiveMapMarker,
	MapPolyline, InteractiveMapPolyline,
	PointerEvent, IntersectionEvent,
} from '.';
import './index.css';
import './leaflet.css';
import * as L from 'leaflet';

export default abstract class LeafletMap extends Map {

	protected abstract tileLayer(): TileLayer;

	declare private map: LMap;
	declare private renderer: Renderer;
	private layersCount = 0;
	private autoPan: [Point, Point] = [point(0, 0), point(0, 0)];

	declare mainLayer: Layer;

	constructor(node: HTMLElement, center: LatLngExpression, zoom: number) {
		super(node);
		this.map = map(node, {
			center, zoom,
			attributionControl: false,
			zoomControl: false,
			renderer: canvas(),
		});
		this.mainLayer = new LeafletPane(this.map, this.autoPan);

		this.tileLayer().addTo(this.map);

		this.map.on('move', () => {
			const {lat, lng} = this.map.getCenter();
			this.events.dispatchEvent(new PointerEvent('pointermove', lat, lng));
		});
		this.map.on('mousemove', ({latlng: {lat, lng}}) => {
			this.events.dispatchEvent(new PointerEvent('pointermove', lat, lng));
		});

		// линейка начало

		const measurePoints: L.CircleMarker<any>[] = [];
		let isLine: boolean = false;

		const removeMeasure = () => {
			measurePoints.forEach(point => point.remove());
			measurePoints.length = 0;
			this.map.eachLayer(layer => {
				if (layer instanceof L.Polyline && !(layer instanceof L.Circle)) {
					layer.remove();
				}
			});
		}

		const measureOpenButton = document.querySelector('.map-overlay--line');

		const toggleMeasure = () => {
			measureOpenButton.classList.toggle('active');
			if (!measureOpenButton.classList.contains('active')) {
				removeMeasure();
				this.map.getContainer().style.cursor = 'grab';
				this.map.on('dragstart', () => {
					this.map.getContainer().style.cursor = 'grabbing';
				});
				this.map.on('dragend', () => {
					this.map.getContainer().style.cursor = 'grab';
				});
			} else {
				this.map.getContainer().style.cursor = 'crosshair';
			}
		}

		measureOpenButton?.addEventListener('click', () => {
			console.log('click')
			setTimeout(toggleMeasure, 100);
		})

		this.map.on('mousedown', () => {
			if (isLine) {
				removeMeasure();
				isLine = false;
			}
		})

		this.map.on('click', (event) => {
			if (!measureOpenButton.classList.contains('active')) return;

			var lat = event.latlng.lat; 
			var lng = event.latlng.lng; 

			const circle = L.circleMarker([lat, lng], {
				radius: 5,
				color: 'red',
				fillColor: 'red',
				fillOpacity: 1
			}).addTo(this.map);
			measurePoints.push(circle);

			if (measurePoints.length > 1) {
				const lastPoint = measurePoints[measurePoints.length - 2];
				const line = L.polyline([lastPoint.getLatLng(), circle.getLatLng()], {color: 'red'}).addTo(this.map);
				isLine = true;				
				
				const distance = lastPoint.getLatLng().distanceTo(circle.getLatLng());
				const popupContent = `${(distance / 1000).toFixed(2)} км`;
				line.bindPopup(popupContent, {
					className: 'measure__popup'
				}).openPopup();
			}
		});

		// линейка конец
	}

	addLayer() {
		return new LeafletPane(
			this.map,
			this.autoPan,
			(this.layersCount++).toString(),
		);
	}

	panTo(lat: number, lng: number) {
		this.map.panTo([lat, lng]);
	}

	setOverlayBounds(
		top: number,
		right: number,
		bottom: number,
		left: number,
	) {
		this.autoPan[0].x = left;
		this.autoPan[0].y = top;
		this.autoPan[1].x = right;
		this.autoPan[1].y = bottom;
	}

	coordsToPoint(lat: number, lng: number): [number, number] {
		const {x, y} = this.map.project([lat, lng], 1);
		return [x, y];
	}

}

/** Реализация слоя с помощью набора панелей */
class LeafletPane<
	TMarker extends MapMarker = MapMarker
> extends Layer<TMarker> {

	declare visible: boolean;

	/** Стандартные панели leaflet, внутри которых будут располагаться панели слоя */
	protected static parentPanes: Set<string> = new Set([
		'overlayPane',
		'markerPane',
		'popupPane'
	]);
	protected get parentPanes(): Set<string> {
		return (this.constructor as typeof LeafletPane).parentPanes;
	}
	declare private paneName: string;

	declare private map: LMap;
	/** Для каждой панели (дочерней для overlayPane) требуется свой Renderer */
	declare private renderer: Renderer;
	/** Точки, задаваемые setOverlayBounds */
	declare private autoPan: [Point, Point];

	/** Соответствия объектов leaflet сущностям приложения */
	private representations: (
		WeakMap<TMarker | MapPolyline, LLayer[]>
	) = new WeakMap();

	private intersections: IntersectionSearchTree<
		IntersectionMapMarker<TMarker>
	> = new IntersectionSearchTree();
	/** Соответствия маркеров пересечений маркерам приложения */
	private intersectionMarkers: WeakMap<
		TMarker, IntersectionMapMarker<TMarker>
	> = new WeakMap();
	/**
	 * Запланированные для проверки пересечений маркеры (для оптимизации).
	 * true означает проверку всех имеющихся.
	 */
	private plannedIntersectionChecks: Set<TMarker> | true = new Set();

	constructor(map: LMap, autoPan: [Point, Point], paneName = '') {
		super();
		this.visible = true;

		this.map = map;
		this.autoPan = autoPan;
		this.paneName = paneName;

		if (paneName)
			for (const parentPaneName of this.parentPanes) {
				const pane = map.createPane(
					this.compositePaneName(parentPaneName),
					map.getPane(parentPaneName),
				);
				pane.classList.add('map__layer', 'map__layer_visible');
			}
		this.renderer = canvas({
			pane: this.compositePaneName('overlayPane'),
		});

		this.map.on('zoomend', () => this.checkAllIntersections());
	}

	show() {
		if (this.visible)
			return;
		this.visible = true;
		for (const pane of this.panes())
			pane.classList.add('map__layer_visible');
		this.events.dispatchEvent(new Event('visibilitychange'));
		this.checkAllIntersections();
	}

	hide() {
		if (!this.visible)
			return;
		this.visible = false;
		for (const pane of this.panes())
			pane.classList.remove('map__layer_visible');
		this.events.dispatchEvent(new Event('visibilitychange'));
	}

	toggle() {
		if (this.visible)
			this.hide();
		else
			this.show();
	}

	addMarker(mapMarker: TMarker) {
		const lMarker = marker([mapMarker.lat, mapMarker.lng], {
			icon: new DOMIcon({
				html: mapMarker.icon,
				iconSize: mapMarker.iconSize
			}),
			pane: this.compositePaneName('markerPane'),
		});
		this.syncMarker(mapMarker, lMarker);
		return lMarker;
	}

	addInteractiveMarker(interactiveMarker: TMarker & InteractiveMapMarker) {
		interface popupMarker extends Marker<any> {
			isOpen?: boolean;
		};
		const lMarker: popupMarker = marker([interactiveMarker.lat, interactiveMarker.lng], {
			icon: new DOMIcon({
				html: interactiveMarker.icon,
				iconSize: interactiveMarker.iconSize
			}),
			pane: this.compositePaneName('markerPane'),
		});
		// Удаление одноразового маркера
		lMarker.on('popupclose', () => {
			lMarker.unbindPopup();
			lMarker.isOpen = false;
		});

		const contentDiv = document.createElement('div');
		contentDiv.classList.add('map__popup', 'map__popup_loaded');
		contentDiv.style.setProperty(
			'--map__popup_offset',
			`${interactiveMarker.iconSize[1] / 2}px`
		);
		// Ожидание получения контента
		let contentTask: Promise<unknown> | undefined;

		// Создание и открытие одноразового маркера
		const open = async () => {
			if (!lMarker.isOpen) {
				lMarker.isOpen = true;
				if (!contentTask)
					contentTask = interactiveMarker.popupContent().then(element => {
						contentDiv.appendChild(element);
					});
				await contentTask;
				const [topLeft, bottomRight] = this.autoPan;
				lMarker.bindPopup(contentDiv, {
					closeButton: false,
					closeOnClick: false,
					offset: [0, 0],
					maxWidth: window.innerWidth - bottomRight.x - topLeft.x,
					maxHeight: window.innerHeight - bottomRight.y - topLeft.y,
					autoPanPaddingTopLeft: topLeft,
					autoPanPaddingBottomRight: bottomRight,
					pane: this.compositePaneName('popupPane'),
				}).openPopup();
			}
		};

		lMarker.on('mouseover', () => {
			if (!lMarker.isOpen)
				open();
		});
		// Закрытие попапа только при выходе мыши за его пределы либо пределы маркера
		lMarker.on('mouseout', event => {
			const popup = lMarker.getPopup();
			if (popup) {
				const container = popup.getElement();
				if (container.contains(
					event.originalEvent?.relatedTarget as Node
				)) {
					container.addEventListener('mouseleave', () => {
						popup.close();
					});
				} else {
					popup.close();
				}
			}
		});

		this.syncMarker(interactiveMarker, lMarker);
		return lMarker;
	}

	removeMarker(marker: TMarker) {
		this.checkSiblingsIntersections(marker);
		this.removePath(marker);
		this.intersections.remove(this.intersectionMarkers.get(marker));
		this.intersectionMarkers.delete(marker);
	}

	/** Связать маркер приложения и маркер leaflet */
	private syncMarker(marker: TMarker, lMarker: Marker): void {
		this.representations.set(marker, [lMarker]);
		const intersectionMarker = new IntersectionMapMarker(marker, lMarker);
		this.intersectionMarkers.set(marker, intersectionMarker);
		this.intersections.add(intersectionMarker);
		marker.events.addEventListener('locationchange', () => {
			lMarker.setLatLng([marker.lat, marker.lng]);
			this.intersections.update(intersectionMarker);
			this.checkIntersections([marker]);
		});
		lMarker.addTo(this.map);
		this.checkIntersections([marker]);
	}

	private checkIntersections(markers: TMarker[]): void {
		if (this.plannedIntersectionChecks === true)
			return;
		if (markers.length > 0 && this.plannedIntersectionChecks.size === 0)
			window.queueMicrotask(() => {
				if (this.plannedIntersectionChecks === true)
					return;
				const markers = new Set<IntersectionMapMarker<TMarker>>();
				for (const marker of this.plannedIntersectionChecks)
					if (this.intersectionMarkers.has(marker))
						markers.add(this.intersectionMarkers.get(marker));
				this.plannedIntersectionChecks.clear();
				if (markers.size === 0)
					return;
				const {entries, graph} = this.intersections.check(
					markers,
					(obj) => obj && obj.marker ? obj.marker : null
				);
				this.events.dispatchEvent(new IntersectionEvent(
					'intersect', entries, graph
				));
			});
		for (const marker of markers)
			this.plannedIntersectionChecks.add(marker);
	}

	private checkAllIntersections(): void {
		this.plannedIntersectionChecks = true;
		window.queueMicrotask(() => {
			if (this.plannedIntersectionChecks !== true)
				return;
			this.plannedIntersectionChecks = new Set();
			const {entries, graph} = this.intersections.checkAll(
				(obj) => obj && obj.marker ? obj.marker : null
			);
			if (entries.size > 0)
				this.events.dispatchEvent(new IntersectionEvent(
					'intersect', entries, graph
				));
		});
	}

	/**
	 * Проверить пересечения всех маркеров, в данный момент пересекающихся с указанным.
	 * Используется перед удалением.
	 */
	private checkSiblingsIntersections(marker: TMarker): void {
		const {entries: siblings} = this.intersections.check(
			new Set([this.intersectionMarkers.get(marker)]),
			(obj) => obj && obj.marker ? obj.marker : null,
		);
		this.checkIntersections([...siblings]);
	}

	/** В данный момент никак не реализован InteractiveMapPolylinePoint */
	drawPolyline(mapPolyline: MapPolyline | InteractiveMapPolyline) {
		const {points} = mapPolyline;
		const color = `#${mapPolyline.color.toString(16)}`;
		const layers: LLayer[] = [polyline(
			points,
			{
				color,
				weight: 3,
				renderer: this.renderer,
			}
		)];

		if (points.length) {
			for (const {lat, lng} of [
				points[0],
				points[points.length - 1],
			])
				layers.push(circleMarker([lat, lng], {
					color,
					radius: 8,
					stroke: false,
					fill: true,
					fillOpacity: 1,
					renderer: this.renderer,
				}));
		}

		if (( mapPolyline as InteractiveMapPolyline).events) {
			for (const layer of layers) {
				const events = ( mapPolyline as InteractiveMapPolyline ).events;
				for (const type of Object.keys( events )) {
					layer.on( type, events[ type ] );
				}
			}
		}

		this.representations.set(mapPolyline, layers);
		for (const path of layers)
			path.addTo(this.map);
	}

	clearPolyline(polyline: MapPolyline) {
		this.removePath(polyline);
	}

	private *panes(): Iterable<HTMLElement> {
		for (const parentPaneName of this.parentPanes)
			yield this.map.getPane(this.compositePaneName(parentPaneName));
	}

	private compositePaneName(parentPaneName: string) {
		return this.paneName
			? `${parentPaneName}-${this.paneName}`
			: parentPaneName;
	}

	private removePath(key: any): void {
		for (const layer of this.representations.get(key) ?? [])
			layer.removeFrom(this.map);
	}

}

/** Иконка с доступом к своему html-элементу */
type ExposedDivIcon = DivIcon & {
	container: HTMLElement,
};

/** Иконка в стилизованном контейнере */
const DOMIcon = DivIcon.extend({

	createIcon() {
		const div = document.createElement('div');
		div.classList.add('leaflet-marker-icon');
		div.style.setProperty(
			'--leaflet-marker-icon_width',
			`${this.options.iconSize[0]}px`
		);
		div.style.setProperty(
			'--leaflet-marker-icon_height',
			`${this.options.iconSize[1]}px`
		);
		div.appendChild(this.options.html);
		this.container = div;
		return div;
	},

}) as any; // С конструкторами объектов leaflet сложности, поэтому any

/** Адаптер маркера для рассчета пересечений */
class IntersectionMapMarker<
	TMarker extends MapMarker = MapMarker
> implements IntersectionMarker {

	declare marker: TMarker;
	declare lMarker: Marker;

	get x() {
		return this.marker.lng;
	}

	get y() {
		return -this.marker.lat;
	}

	constructor(marker: TMarker, lMarker: Marker) {
		this.marker = marker;
		this.lMarker = lMarker;
	}

	rect() {
		const icon = this.lMarker.options.icon as ExposedDivIcon;
		return icon.container.getBoundingClientRect();
	}

}
