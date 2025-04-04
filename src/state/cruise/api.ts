import {
	CruiseAPI,
	Cruise, Company, Ship, Location, TrackLocation, LocationType,
	CruiseRoute, TrackPoint, defaultCompanyColor
} from '.';

/// @todo: Конфиг вынести в отдельный файл
const siteURL = 'https://krubiss.ru';
const apiURL = 'https://krubiss.ru/api2';
const apiEntries = {
	start : '?service=map&method=start',
	//~ cruiseByID : 'cruis/byID/',
	stops : '?service=map&method=stops',
	cruiseSights : '?service=map&method=sights&option=byCruiseId',
	sightsByIds : '?service=map&method=sights&option=byIds',
	gateways : '?service=map&method=gateways',
	points : '?service=map&method=points'
};

const brandColors: Record<string, number> = {
	'ООО "Туроператор Азурит"': 0x31739D
};
const otherColors = [
	0x8CE4CB,
	0xFFC4A4,
	0xFEBC43,
	0xC84457,
	0xB9D252,
	0xE137C2,
	0x9F9CB9,
	0x8CB7B5,
	0xF5AAB4,
	0xFFFF00,
	0x76AA74,
	0x715E7C,
	0xFFA79B,
	0x59637F,
	0xEE5C48,
	0x25E6E3,
	0xDCF4E6,
	0xDEF5AF,
	0xFF0022,
	0x936A60
];
let usedColors = 0;

class SortedList<T extends { id: string }> implements Iterable<T> {
	declare compareFunc: ( a: T, b: T ) => number;
	declare sortingOrder: Record<string, number>;
	declare items: T[];

	constructor( compareFunc: ( a: T, b: T ) => number, items: T[] = [] ) {
		this.compareFunc = compareFunc;
		this.items = [ ...items.filter( item => !!item.id ) ];
		if (this.items.length > 0) {
			this.items.sort( compareFunc );
			this.sortingOrder = this.items.reduce( (ret, item, index) => { ret[ item.id ] = index; return ret; }, {} as Record<string, number> );
		}
		else {
			this.sortingOrder = {};
		}
	}

	get count() { return this.items.length; }

	item( id: string ): T | undefined {
		return this.items[ this.sortingOrder[ id ] ];
	}

	add( item: T ): number {
		if (!item?.id) return this.items.length;
		if (this.sortingOrder[ item.id ]) {
			if (!this.compareFunc( this.items[ this.sortingOrder[ item.id ] ], item )) {
				this.items[ this.sortingOrder[ item.id ] ] = item;
				return this.items.length;
			}
			this.delete( item.id );
		}

		let left = 0;
		let right = this.items.length - 1;
		while (right >= left) {
			const mid = right + left >> 1;
			const cmp = this.compareFunc( this.items[ mid ], item );
			if (!cmp) {
				left = mid + 1;
				while (left < this.items.length && !this.compareFunc( this.items[ left ], item )) left++;
				break;
			}
			if (cmp < 0) left = mid + 1;
			else right = mid - 1;
		}
		this.items.splice( left, 0, item );
		for (const id of Object.keys( this.sortingOrder )) {
			if (this.sortingOrder[ id ] >= left) {
				this.sortingOrder[ id ]++;
			}
		}
		this.sortingOrder[ item.id ] = left;

		return this.items.length;
	}

	delete( id: string ): T | undefined {
		let ret = this.item( id );
		if (!!ret) {
			const index = this.sortingOrder[ id ];
			this.items.splice( index, 1 );
			for (const id of Object.keys( this.sortingOrder )) {
				if (this.sortingOrder[ id ] > index) {
					this.sortingOrder[ id ]--;
				}
			}
			delete this.sortingOrder[ id ];
		}
		return ret;
	}

	at( index: number ): T | undefined { return this.items[ index ]; }
	filter( callbackFn: ( element: T, index?: number, array?: T[] ) => boolean, thisArg?: any ): T[] { return this.items.filter( callbackFn, thisArg ); }
	map( callbackFn: ( element: T, index?: number, array?: T[] ) => any, thisArg?: any ): any[] { return this.items.map( callbackFn, thisArg ); }
	[Symbol.iterator](): Iterator<T> { return this.items[Symbol.iterator](); }
};

class CompanyData implements Company {
	declare id: string;
	declare name: string;
	declare color: number;

	constructor( data: any ) {
		Object.assign( this, {
			...data,
			color:
				brandColors[ data.name ] ??
				otherColors[ usedColors++ ] ??
				defaultCompanyColor
		} );
	}

	*cruises(): Iterable<Cruise> {
		for (const index of cache.activeCruises) {
			const cruise = cache.cruises.at( index );
			const ship = cruise.ship;
			if (ship?.company === this) yield cruise;
		}
	}

	*ships(): Iterable<Ship> {
		const shipIds: Record<string, true> = {};
		for (const index of cache.activeCruises) {
			const cruise = cache.cruises.at( index );
			const ship = cruise.ship;
			if (ship?.company === this) shipIds[ ship.id ] = true;
		}
		yield* cache.ships.filter( ship => shipIds[ ship.id ] );
	}
}

class CruiseData implements Cruise {
	declare id: string;
	declare name: string;
	declare departure: Date;
	declare arrival: Date;
	declare departureLocationName: string;
	declare arrivalLocationName: string;
	declare url: string;
	declare ship: Ship;
	declare company: Company;
	declare routeReady: boolean;
	declare stops: Promise<TrackLocation[]>;
	declare _sights: Promise<TrackLocation[]>;
	declare _gateways: Promise<TrackLocation[]>;
	declare _sunrises: TrackPoint[];
	declare _sunsets: TrackPoint[];
	declare _route: Promise<CruiseRoute>;

	constructor( data: any ) {
/*
		const [ points, sunrises, sunsets, gateways ] = data.POINTS
			.filter(Boolean)
			.map(({
				isTrackStop,
				pointArrivalDate,
				Sunrise,
				Sunset,
				coordinates: {latitude: lat, longitude: lng},
				angle
			}: any) => ({
				lat,
				lng,
				arrival: parseDate(pointArrivalDate),
				isStop: !!isTrackStop,
				sunrise: !!Sunrise,
				sunset: !!Sunset,
				angle: !isTrackStop && isFinite( angle ) ? Number( angle ) : undefined
			}))
			.sort( ( a: TrackPoint, b: TrackPoint ) => +a.arrival - +b.arrival )
			.reduce( (
				[ points, sunrises, sunsets, gateways ]: [ TrackPoint[], TrackPoint[], TrackPoint[], Record<string, { gateway: TrackLocation, trackpoint: TrackPoint }> ],
				point: TrackPoint,
				index: number,
				allPoints: TrackPoint[]
			) => {
				if (point.sunrise) sunrises.push( point );
				if (point.sunset) sunsets.push( point );
				const lastPoint = points.length ? points[ points.length - 1 ] : undefined;
				if (!lastPoint ||
					+point.arrival - +lastPoint.arrival >= 90000 ||
					lastPoint.isStop !== point.isStop
				) {
					points.push( point );
				}

				return [ points, sunrises, sunsets, gateways ];
			}, [ [], [], [], {} ] );

		const route = new CruiseRoute( points );

		const stops = ( data.PROPERTY_TRACKSTOPS_VALUE || [] ).map(
			(data: any): TrackStop => {
				if (cache.stops[ data.CR_ID ]) {
					return cache.stops[ data.CR_ID ];
				}
				else {
					return {
						id: data.CR_ID,
						type: LocationType.REGULAR,
						lat: data.DETAIL.coordinates.latitude,
						lng: data.DETAIL.coordinates.longitude,
						name: data.DETAIL.NAME,
						arrival: parseDate( data.CR_ARRIVAL ),
						departure: parseDate( data.CR_DEPARTURE ),
						details: {
							description: data.DETAIL.DETAIL_TEXT,
							//~ image: data.DETAIL.DETAIL_PICTURE
							// Это для тестирования. После переноса приложения на основной сайт проверку url можно будет убрать
							image: ( /^https?:\/\//.test( data.DETAIL.DETAIL_PICTURE ) ? '' : siteURL ) + data.DETAIL.DETAIL_PICTURE,
							//~ link: data.DETAIL.URL
							// Это для тестирования. После переноса приложения на основной сайт проверку url можно будет убрать
							link: ( /^https?:\/\//.test( data.DETAIL.URL ) ? '' : siteURL ) + data.DETAIL.URL,
						}
					};
				}
			}
		);
		
		const sights = Object.values(
			data.POIS.reduce( ( ret: Record<string, TrackStop>, item: any ) => {
				if (!ret[ item.poiId ]) {
					const sight = cache.sights[ item.poiId ];
					if (sight) ret[ item.poiId ] = sight;
				}
				return ret;
			}, {} )
		);
*/
		Object.assign( this, {
			id: data.id,
			name: data.name,
			departure: parseDate( data.departure ),
			arrival: parseDate( data.arrival ),
			departureLocationName: data.departureLocationName,
			arrivalLocationName: data.arrivalLocationName,
			url: data.url,
			ship: cache.ship( data.shipId ),
			company: cache.ship( data.shipId )?.company,
			routeReady: false
		} );
		
		if (!!cache.stops) {
			const stops = data.stops.map( ( stop: any ) => ({
				arrival: parseDate( stop.arrival ),
				departure: parseDate( stop.departure ),
				location: cache.stops[ stop.id ]
			}) );
			this.stops = Promise.resolve( stops );
		}
		else {
			this.stops = new Promise( resolve => {
				const initStops = () => {
					const stops = data.stops.map( ( stop: any ) => ({
						arrival: parseDate( stop.arrival ),
						departure: parseDate( stop.departure ),
						location: cache.stops[ stop.id ]
					}) );
					resolve( stops );
				};
				window.addEventListener( 'trackstops-loaded', initStops, { once: true } );
			} );
		}
	}
	
	get sights() {
		if (!this._sights) this._sights = new Promise( async resolve => {
			const data = await connector.send( apiEntries.cruiseSights, { id: this.id } );
			const ids = data.reduce( ( ret: Record<string, true>, item: any ) => {
				if (!cache.sights[ item.id ]) ret[ item.id ] = true;
				return ret;
			}, {} );
			if (Object.keys( ids ).length > 0) {
				await fetchSights( Object.keys( ids ) );
			}
			this._sights = data.map( ( item: any ) => ({
				arrival: parseDate( item.arrival ),
				side: item.side.toLowerCase(),
				location: cache.sights[ item.id ]
			}) );
			resolve( this._sights );
		} );
		return this._sights;
	}
	
	get gateways() {
		if (this._gateways) return this._gateways;
		return this.route.then( () => this._gateways );
	}
	
	get sunrises() {
		if (this._sunrises) return Promise.resolve( this._sunrises );
		return this.route.then( () => this._sunrises );
	}
	
	get sunsets() {
		if (this._sunsets) return Promise.resolve( this._sunsets );
		return this.route.then( () => this._sunsets );
	}
	
	get route() {
		if (!this._route) this._route = new Promise( async resolve => {
			const data = await connector.send( apiEntries.points, { id: this.id } );
			this._sunrises = [];
			this._sunsets = [];
			const gateways: any[] = [];
			const points = data.map( ( item: any ) => {
				const ret: TrackPoint = {
					lat: item.lat,
					lng: item.lng,					
					arrival: parseDate( item.arrival ),
					angle: item.angle,
					isStop: !!item.isStop
				};
				if (item.sunrise) this._sunrises.push( ret );
				if (item.sunset) this._sunsets.push( ret );
				if (!!item.gateway) {
					gateways.push({
						arrival: ret.arrival,
						gateway: item.gateway
					});
				}
				return ret;
			} );
			if (!!cache.gateways) {
				this._gateways = Promise.resolve(
					gateways.map( ( item: any ) => ({
						arrival: item.arrival,
						location: cache.gateways[ item.gateway ]
					}) )
				);
			}
			else {
				this._gateways = new Promise( resolve => {
					const initGateways = () => {
						resolve(
							gateways.map( ( item: any ) => ({
								arrival: item.arrival,
								location: cache.gateways[ item.gateway ]
							}) )
						);
					};
					window.addEventListener( 'gateways-loaded', initGateways, { once: true } );
				} );
			}
			resolve( new CruiseRoute( points ) );
			this.routeReady = true;
		} );
		return this._route;
	}
}

class ShipData implements Ship {
	declare id: string;
	declare name: string;
	declare company: Company;

	constructor( data: any ) {
		Object.assign( this, {
			id: data.id,
			name: data.name,
			company: cache.company( data.companyId )
		} );
	}

	get navigationStartDate(): Date | undefined {
		const cruise = this.cruises()[Symbol.iterator]().next().value;
		if (!cruise) return;
		else return cruise.departure;
	}

	get navigationEndDate(): Date | undefined {
		const cruises = [ ...this.cruises() ];
		if (!cruises.length) return;
		else return cruises.reduce( ( ret: Date | undefined, cruise: Cruise ): Date | undefined => {
			const date = cruise.arrival;
			if (date && date > ( ret ?? 0 )) ret = date;
			return ret;
		}, undefined );
	}

	*cruises(): Iterable<Cruise> {
		for (const index of cache.activeCruises) {
			const cruise = cache.cruises.at( index );
			if (cruise.ship === this) yield cruise;
		}
	}

	cruisesOn( datetime: Date ): Cruise[] {
		const moment = +datetime;
		const found: Cruise[] = [];
		for (const index of cache.activeCruises) {
			const cruise = cache.cruises.at( index );
			if (cruise.ship === this) {
				if (+( cruise.departure ?? 0 ) <= moment && +( cruise.arrival ?? 0 ) >= moment) {
					found.push( cruise );
				}
			}
		}
		return found;
	}

	async positionAt( datetime: Date ): Promise<TrackPoint> {
		const moment = +datetime;
		let found: Cruise;
		for (const index of cache.activeCruises) {
			const cruise = cache.cruises.at( index );
			if (cruise.ship === this) {
				found = cruise;
				if (+( cruise.arrival ?? 0 ) >= moment) break;
			}
		}
		if (found) {
			return ( await found.route ).positionAt( datetime );
		}
		else {
			return { lat: 0, lng: 0, arrival: datetime, isStop: false };
		}
	}
}

class APIConnector {

	public baseUrl: string;

	constructor(baseUrl: string) {
		this.baseUrl = baseUrl;
	}

	/// @todo: добавить обработку ошибок
	async send(url: string, data: any = {}): Promise<any> {
		const response = await fetch(`${this.baseUrl}/${url}`, {
			method: 'POST',
			body: JSON.stringify(data),
			headers: {'content-type': 'application/json'},
		});
		return await response.json();
	}

}

const connector = new APIConnector( apiURL );

function dataIsSane( type: 'cruise' | 'company' | 'ship', data: any ): boolean {
	switch (type) {
		case 'cruise' :
		return !!data.shipId &&
			!!data.departure &&
			!!data.arrival;
	}
	return true;
}

/*
async function fetchCruise( id: string ) : Promise<Cruise> {
	const data = await connector.send( apiEntries.cruiseByID, { id } ) ?? [];
	if (!dataIsSane( 'cruise', data )) throw new Error( 'Invalid data' );
	const ret = new CruiseData( data );
	if (ret.shipId) await cache.ship( ret.shipId );
	return ret;
}
*/

async function fetchSights( ids: string[] ): Promise<void> {
	ids = ids.filter( id => !cache.sights[ id ] );
	ids.forEach( id => { ( cache.sights[ id ] as any ) = {}; } );
	const data = await connector.send( apiEntries.sightsByIds, { id: ids } );
	( data || [] ).forEach( ( item: any ) => {
		cache.sights[ item.id ] = {
			id: item.id,
			type: LocationType.SHOWPLACE,
			lat: item.lat,
			lng: item.lng,
			name: item.name,
			category: item.category,
			//~ description: item.description,
			//~ image: item.image,
			// Это для тестирования. После переноса приложения на основной сайт проверку url можно будет убрать
			image: item.image ? ( /^https?:\/\//.test( item.image ) ? '' : siteURL ) + item.image : ''
		};
	} );
}

async function fetchStops(): Promise<void> {
	const data = await connector.send( apiEntries.stops );
	cache.stops = ( data || [] ).reduce(
		( ret: Record<string, Location>, item: any ) => {
			ret[ item.id ] = {
				id: item.id,
				type: LocationType.REGULAR,
				lat: item.lat,
				lng: item.lng,
				name: item.name,
				//~ description: item.description,
				//~ image: item.image,
				// Это для тестирования. После переноса приложения на основной сайт проверку url можно будет убрать
				image: item.image ? ( /^https?:\/\//.test( item.image ) ? '' : siteURL ) + item.image : '',
				//~ link: item.url,
				// Это для тестирования. После переноса приложения на основной сайт проверку url можно будет убрать
				link: item.url ? ( /^https?:\/\//.test( item.url ) ? '' : siteURL ) + item.url : ''
			};
			return ret;
		}, {}
	) as Record<string, Location>;
	window.dispatchEvent( new Event( 'trackstops-loaded' ) )
}

async function fetchGateways(): Promise<void> {
	const data = await connector.send( apiEntries.gateways );
	cache.gateways = ( data || [] ).reduce(
		( ret: Record<string, Location>, item: any ) => {
			ret[ item.id ] = {
				id: item.id,
				type: LocationType.GATEWAY,
				lat: item.lat,
				lng: item.lng,
				name: item.name
			};
			return ret;
		}, {}
	) as Record<string, Location>;
	window.dispatchEvent( new Event( 'gateways-loaded' ) )
}

async function fetchStartCruises() : Promise<void> {
	const { cruises, ships, companies } = await connector.send( apiEntries.start );
	for (const company of Object.values( companies ?? {} ) as any) {
		if (dataIsSane( 'company', company )) {
			cache.companies.add( new CompanyData( company ) );
		}
	}
	for (const ship of Object.values( ships ?? {} ) as any) {
		if (dataIsSane( 'ship', ship )) {
			cache.ships.add( new ShipData( ship ) );
		}
	}
	for (const cruise of Object.values( cruises ?? {} ) as any) {
		if (dataIsSane( 'cruise', cruise )) {
			cache.cruises.add( new CruiseData( cruise ) );
		}
	}
	cache.setFilter({});
	window.dispatchEvent( new Event( 'cruisesDataLoaded' ) );
	await fetchStops();
	await fetchGateways();
	return;
}

class Cache {
	activeCruises : number[] = [];
	companies = new SortedList<Company>( ( a, b ) => a.name.localeCompare( b.name, 'ru', { ignorePunctuation: true } ) );
	ships = new SortedList<Ship>( ( a, b ) => a.name.localeCompare( b.name, 'ru', { ignorePunctuation: true } ) );
	cruises = new SortedList<Cruise>( ( a, b ) =>
		+a.departure - +b.departure ||
		+a.arrival - +b.arrival ||
		a.name.localeCompare( b.name, 'ru', { ignorePunctuation: true } )
	);
	stops: Record<string, Location> = null;
	sights: Record<string, Location> = {};
	gateways: Record<string, Location> = null;
}

class CruiseAPICache extends Cache implements CruiseAPI {
	activeFilters: {
		companyName?: string,
		shipName?: string,
		startDate?: Date | null,
		endDate?: Date | null
	} = {};

	constructor() {
		super();
		fetchStartCruises();
	}

	get navigationStartDate(): Date | undefined {
		if (!this.activeCruises.length) return;
		else return this.cruises.at( this.activeCruises[0] ).departure;
	}

	get navigationEndDate(): Date | undefined {
		if (!this.activeCruises.length) return;
		else return this.activeCruises.reduce( ( ret: Date | undefined, index: number ): Date | undefined => {
			const date = this.cruises.at( index ).arrival;
			if (date && date > ( ret ?? 0 )) ret = date;
			return ret;
		}, undefined );
	}
	
	company( id : string ) : Company {
		return this.companies.item( id );
	}

	cruise( id : string ) : Cruise {
		return this.cruises.item( id );
	}

	ship( id : string ) : Ship {
		return this.ships.item( id );
	}

	*allCruises(): Iterable<Cruise> {
		for (const index of this.activeCruises) {
			yield this.cruises.at( index );
		}
	}

	*allShips(): Iterable<Ship> {
		const shipIds: Record<string, true> = {};
		for (const index of this.activeCruises) {
			const id = this.cruises.at( index ).ship.id;
			shipIds[ id ] = true;
		}
		yield* this.ships.filter( ship => shipIds[ ship.id ] );
	}

	*allCompanies(): Iterable<Company> {
		const companyIds: Record<string, true> = {};
		for (const ship of this.allShips()) {
			companyIds[ ship.company.id ] = true;
		}
		yield* this.companies.filter( company => companyIds[ company.id ] );
	}

	setFilter( options: { companyName?: string, shipName?: string, startDate?: Date | null, endDate?: Date | null } ) {
		for (const key of [ 'companyName', 'shipName', 'startDate', 'endDate' ]) {
			if (key in options) (this.activeFilters as any)[ key ] = (options as any)[ key ];
		}
		this.activeCruises = [ ...this.cruises.items.keys() ].filter( index => {
			const cruise = this.cruises.at( index );
			let ret = true;
			if (this.activeFilters.companyName || this.activeFilters.shipName) {
				ret =
					( this.activeFilters.companyName && cruise.company?.name.toLowerCase().includes( this.activeFilters.companyName.toLowerCase() ) )
					||
					( this.activeFilters.shipName && cruise.ship?.name.toLowerCase().includes( this.activeFilters.shipName.toLowerCase() ) );
			}
			if (ret && this.activeFilters.startDate && ( !cruise.departure || cruise.departure < this.activeFilters.startDate )) ret = false;
			if (ret && this.activeFilters.endDate && ( !cruise.arrival || cruise.arrival > this.activeFilters.endDate )) ret = false;
			return ret;
		} );
	};
}

const cache = new CruiseAPICache;

export default cache;

function parseDate(dateString: string): Date {
	let match = dateString
		.match(/(\d{2})\.(\d{2})\.(\d{4})\s(\d{2}):(\d{2}):(\d{2})?/);
	if (match) {
		const [, day, month, year, hour, minute, second = '00'] = match;
		return new Date(+year, +month - 1, +day, +hour, +minute, +second);
	}

	//~ match = dateString
		//~ .match(/(\d{4})-(\d{2})-(\d{2})\s(\d{2}):(\d{2}):(\d{2})?/);
	//~ const [, year, month, day, hour, minute, second = '00'] = match;
	//~ return new Date(+year, +month - 1, +day, +hour, +minute, +second);
	return new Date( dateString );
}
