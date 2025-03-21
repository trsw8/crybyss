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
import {Cruise, Company, Ship, TrackStop, LocationType} from '../../state/cruise';
import WorldMap, {
	VisibilityControl, Layer,
	InteractiveMapMarker, MapPolyline, InteractiveMapPolyline
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

	declare private _trackLayer: Layer;
	get trackLayer(): VisibilityControl {return this._trackLayer;}
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

	private _ships: Map<string, ShipMarker> = new Map();
	get ships(): Ship[] {
		const result = [];
		for (const {ship} of this._ships.values())
			result.push(ship);
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
		for (const shipMarker of this._ships.values()) {
			const cruise = shipMarker.ship.cruiseOn( value );
			const { cruiseId } = shipMarker;
			if (cruise?.id !== shipMarker.cruiseId) {
				if (shipMarker.cruiseId) this.removeCruise( shipMarker.cruiseId );
				if (cruise?.id) this.addCruise( cruise )
				.then( () => {
					shipMarker.cruiseId = cruise?.id;
					this._shipLayer.removeMarker(shipMarker);
					this.createShipMarker( shipMarker );

					if (shipMarker.activeTrack || shipMarker.trackLocked) {
						if (shipMarker.activeTrack) {
							this._trackLayer.clearPolyline( shipMarker.activeTrack );
						}
						shipMarker.activeTrack = undefined;
						if (shipMarker.cruiseId) {
							const cruise = this._cruises.get( shipMarker.cruiseId );
							if (cruise?.polyline) {
								this._trackLayer.drawPolyline( cruise.polyline );
								shipMarker.activeTrack = cruise.polyline;
							}
						}
					}
				} );
			}

			shipMarker.move(value);
		}
		this.events.dispatchEvent(new Event('timelinemove'));
	}

	events: TypedEventTarget<{
		timerangechanged: Event,
		timelinemove: Event,
	}> = new TypedEventTarget();

	constructor(map: WorldMap, text: Text) {
		this.map = map;
		this._trackLayer = map.addLayer();
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
		const {id, stops} = cruise;
		if (this._cruises.has(id))
			return;
		const company = await cruise.company();

		const points = cruise.route.points.map(({lat, lng}) => ({lat, lng}));
		const polyline = { points, color: company.color };

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

		this._cruises.set(id, {cruise, polyline});
	}

	removeCruise(id: string): void {
		if (!this._cruises.has(id))
			return;
		const {cruise, polyline} = this._cruises.get(id);
		const {stops} = cruise;
		this._cruises.delete(id);
		
		for (const stop of stops) {
			const {id} = stop;
			const attachedLocation = this.attachedLocations.get(id);
			attachedLocation.timesAttached -= 1;
			if (attachedLocation.timesAttached <= 0) {
				this.attachedLocations.delete(id);
				this.locationLayer(stop).removeMarker(attachedLocation.marker);
			}
		}
	}
	
	createShipMarker( shipMarker: ShipMarker ): void {
		const marker = this._shipLayer.addInteractiveMarker(shipMarker);
		let timer: ReturnType<typeof setTimeout>;
		const onMouseOver = () => {
			if (timer) {
				clearTimeout( timer );
				timer = undefined;
			}
			if (shipMarker.cruiseId && !shipMarker.activeTrack) {
				const cruise = this._cruises.get( shipMarker.cruiseId );
				if (cruise?.polyline) {
					let isHover = false;
					const polyline = {
						...cruise.polyline,
						events: {
							'mouseover mouseout click'( event ) {
								marker.fire( event.type, event );
							}
						}
					} as InteractiveMapPolyline;
					this._trackLayer.drawPolyline( polyline );
					shipMarker.activeTrack = polyline;
				}
			}
		};
		const onMouseOut = () => {
			if (shipMarker.activeTrack && !shipMarker.trackLocked && !timer) {
				timer = setTimeout( () => {
					if (shipMarker.activeTrack && !shipMarker.trackLocked) {
						this._trackLayer.clearPolyline( shipMarker.activeTrack );
						shipMarker.activeTrack = undefined;
					}
					timer = undefined;
				}, 300 );
			}
		};
		marker.on( 'mouseover', onMouseOver );
		marker.on( 'mouseout', onMouseOut );
		let popupContainer: HTMLElement;
		marker.on( 'popupopen', () => {
			const popup = marker.getPopup();
			if (popup) {
				popupContainer = popup.getElement();
				if (popupContainer) {
					popupContainer.addEventListener( 'mouseover', onMouseOver );
					popupContainer.addEventListener( 'mouseout', onMouseOut );
				}
			}
		} );
		marker.on( 'popupclose', () => {
			if (popupContainer) {
				popupContainer.removeEventListener( 'mouseover', onMouseOver );
				popupContainer.removeEventListener( 'mouseout', onMouseOut );
			}
			onMouseOut();
		} );
		marker.on( 'click', () => {
			shipMarker.trackLocked = !shipMarker.trackLocked;
			if (shipMarker.trackLocked) {
				onMouseOver();
			}
			else {
				onMouseOut();
			}
		} );
	}
	
	async addShip(ship: Ship): Promise<void> {
		if (this._ships.has( ship.id )) return;
		const navigationStartDate = ship.navigationStartDate;
		const navigationEndDate = ship.navigationEndDate;
		if (navigationStartDate && navigationEndDate) {
			let [start, end] = this._timelineRange;
			if (+start === 0) start = navigationStartDate;
			if (+end === 0) end = navigationEndDate;
			this._timelineRange = [
				new Date(Math.min(+start, +navigationStartDate)),
				new Date(Math.max(+end, +navigationEndDate))
			];
			this.timelinePoint = new Date(
				Math.min(Math.max(+this.timelinePoint, +this._timelineRange[0]), +this._timelineRange[1])
			);
		}

		const company = await ship.company();
		const cruise = ship.cruiseOn( this.timelinePoint );
		if (cruise) this.addCruise( cruise );

		const shipMarker = new ShipMarker(
			this.map, ship, company,
			this.timelinePoint,
			async () => this.shipPopup(ship),
			cruise?.id
		);
		
		this.createShipMarker( shipMarker );
		this._ships.set( ship.id, shipMarker );
		
		this.events.dispatchEvent(new Event('timerangechanged'));
	}
	
	removeShip({id}: {id: string}): void {
		if (!this._ships.has( id )) return;
		const shipMarker = this._ships.get( id );
		this._ships.delete( id )

		if (shipMarker.activeTrack) {
			this._trackLayer.clearPolyline( shipMarker.activeTrack );
			shipMarker.activeTrack = undefined;
		}

		this.removeCruise( shipMarker.cruiseId );
		this.fitTimeline();

		this._shipLayer.removeMarker(shipMarker);
		
		this.events.dispatchEvent(new Event('timerangechanged'));
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
		const {name, description, image, link} = stop.details;
		const imageElements = image ? [
			LocatedItemDescriptionImage.create(image),
		] : [];
		//~ const categoryNameElements = categoryName ? [
			//~ LocatedItemDescriptionText.create(categoryName),
		//~ ] : [];
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
					//~ ...categoryNameElements,
				], LocatedItemDescriptionGap.MEDIUM),
				descriptionElement,
			] : [
				...imageElements,
				LocatedItemDescriptionButton.create(
					this.text.GO_TO_TRACKSTOP,
					() => {
						location.assign( link );
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

	private async shipPopup(ship: Ship) {
		const cruise = ship.cruiseOn( this.timelinePoint );
		const {
			departure = null,
			arrival = null,
			departureLocationName = '',
			arrivalLocationName = '',
		} = cruise ?? {};
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
						value?.toLocaleDateString(undefined, {
							day: '2-digit',
							month: '2-digit',
						}) ?? ''
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
		const ships = [ ...this._ships.values() ];
		if (ships.length === 0)
			this._timelineRange = [new Date(0), new Date(0)];
		else
			this._timelineRange = [
				new Date(Math.min(
					...ships.map( ( {ship} ) => +ship.navigationStartDate ).filter( time => !!time ),
				)),
				new Date(Math.max(
					...ships.map( ( {ship} ) => +ship.navigationEndDate ).filter( time => !!time ),
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
	declare cruiseId: string | undefined;
	declare activeTrack: MapPolyline | undefined;
	declare trackLocked: boolean;

	icon = svgAsset(
		linerMarkerIcon,
		'cruise-map__marker', 'cruise-map__marker_type_ship',
	);
	iconSize: [number, number] = [33, 33];
	events = new TypedEventTarget();

	declare ship: Ship;
	private rotateAngle = 0;
	private intersectionIndex?: number = undefined;

	constructor(
		map: WorldMap,
		ship: Ship,
		company: Company,
		datetime: Date,
		popupContent: InteractiveMapMarker['popupContent'],
		cruiseId: string | undefined
	) {
		this.icon.style.setProperty(
			'--cruise-map__marker_color',
			`#${company.color.toString(16)}`
		);
		this.map = map;
		this.ship = ship;
		this.popupContent = popupContent;
		this.cruiseId = cruiseId;
		this.move(datetime);
	}

	/** Изменить координаты и угол поворота на точку в пути в указанное время */
	move(datetime: Date): void {
		//~ const cruise = this.ship.cruiseOn( datetime );
		//~ const { cruiseId } = this;
		//~ if (cruise?.id !== this.cruiseId) {
			//~ if (this.cruiseId) this.removeCruise( this.cruiseId );
			//~ if (cruise?.id) this.addCruise( cruise );
			//~ this.cruiseId = cruise?.id;
			//~ this.events.dispatchEvent( new Event( 'resetcontent' ) );
		//~ }

		const {lat, lng, angle} = this.ship.positionAt( datetime );
		if (lat === this.lat && lng === this.lng)
			return;
		this.lat = lat;
		this.lng = lng;
		//~ const nextPoint = points[
			//~ points.length > pointIndex + 1 ? pointIndex + 1 : pointIndex
		//~ ];
		//~ const [x1, y1] = this.map.coordsToPoint(lat, lng);
		//~ const [x2, y2] = this.map.coordsToPoint(nextPoint.lat, nextPoint.lng);
		//~ this.rotateAngle = Math.atan2((y2 - y1), (x2 - x1)) / Math.PI / 2;
		this.rotateAngle = ( ( angle ?? 90 ) - 90 ) / 360;
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
}
