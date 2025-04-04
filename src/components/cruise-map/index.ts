import {Marker} from 'leaflet';
import {TypedEventTarget} from 'typescript-event-target';
import showplaceMarkerIcon from '../../icons/showplace-marker.png';
import stopMarkerIcon from '../../icons/stop-marker.png';
import gatewayMarkerIcon from '../../icons/gateway.svg';
import linerIcon from '../../icons/liner.svg';
import linersIcon from '../../icons/liners.svg';
import showplaceIcon from '../../icons/showplace.svg';
import stopIcon from '../../icons/stop.svg';
import sunriseIcon from '../../icons/sunrise.svg';
import sunsetIcon from '../../icons/sunset.svg';
import linerMarkerIcon from '../../icons/liner-marker.svg';
import {svgAsset} from '../../util';
import Text from '../../state/text';
import {Cruise, Company, Ship, Location, TrackPoint, TrackLocation, LocationType} from '../../state/cruise';
import WorldMap, {
	VisibilityControl, Layer,
	MapMarker, InteractiveMapMarker, MapPolyline, InteractiveMapPolyline
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
	declare private _sunsetsLayer: Layer;
	get sunsetsLayer(): VisibilityControl {return this._sunsetsLayer;}
	declare private _sunrisesLayer: Layer;
	get sunrisesLayer(): VisibilityControl {return this._sunrisesLayer;}
	declare private _gatewaysLayer: Layer;
	get gatewaysLayer(): VisibilityControl {return this._gatewaysLayer;}
	declare private _shipLayer: Layer<ShipMarker>;
	get shipLayer(): VisibilityControl {return this._shipLayer;}
	declare private _stopsLayer: Layer;
	get stopsLayer(): VisibilityControl {return this._stopsLayer;}
	declare private _sightsLayer: Layer;
	get sightsLayer(): VisibilityControl {return this._sightsLayer;}
	
	addInteractiveMarker(layer: 'track' | 'sunsets' | 'sunrises' | 'gateways' | 'ship' | 'stops' | 'sights', interactiveMarker: any) {
		this[ `_${layer}Layer` ].addInteractiveMarker( interactiveMarker );
	}

	removeMarker(layer: 'track' | 'sunsets' | 'sunrises' | 'gateways' | 'ship' | 'stops' | 'sights', marker: any) {
		this[ `_${layer}Layer` ].removeMarker( marker );
	}

	drawPolyline(layer: 'track' | 'sunsets' | 'sunrises' | 'gateways' | 'ship' | 'stops' | 'sights', polyline: MapPolyline) {
		this[ `_${layer}Layer` ].drawPolyline( polyline );
	}

	clearPolyline(layer: 'track' | 'sunsets' | 'sunrises' | 'gateways' | 'ship' | 'stops' | 'sights', polyline: MapPolyline) {
		this[ `_${layer}Layer` ].clearPolyline( polyline );
	}

	private _cruises: Map<string, CruiseAssets> = new Map();
	cruiseAsset( id: string ) {
		return this._cruises.get( id );
	}

	private _ships: Map<string, ShipMarker> = new Map();
	shipMarker( id: string ) {
		return this._ships.get( id );
	}
	get ships(): Ship[] { return [ ...this._ships.values() ].map( item => item.ship ); }

	declare selectedShip: ShipMarker | undefined;

	declare private _text: Text;
	get text() { return this._text; }
	/** Счетчики остановок / достопримечательностей для избежания повторного их добавления */
	private _attachedStops: Record<string, {
		marker: InteractiveMapMarker,
		timesAttached: number,
	}> = {};
	private _attachedSights: Record<string, {
		marker: InteractiveMapMarker,
		timesAttached: number,
	}> = {};
	private _attachedGateways: Record<string, {
		marker: InteractiveMapMarker,
		timesAttached: number,
	}> = {};
	
	attachLocationMarker( id: string, type: LocationType, lat: number, lng: number, popup: InteractiveMapMarker['popupContent'] ): LocationMarker {
		const counter = [ this._attachedStops, this._attachedSights, this._attachedGateways ][ type ];
		const layer = [ this._stopsLayer, this._sightsLayer, this._gatewaysLayer ][ type ];
		if (!!counter[ id ]) {
			counter[ id ].timesAttached++;
		}
		else {
			const marker = new LocationMarker( type, lat, lng, popup );
			layer.addInteractiveMarker( marker );
			counter[ id ] = { marker, timesAttached: 1 };
		}
		return counter[ id ].marker;
	}
	
	detachLocationMarker( id: string, type: LocationType ) {
		const counter = [ this._attachedStops, this._attachedSights, this._attachedGateways ][ type ];
		const layer = [ this._stopsLayer, this._sightsLayer, this._gatewaysLayer ][ type ];
		if (!!counter[ id ]) {
			counter[ id ].timesAttached--;
			if (!counter[ id ].timesAttached) {
				layer.removeMarker( counter[ id ].marker );
				delete counter[ id ];
			}
		}
	}

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
			const cruises = shipMarker.ship.cruisesOn( value );
			const cruise = cruises[0];
			const { cruiseId } = shipMarker;
			if (cruise?.id !== shipMarker.cruiseId) {
				if (shipMarker.cruiseId){
					this.removeCruise( shipMarker.cruiseId );
					shipMarker.cruiseId = undefined;
				}
				if (cruise?.id) this.addCruise( cruise );
				shipMarker.cruiseId = cruise?.id;
				if (shipMarker.cruiseId && ( shipMarker.isHover || shipMarker === this.selectedShip )) {
					this._cruises.get( shipMarker.cruiseId ).showTrack( shipMarker.marker );
				}
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
		this._sunsetsLayer = map.addLayer();
		this._sunrisesLayer = map.addLayer();
		this._gatewaysLayer = map.addLayer();
		this._stopsLayer = map.addLayer();
		this._sightsLayer = map.addLayer();
		this._shipLayer = map.addLayer();

		this._text = text;

		for (const layer of [ 'sunsets', 'sunrises', 'gateways', 'stops', 'sights' ]) {
			const ucLayer = layer[0].toUpperCase() + layer.slice(1);
			const mapLayer: VisibilityControl = ( this as any )[ `_${layer}Layer` ];
			mapLayer.events.addEventListener( 'visibilitychange', () => {
				if (mapLayer.visible) {
					for (const cruise of this._cruises.values()) {
						( cruise as any )[ `show${ucLayer}` ]();
					}
				}
			} );
		}
		
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

		// Получить список кораблей, не находящихся в круизе в указанное время
		window.addEventListener('timeline-change', (event: CustomEvent) => {
			const date = event.detail.date;
			const shipIds = this.ships.map(ship => ship.id);
			// Получить список активных круизов на указанную дату
			const activeCruises = Array.from(this._cruises.values()).filter(cruise => {
				const cruiseStart = cruise.cruise.departure;
				const cruiseEnd = cruise.cruise.arrival;
				return cruiseStart <= date && cruiseEnd >= date;
			});

			const activeShipIds = activeCruises.map(cruise => cruise.cruise.ship.id);
			const shipsNotInCruise = shipIds.filter(id => !activeShipIds.includes(id));

			const countElement = document.querySelector('.map-overlay--ships-count') as HTMLElement;
			if (countElement) {
				countElement.innerText = shipsNotInCruise.length.toString().padStart(3, '0');
			}
		});
	}

	addCruise(cruise: Cruise): Promise<void> {
		if (this._cruises.has( cruise.id ))
			return;

		this._cruises.set( cruise.id, new CruiseAssets( this, cruise ) );
	}

	removeCruise(id: string): void {
		if (!this._cruises.has(id))
			return;
		const cruise = this._cruises.get(id);
		for (const layer of [ 'Track', 'Sunsets', 'Sunrises', 'Gateways', 'Stops', 'Sights' ]) {
			( cruise as any )[ `hide${layer}` ]();
		}
		
		this._cruises.delete(id);
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

		const cruises = ship.cruisesOn( this.timelinePoint );
		const cruise = cruises[0];
		if (cruise) this.addCruise( cruise );

		const shipMarker = new ShipMarker(
			this, ship, ship.company,
			this.timelinePoint,
			async () => this.shipPopup(ship),
			cruise?.id
		);
		
		this._ships.set( ship.id, shipMarker );
		
		this.events.dispatchEvent(new Event('timerangechanged'));
	}
	
	removeShip({id}: {id: string}): void {
		if (!this._ships.has( id )) return;
		const shipMarker = this._ships.get( id );
		this._ships.delete( id )

		this.removeCruise( shipMarker.cruiseId );
		this.fitTimeline();

		this._shipLayer.removeMarker(shipMarker);
		
		this.events.dispatchEvent(new Event('timerangechanged'));
	}

	private shipPopup(ship: Ship) {
		const cruises = ship.cruisesOn( this.timelinePoint );
		const cruise = cruises[0];
		const {
			departure = null,
			arrival = null,
			departureLocationName = '',
			arrivalLocationName = '',
		} = cruise ?? {};
		const {name} = ship;
		const {name: companyName, color} = ship.company;
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
		const iconString = [ stopMarkerIcon, showplaceMarkerIcon, gatewayMarkerIcon ][ locationType ];
		if (iconString.startsWith( '<svg' )) {
			this.icon = svgAsset( iconString, 'cruise-map__marker' );
		}
		else {
			const icon = this.icon = document.createElement('img');
			icon.src = iconString;
			icon.classList.add('cruise-map__marker');
		}
		this.lat = lat;
		this.lng = lng;
		this.popupContent = popupContent;
	}

}

class ShipMarker implements InteractiveMapMarker {

	declare private map: CruiseMap;

	declare datetime: Date;
	declare lat: number;
	declare lng: number;
	declare popupContent: InteractiveMapMarker['popupContent'];
	declare marker: Marker | undefined;
	declare cruiseId: string | undefined;
	declare isHover: boolean;

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
		map: CruiseMap,
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
		this.move( datetime );
	}

	/** Изменить координаты и угол поворота на точку в пути в указанное время */
	async move(datetime: Date): Promise<void> {
		this.datetime = datetime;
		const cruises = this.ship.cruisesOn( datetime );
		const cruise = cruises[0];
		if (!cruise?.routeReady) this._removeMarker();
		if (cruise) {
			const {lat, lng, angle} = await this.ship.positionAt( datetime );
			if (datetime === this.datetime) {      // Выполняем только последнее запрошенное перемещение
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
				
				if (!this.marker) this._createMarker();
				
				this.events.dispatchEvent(new Event('locationchange'));
			}
		}
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
		//~ if (this.intersectionIndex === undefined)
			this.icon.style.setProperty(
				'--cruise-map__marker_angle',
				`${this.rotateAngle}turn`,
			);
		//~ else
			//~ this.icon.style.removeProperty('--cruise-map__marker_angle');
	}

	_createMarker(): void {
		if (!this.marker) {
			this.map.addInteractiveMarker( 'ship', this );
			let timer: ReturnType<typeof setTimeout>;
			const onMouseOver = () => {
				if (timer) {
					clearTimeout( timer );
					timer = undefined;
				}
				if (!this.isHover) {
					if (this.cruiseId) {
						const cruise = this.map.cruiseAsset( this.cruiseId );
						cruise?.showTrack( this.marker );
					}
					this.isHover = true;
				}
			};
			const onMouseOut = () => {
				if (this.isHover && !timer) {
					timer = setTimeout( () => {
						if (this.isHover) {
							if (this.cruiseId && this.map.selectedShip !== this) {
								const cruise = this.map.cruiseAsset( this.cruiseId );
								cruise?.hideTrack();
							}
							this.isHover = false;
						}
						timer = undefined;
					}, 300 );
				}
			};
			this.marker.on( 'mouseover', onMouseOver );
			this.marker.on( 'mouseout', onMouseOut );
			let popupContainer: HTMLElement;
			this.marker.on( 'popupopen', () => {
				const popup = this.marker.getPopup();
				if (popup) {
					popupContainer = popup.getElement();
					if (popupContainer) {
						popupContainer.addEventListener( 'mouseover', onMouseOver );
						popupContainer.addEventListener( 'mouseout', onMouseOut );
					}
				}
			} );
			this.marker.on( 'popupclose', () => {
				if (popupContainer) {
					popupContainer.removeEventListener( 'mouseover', onMouseOver );
					popupContainer.removeEventListener( 'mouseout', onMouseOut );
				}
				onMouseOut();
			} );
			this.marker.on( 'click', () => {
				if (this.map.selectedShip !== this) {
					if (this.map.selectedShip) {
						const selectedShip = this.map.selectedShip;
						const cruise = this.map.cruiseAsset( selectedShip.cruiseId );
						cruise?.hideTrack();
					}
					this.map.selectedShip = this;
					onMouseOver();
					const cruise = this.map.cruiseAsset( this.cruiseId );
					if (this.map.sunrisesLayer.visible) {
						cruise.showSunrises();
					}
					if (this.map.sunsetsLayer.visible) {
						cruise.showSunsets();
					}
				}
				else {
					this.map.selectedShip = undefined;
					onMouseOut();
					const cruise = this.map.cruiseAsset( this.cruiseId );
					cruise.hideSunrises();
					cruise.hideSunsets();
				}
			} );
		}
	}
	
	_removeMarker() {
		if (this.marker) {
			this.map.removeMarker( 'ship', this );
		}
	}
}

class CruiseAssets {
	declare map: CruiseMap;
	declare cruise: Cruise;
	declare polyline?: InteractiveMapPolyline | undefined;
	stops: Record<string, InteractiveMapMarker> = {};
	_stopsVisible: boolean = false;
	sights: Record<string, InteractiveMapMarker> = {};
	_sightsVisible: boolean = false;
	sunsets: InteractiveMapMarker[] = [];
	_sunsetsVisible: boolean = false;
	sunrises: InteractiveMapMarker[] = [];
	_sunrisesVisible: boolean = false;
	gateways: Record<string, InteractiveMapMarker> = {};
	_gatewaysVisible: boolean = false;
	
	constructor( map: CruiseMap, cruise: Cruise ) {
		this.map = map;
		this.cruise = cruise;
		
		if (map.stopsLayer.visible) this.showStops();
		for (const layer of [ 'sunsets', 'sunrises', 'gateways', 'stops', 'sights' ]) {
			const ucLayer = layer[0].toUpperCase() + layer.slice(1);
			const mapLayer: VisibilityControl = ( this.map as any )[ `${layer}Layer` ];
			if (mapLayer.visible) {
				( this as any )[ `show${ucLayer}`]();
			}
		}
	}
	
	async showTrack( marker: Marker ) {
		if (!this.polyline) {
			const company = this.cruise.company;

			const points = ( await this.cruise.route ).points.map(({lat, lng}) => ({lat, lng}));
			this.polyline = {
				points,
				color: company.color,
				events: {}
			};
		}
		this.polyline.events = {
			'mouseover mouseout click'( event ) {
				marker.fire( event.type, event );
			}
		}
		this.map.drawPolyline( 'track', this.polyline );
		
		if (this.cruise.id === this.map.selectedShip?.cruiseId) {
			if (this.map.sunrisesLayer.visible) {
				this.showSunrises();
			}
			if (this.map.sunsetsLayer.visible) {
				this.showSunsets();
			}
		}
	}
	
	hideTrack() {
		if (this.polyline) {
			this.map.clearPolyline( 'track', this.polyline );
		}
		this.hideSunrises();
		this.hideSunsets();
	}
	
	private async locationPopup( stop: Location ): Promise<Element> {
		const {lat, lng, type, name, category, description, image, link } = stop;
		//~ const arrival;
		const company = this.cruise.company;
		const imageElements = image ? [
			LocatedItemDescriptionImage.create(image),
		] : [];
		const categoryNameElements = category ? [
			LocatedItemDescriptionText.create(category),
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
					this.map.text.GO_TO_TRACKSTOP,
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
				'--cruise-map__popup_company-color': `#${company.color.toString(16)}`
			}
		);
		//~ if (imageElements?.length) {
			//~ await Promise.all( imageElements.map( image => image.load() ) );
		//~ }
		for (const image of imageElements) {
			image.load();
		}
		return itemDescription.domNode;
	}

	private async sunriseSunsetPopup( point: TrackPoint ): Promise<Element> {
		const {lat, lng, arrival, sunset} = point;
		const side = '';
		const title = sunset ? 'Закат' : 'Восход';
		const icon = sunset ? sunsetIcon : sunriseIcon;
		const itemDescription = LocatedItemDescription.create(
			[
				LocatedItemDescriptionText.create(title, undefined, { title: true }),
				LocatedItemDescriptionIcon.create(svgAsset(
					icon,
					'cruise-map__icon'
				)),
				LocatedItemDescriptionText.create( arrival.toLocaleString( undefined, {
						day: '2-digit',
						month: '2-digit',
						year: 'numeric',
						hour12: false,
						hour: '2-digit',
						minute: '2-digit'
					} )
				),
				...( side ? [ LocatedItemDescriptionText.create( side == 'left' ? 'С левой стороны борта' : 'С правой стороны борта' ) ] : [] ),
			],
			['cruise-map__popup'],
			{}
		);
		return itemDescription.domNode;
	}

	private async gatewayPopup( gateway: Location ): Promise<Element> {
		const {lat, lng, name} = gateway;
		const activeCruise = this.map.cruiseAsset( this.map.selectedShip?.cruiseId );
		const points = ( await activeCruise?.cruise.gateways )
			?.filter( item => item.location === gateway );
		const itemDescription = LocatedItemDescription.create(
			[
				LocatedItemDescriptionText.create(name, undefined, { title: true }),
				LocatedItemDescriptionIcon.create(svgAsset(
					gatewayMarkerIcon,
					'cruise-map__icon'
				)),
				...(
					points?.length > 0 ? 
						points.map( point => 
							LocatedItemDescriptionText.create( point.arrival.toLocaleString( undefined, {
									day: '2-digit',
									month: '2-digit',
									year: 'numeric',
									hour12: false,
									hour: '2-digit',
									minute: '2-digit'
								} )
							)
						) :
						[]
				)
			],
			['cruise-map__popup'],
			{}
		);
		return itemDescription.domNode;
	}

	async showStops() {
		if (!this._stopsVisible) {
			this._stopsVisible = true;
			const stops = await this.cruise.stops;
			if (this._stopsVisible) {
				for (const stop of stops) {
					const { id, lat, lng } = stop.location;
					if (!this.stops[ id ]) {
						this.stops[ id ] = this.map.attachLocationMarker(
							id, LocationType.REGULAR, lat, lng,
							() => this.locationPopup( stop.location ),
						);
					}
				}
			}
		}
	}
	hideStops() {
		this._stopsVisible = false;
		for (const id of Object.keys( this.stops )) {
			this.map.detachLocationMarker( id, LocationType.REGULAR );
			delete this.stops[ id ];
		}
	}
	
	async showSights() {
		if (!this._sightsVisible) {
			this._sightsVisible = true;
			const sights = await this.cruise.sights;
			if (this._sightsVisible) {
				for (const sight of sights) {
					const { id, lat, lng } = sight.location;
					if (!this.sights[ id ]) {
						this.sights[ id ] = this.map.attachLocationMarker(
							id, LocationType.SHOWPLACE, lat, lng,
							() => this.locationPopup( sight.location ),
						);
					}
				}
			}
		}
	}
	hideSights() {
		this._sightsVisible = false;
		for (const id of Object.keys( this.sights )) {
			this.map.detachLocationMarker( id, LocationType.SHOWPLACE );
			delete this.sights[ id ];
		}
	}

	async showSunsets() {
		if (!this._sunsetsVisible && this.cruise.id === this.map.selectedShip?.cruiseId) {
			this._sunsetsVisible = true;
			const sunsets = await this.cruise.sunsets;
			if (this._sunsetsVisible) {
				sunsets.forEach( point => {
					const sunset: InteractiveMapMarker = {
						lat: point.lat,
						lng: point.lng,
						icon: svgAsset( sunsetIcon, 'cruise-map__icon' ),
						iconSize: [ 24, 24 ],
						events: new TypedEventTarget(),
						popupContent: () => this.sunriseSunsetPopup( point )
					}
					this.map.addInteractiveMarker( 'sunsets', sunset );
					this.sunsets.push( sunset );
				} );
			}
		}
	}
	
	hideSunsets() {
		this._sunsetsVisible = false;
		this.sunsets.forEach( marker => this.map.removeMarker( 'sunsets', marker ) );
		this.sunsets = [];
	}

	async showSunrises() {
		if (!this._sunrisesVisible && this.cruise.id === this.map.selectedShip?.cruiseId) {
			this._sunrisesVisible = true;
			const sunrises = await this.cruise.sunrises;
			if (this._sunrisesVisible) {
				sunrises.forEach( point => {
					const sunrise: InteractiveMapMarker = {
						lat: point.lat,
						lng: point.lng,
						icon: svgAsset( sunriseIcon, 'cruise-map__icon' ),
						iconSize: [ 24, 24 ],
						events: new TypedEventTarget(),
						popupContent: () => this.sunriseSunsetPopup( point )
					}
					this.map.addInteractiveMarker( 'sunrises', sunrise );
					this.sunrises.push( sunrise );
				} );
			}
		}
	}
	hideSunrises() {
		this._sunrisesVisible = false;
		this.sunrises.forEach( marker => this.map.removeMarker( 'sunrises', marker ) );
		this.sunrises = [];
	}

	async showGateways() {
		if (!this._gatewaysVisible) {
			this._gatewaysVisible = true;
			const gateways = await this.cruise.gateways;
			if (this._gatewaysVisible) {
				for (const gateway of gateways) {
					const { id, lat, lng } = gateway.location;
					if (!this.gateways[ id ]) {
						this.gateways[ id ] = this.map.attachLocationMarker(
							id, LocationType.GATEWAY, lat, lng,
							() => this.gatewayPopup( gateway.location ),
						);
					}
				}
			}
		}
	}
	hideGateways() {
		this._gatewaysVisible = false;
		for (const id of Object.keys( this.gateways )) {
			this.map.detachLocationMarker( id, LocationType.GATEWAY );
			delete this.gateways[ id ];
		}
	}
}
