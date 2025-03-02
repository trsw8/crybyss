import {TypedEventTarget} from 'typescript-event-target';
import showplaceMarkerIcon from '../../icons/showplace-marker.png';
import stopMarkerIcon from '../../icons/stop-marker.png';
import linerIcon from '../../icons/liner.svg';
import linersIcon from '../../icons/liners.svg';
import showplaceIcon from '../../icons/showplace.svg';
import stopIcon from '../../icons/stop.svg';
import linerMarkerIcon from '../../icons/liner-marker.svg';
import {svgAsset} from '../../util';
import Text from '../../state/text';
import {Cruise, Company, TrackStop, LocationType} from '../../state/cruise';
import WorldMap, {
	VisibilityControl, Layer,
	InteractiveMapMarker, MapPolyline
} from '../map';
import LocatedItemDescription, {
	LocatedItemDescriptionGroup,
	LocatedItemDescriptionText,
	LocatedItemDescriptionRange,
	LocatedItemDescriptionButton,
	LocatedItemDescriptionImage,
	LocatedItemDescriptionIcon,
	LocatedItemDescriptionLocation,
	LocatedItemDescriptionGap,
} from '../located-item-description';
import './index.css';

/** Отображение круизов (кораблей, путей, остановок и т.д.) на карте */
export default class CruiseMap {

	declare private map: WorldMap;

	declare private _shipLayer: Layer<ShipMarker>;
	get shipLayer(): VisibilityControl {return this._shipLayer;}
	declare private _stopLayer: Layer;
	get stopLayer(): VisibilityControl {return this._stopLayer;}
	declare private _showplaceLayer: Layer;
	get showplaceLayer(): VisibilityControl {return this._showplaceLayer;}

	private _cruises: Map<unknown, CruiseAssets> = new Map();
	get cruises(): Cruise[] {
		const result = [];
		for (const {cruise} of this._cruises.values())
			result.push(cruise);
		return result;
	}

	declare private text: Text;
	/** Счетчики остановок / достопримечательностей для избежания повторного их добавления */
	private attachedLocations: Map<unknown, {
		marker: InteractiveMapMarker,
		timesAttached: number,
	}> = new Map();

	private _timelineRange: [Date, Date] = [new Date(0), new Date(0)];
	/** Начальная дата первого и конечная дата второго круиза */
	get timelineRange(): readonly [Date, Date] {
		return this._timelineRange;
	}

	private _timelinePoint: Date = new Date(0);
	/** Текущий выбранный момент времени */
	get timelinePoint(): Date {
		return this._timelinePoint;
	}
	set timelinePoint(value) {
		if (+this._timelinePoint === +value)
			return;
		this._timelinePoint = value;
		for (const {cruise, shipMarker} of this._cruises.values())
			shipMarker.move(cruise.route.pointIndexInMoment(value));
		this.events.dispatchEvent(new Event('timelinemove'));
	}

	events: TypedEventTarget<{
		cruiseedit: Event,
		timelinemove: Event,
	}> = new TypedEventTarget();

	constructor(map: WorldMap, text: Text) {
		this.map = map;
		this._shipLayer = map.addLayer();
		this._stopLayer = map.addLayer();
		this._showplaceLayer = map.addLayer();

		this.text = text;

		// Пока n-ному маркеру из сегмента пересечений добавляется кратное n значение сдвига.
		// Не самое красивое решение...
		this._shipLayer.events.addEventListener('intersect', ({
			affectedMarkers, intersections
		}) => {
			affectedMarkers = new Set(affectedMarkers);
			while (affectedMarkers.size > 0) {
				const {value} = affectedMarkers.values().next();
				let index = 0;
				intersections.traverseBfs(value, marker => {
					affectedMarkers.delete(marker);
					marker.setIntersectionIndex(index++);
				});
				if (index <= 1)
					value.unsetIntersectionIndex();
			}
		});
	}

	async addCruise(cruise: Cruise): Promise<void> {
		const {id, departure, arrival, stops} = cruise;
		if (this._cruises.has(id))
			return;
		const ship = await cruise.ship();
		const company = await ship.company();

		if (this._cruises.size === 0) {
			this._timelineRange = [departure, arrival];
			this.timelinePoint = departure;
		} else {
			const [start, end] = this._timelineRange;
			this._timelineRange = [
				new Date(Math.min(+start, +departure)),
				new Date(Math.max(+end, +arrival))
			];
		}

		const points = cruise.route.points.map(({lat, lng}) => ({lat, lng}));
		const polyline = {points, color: company.color};
		this._shipLayer.drawPolyline(polyline);

		for (const stop of stops) {
			const {id, lat, lng, type} = stop;
			if (this.attachedLocations.has(id))
				this.attachedLocations.get(id).timesAttached += 1;
			else {
				const marker = new LocationMarker(
					type, lat, lng,
					() => this.locationPopup(company, stop),
				);
				this.locationLayer(stop).addInteractiveMarker(marker);
				this.attachedLocations.set(id, {marker, timesAttached: 1});
			}
		}

		const shipMarker = new ShipMarker(
			this.map, cruise, company,
			cruise.route.pointIndexInMoment(this.timelinePoint),
			async () => this.shipPopup(cruise),
		);
		this._shipLayer.addInteractiveMarker(shipMarker);

		this._cruises.set(id, {cruise, polyline, shipMarker});
		this.events.dispatchEvent(new Event('cruiseedit'));
	}

	async removeCruise({id}: Cruise): Promise<void> {
		if (!this._cruises.has(id))
			return;
		const {cruise, polyline, shipMarker} = this._cruises.get(id);
		const {stops} = cruise;
		this._cruises.delete(id);

		this.fitTimeline();

		this._shipLayer.clearPolyline(polyline);
		this._shipLayer.removeMarker(shipMarker);

		for (const stop of stops) {
			const {id} = stop;
			const attachedLocation = this.attachedLocations.get(id);
			attachedLocation.timesAttached -= 1;
			if (attachedLocation.timesAttached <= 0) {
				this.attachedLocations.delete(id);
				this.locationLayer(stop).removeMarker(attachedLocation.marker);
			}
		}

		this.events.dispatchEvent(new Event('cruiseedit'));
	}

	private locationLayer({type}: TrackStop): Layer {
		return type === LocationType.SHOWPLACE ? this._showplaceLayer :
			this._stopLayer;
	}

	private async locationPopup(
		{color}: Company,
		stop: TrackStop,
	): Promise<Element> {
		const {lat, lng, type, arrival} = stop;
		const {name, categoryName, description, image} = await stop.details();
		const imageElements = image ? [
			LocatedItemDescriptionImage.create(image),
		] : [];
		const categoryNameElements = categoryName ? [
			LocatedItemDescriptionText.create(categoryName),
		] : [];
		const descriptionElement = LocatedItemDescriptionText.create(description);
		const itemDescription = LocatedItemDescription.create(
			type === LocationType.SHOWPLACE ? [
				...imageElements,
				LocatedItemDescriptionGroup.create([
					LocatedItemDescriptionText.create(name, undefined, {
						title: true
					}),
					LocatedItemDescriptionIcon.create(svgAsset(
						showplaceIcon,
						'cruise-map__icon', 'cruise-map__icon_type_showplace',
					)),
					...categoryNameElements,
				], LocatedItemDescriptionGap.MEDIUM),
				descriptionElement,
			] : [
				...imageElements,
				LocatedItemDescriptionButton.create(
					this.text.GO_TO_TRACKSTOP,
					() => {
						this.timelinePoint = arrival;
					},
				),
				LocatedItemDescriptionGroup.create([
					LocatedItemDescriptionGroup.create([
						LocatedItemDescriptionIcon.create(svgAsset(
							stopIcon,
							'cruise-map__icon', 'cruise-map__icon_type_stop',
						)),
						LocatedItemDescriptionText.create(name),
					], LocatedItemDescriptionGap.SMALL),
					LocatedItemDescriptionLocation.create(lat, lng),
					descriptionElement,
				], LocatedItemDescriptionGap.LARGE),
			],
			['cruise-map__popup'],
			{
				'--cruise-map__popup_company-color': `#${color.toString(16)}`
			}
		);
		for (const image of imageElements)
			await image.load();
		return itemDescription.domNode;
	}

	private async shipPopup(cruise: Cruise) {
		const {
			departure,
			arrival,
			departureLocationName,
			arrivalLocationName,
		} = cruise;
		const ship = await cruise.ship();
		const {name} = ship;
		const {name: companyName, color} = await ship.company();
		const itemDescription = LocatedItemDescription.create([
			LocatedItemDescriptionGroup.create([
				LocatedItemDescriptionGroup.create([
					LocatedItemDescriptionIcon.create(svgAsset(
						linerIcon,
						'cruise-map__icon', 'cruise-map__icon_type_ship',
					)),
					LocatedItemDescriptionText.create(name, [
						'cruise-map__ship-name'
					]),
				], LocatedItemDescriptionGap.SMALL),
				LocatedItemDescriptionText.create(companyName),
				LocatedItemDescriptionGroup.create([
					LocatedItemDescriptionIcon.create(svgAsset(
						linersIcon,
						'cruise-map__icon', 'cruise-map__icon_type_ship',
					)),
					LocatedItemDescriptionRange.create(...([
						departure, arrival
					]).map(value =>
						value.toLocaleDateString(undefined, {
							day: '2-digit',
							month: '2-digit',
						})
					) as [string, string]),
					...(departureLocationName && arrivalLocationName ? [
						LocatedItemDescriptionRange.create(
							departureLocationName, arrivalLocationName
						)
					] : [])
				], LocatedItemDescriptionGap.SMALL),
			], LocatedItemDescriptionGap.LARGE),
		], ['cruise-map__popup'], {
			'--cruise-map__popup_company-color': `#${color.toString(16)}`
		});
		return itemDescription.domNode;
	}

	/**
	 * Выставить начальную и конечную точки (и подогнать под них текущую)
	 * в соостветствии с круизами
	 */
	private fitTimeline(): void {
		const cruises = Array.from(this._cruises.values());
		if (cruises.length === 0)
			this._timelineRange = [new Date(0), new Date(0)];
		else
			this._timelineRange = [
				new Date(Math.min(
					...cruises.map(({cruise: {departure}}) => +departure),
				)),
				new Date(Math.max(
					...cruises.map(({cruise: {arrival}}) => +arrival),
				)),
			];
		const [start, end] = this._timelineRange;
		this.timelinePoint = new Date(
			Math.min(Math.max(+this.timelinePoint, +start), +end)
		);
	}

}

class LocationMarker implements InteractiveMapMarker {

	declare icon: InteractiveMapMarker['icon'];
	declare lat: number;
	declare lng: number;
	declare popupContent: InteractiveMapMarker['popupContent'];

	iconSize: [number, number] = [33, 33];
	events = new TypedEventTarget();

	constructor(
		locationType: LocationType,
		lat: number,
		lng: number,
		popupContent: InteractiveMapMarker['popupContent'],
	) {
		const icon = this.icon = document.createElement('img');
		icon.src =
			locationType === LocationType.SHOWPLACE ? showplaceMarkerIcon :
			stopMarkerIcon;
		icon.classList.add('cruise-map__marker');
		this.lat = lat;
		this.lng = lng;
		this.popupContent = popupContent;
	}

}

class ShipMarker implements InteractiveMapMarker {

	declare private map: WorldMap;

	declare lat: number;
	declare lng: number;
	declare popupContent: InteractiveMapMarker['popupContent'];

	icon = svgAsset(
		linerMarkerIcon,
		'cruise-map__marker', 'cruise-map__marker_type_ship',
	);
	iconSize: [number, number] = [33, 33];
	events = new TypedEventTarget();

	declare private cruise: Cruise;
	private rotateAngle = 0;
	private intersectionIndex?: number = undefined;

	constructor(
		map: WorldMap,
		cruise: Cruise,
		company: Company,
		pointIndex: number,
		popupContent: InteractiveMapMarker['popupContent'],
	) {
		this.icon.style.setProperty(
			'--cruise-map__marker_color',
			`#${company.color.toString(16)}`
		);
		this.map = map;
		this.cruise = cruise;
		this.popupContent = popupContent;
		this.move(pointIndex);
	}

	/** Изменить координаты и угол поворота на точку в пути с указанным индексом */
	move(pointIndex: number): void {
		const {route: {points}} = this.cruise;
		const {lat, lng} = points[pointIndex];
		if (lat === this.lat && lng === this.lng)
			return;
		this.lat = lat;
		this.lng = lng;
		const nextPoint = points[
			points.length > pointIndex + 1 ? pointIndex + 1 : pointIndex
		];
		const [x1, y1] = this.map.coordsToPoint(lat, lng);
		const [x2, y2] = this.map.coordsToPoint(nextPoint.lat, nextPoint.lng);
		this.rotateAngle = Math.atan2((y2 - y1), (x2 - x1)) / Math.PI / 2;
		this.rotate();
		this.events.dispatchEvent(new Event('locationchange'));
	}

	/** Установить сдвиг */
	setIntersectionIndex(index: number): void {
		this.intersectionIndex = index;
		this.icon.style.setProperty(
			'--cruise-map__marker_intersection-index',
			`${index}`,
		);
		this.rotate();
	}

	/** Убрать сдвиг */
	unsetIntersectionIndex(): void {
		this.intersectionIndex = undefined;
		this.icon.style.removeProperty('--cruise-map__marker_intersection-index');
		this.rotate();
	}

	private rotate(): void {
		if (this.intersectionIndex === undefined)
			this.icon.style.setProperty(
				'--cruise-map__marker_angle',
				`${this.rotateAngle}turn`,
			);
		else
			this.icon.style.removeProperty('--cruise-map__marker_angle');
	}

}

interface CruiseAssets {
	cruise: Cruise;
	polyline: MapPolyline;
	shipMarker: ShipMarker;
}