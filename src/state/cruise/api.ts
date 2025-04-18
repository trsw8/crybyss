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
	startCruise : '?service=map&method=start&option=cruise',
	startStops : '?service=map&method=start&option=stops',
	startSights : '?service=map&method=start&option=sights',
	stops : '?service=map&method=stops',
	cruiseSights : '?service=map&method=sights&option=byCruiseId',
	sightsByIds : '?service=map&method=sights&option=byIds',
	gateways : '?service=map&method=gateways',
	points : '?service=map&method=points'
};

const brandColors: Record<string, number> = {
	'АЗУРИТ': 0x31739D,
	'Мостурфлот': 0xF8130D
};
const otherColors = [
	0xE137C2,
	0x8CE4CB,
	0xFFC4A4,
	0xFEBC43,
	0xB9D252,
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
	0xC84457,
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
		Object.assign( this, {
			id: data.id,
			name: data.name,
			departure: parseDate( data.departure ),
			arrival: parseDate( data.arrival ),
			departureLocationName: data.departureLocationName,
			arrivalLocationName: data.arrivalLocationName,
			//~ url: data.url,
			// Это для тестирования. После переноса приложения на основной сайт проверку url можно будет убрать
			url: data.url ? ( /^https?:\/\//.test( data.url ) ? '' : siteURL ) + data.url : '',
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

		if (!!data.sights) {
			const sights = data.sights.map( ( item: any ) => ({
				arrival: parseDate( item.arrival ),
				side: item.side.toLowerCase(),
				location: cache.sights[ item.id ] as Location
			}) );
			this._sights = Promise.resolve( sights );
		}

		if (!!data.points) {
			const points = this._parseRoute( data.points );
			this._route = Promise.resolve( new CruiseRoute( points ) );
			this.routeReady = true;
		}
	}

	get sights() {
		if (!this._sights) this._sights = new Promise( async resolve => {
			const data = await fetchCruiseSights( this.id );
			const ids = data.reduce( ( ret: Record<string, true>, item: any ) => {
				if (!cache.sights[ item.id ] || cache.sights[ item.id ] instanceof Promise) ret[ item.id ] = true;
				return ret;
			}, {} );
			if (Object.keys( ids ).length > 0) {
				await fetchSights( Object.keys( ids ) );
			}
			const sights = data.map( ( item: any ) => ({
				arrival: parseDate( item.arrival ),
				side: item.side.toLowerCase(),
				location: cache.sights[ item.id ] as Location
			}) );
			resolve( sights );
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

	_parseRoute( data: any ) {
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
		return points;
	}

	get route() {
		if (!this._route) this._route = new Promise( async resolve => {
			const data = await fetchCruiseTracks( this.id );
			const points = this._parseRoute( data );
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
		if (!cruise?.departure) return;
		else {
			const navigationStartDate =  new Date( +cruise.departure );
			navigationStartDate.setMilliseconds(0);
			navigationStartDate.setSeconds(0);
			navigationStartDate.setMinutes(0);
			navigationStartDate.setHours(0);
			return navigationStartDate;
		}
	}

	get navigationEndDate(): Date | undefined {
		const cruises = [ ...this.cruises() ];
		if (!cruises.length) return;
		else {
			const max = Math.max( ...cruises.map( cruise => +( cruise.arrival ?? -Infinity ) ) );
			if (Number.isFinite( max )) {
				const navigationEndDate = new Date( max );
				navigationEndDate.setMilliseconds(999);
				navigationEndDate.setSeconds(59);
				navigationEndDate.setMinutes(59);
				navigationEndDate.setHours(23);
				return navigationEndDate;
			}
			else return;
		}
	}

	*cruises(): Iterable<Cruise> {
		for (const index of cache.activeCruises) {
			const cruise = cache.cruises.at( index );
			if (cruise.ship === this) yield cruise;
		}
	}

	cruisesOn( datetime: Date ): Cruise[] {
		const moment = +datetime;
		const dateObj = new Date( moment );
		dateObj.setMilliseconds(0);
		dateObj.setSeconds(0);
		dateObj.setMinutes(0);
		dateObj.setHours(0);
		const dayStart = +dateObj;
		const dayEnd = dayStart + 86399999;
		const found: Cruise[] = [];
		const arrived: Cruise[] = [];
		const departing: Cruise[] = [];
		for (const index of cache.activeCruises) {
			const cruise = cache.cruises.at( index );
			if (cruise.ship === this) {
				if (+( cruise.departure ?? 0 ) <= moment && +( cruise.arrival ?? 0 ) >= moment) {
					found.push( cruise );
				}
				else if (+( cruise.departure ?? 0 ) >= dayStart && +( cruise.departure ?? 0 ) <= dayEnd) {
					departing.push( cruise );
				}
				else if (+( cruise.arrival ?? 0 ) >= dayStart && +( cruise.arrival ?? 0 ) <= dayEnd) {
					arrived.push( cruise );
				}
			}
		}
		if (!found.length) {
			if (departing.length) found.push( ...departing );
			else if (arrived.length) found.push( ...arrived );
		}
		return found;
	}

	cruiseOn( datetime: Date ): Cruise | undefined {
		const cruises = this.cruisesOn( datetime );
		let i = 0;
		while (i < cruises.length - 1 && +cruises[ i + 1 ].departure === +cruises[0].departure) i++;
		return cruises[ i ];
	}

	async positionAt( datetime: Date ): Promise<TrackPoint> {
		const cruise = this.cruiseOn( datetime );
		if (cruise) {
			return ( await cruise.route ).positionAt( datetime );
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

let cruiseTracksToFetch: Record<string, ( data: any ) => void> = {};
function fetchCruiseTracks( id: string ) {
	const ret: Promise<any[]> = new Promise( resolve => {
		cruiseTracksToFetch[ id ] = resolve;
	} );
	setTimeout( async () => {
		const ids = Object.keys( cruiseTracksToFetch );
		if (ids.length) {
			const resolvers = cruiseTracksToFetch;
			cruiseTracksToFetch = {};
			const data = await connector.send( apiEntries.points, { id: ids } );
			for (const id of Object.keys( data )) {
				resolvers[ id ]( data[ id ] );
			}
		}
	}, 10 );

	return ret;
}

let cruiseSightsToFetch: Record<string, ( data: any ) => void> = {};
function fetchCruiseSights( id: string ) {
	const ret: Promise<any[]> = new Promise( resolve => {
		cruiseSightsToFetch[ id ] = resolve;
	} );
	setTimeout( async () => {
		const ids = Object.keys( cruiseSightsToFetch );
		if (ids.length) {
			const resolvers = cruiseSightsToFetch;
			cruiseSightsToFetch = {};
			const data = await connector.send( apiEntries.cruiseSights, { id: ids } );
			for (const id of Object.keys( data )) {
				resolvers[ id ]( data[ id ] );
			}
		}
	}, 10 );

	return ret;
}

let sightsToFetch: Record<string, true> = {};
async function fetchSights( ids: string[] ) {
	ids.forEach( id => sightsToFetch[ id ] = true );
	await new Promise( resolve => { setTimeout( resolve, 10 ); } );
	const newIds = Object.keys( sightsToFetch ).filter( id => !cache.sights[ id ] );
	sightsToFetch = {};
	if (newIds.length) {
		const dataPromise = connector.send( apiEntries.sightsByIds, { id: newIds } );
		newIds.forEach( id => { ( cache.sights[ id ] as any ) = dataPromise; } );
		const data = await dataPromise;
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
				image: item.image ? ( /^https?:\/\//.test( item.image ) ? '' : siteURL ) + item.image : '',
				//~ link: item.url,
				// Это для тестирования. После переноса приложения на основной сайт проверку url можно будет убрать
				link: item.url ? ( /^https?:\/\//.test( item.url ) ? '' : siteURL ) + item.url : ''
			};
		} );
	}

	const promisesSet = new Set;
	ids.forEach( id => {
		if (cache.sights[ id ] instanceof Promise) promisesSet.add( cache.sights[ id ] );
	} );
	const promises = [ ...promisesSet.values() ];
	if (promises.length) await Promise.all( promises );
}

async function fetchStops() {
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

async function fetchGateways() {
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

async function fetchStartCruises() {
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

async function fetchStartSingleCruise( cruiseId: string ) {
	const { ship, company, 'stops-data': stops, 'sights-data': sights, gateways, ...cruise } = await connector.send( apiEntries.startCruise, { id: cruiseId } );

	if (dataIsSane( 'company', company )) {
		cache.companies.add( new CompanyData( company ) );
	}
	if (dataIsSane( 'ship', ship )) {
		cache.ships.add( new ShipData( ship ) );
	}

	if (dataIsSane( 'cruise', cruise )) {
		cache.stops = ( stops || [] ).reduce(
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

		( sights || [] ).forEach( ( item: any ) => {
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
				image: item.image ? ( /^https?:\/\//.test( item.image ) ? '' : siteURL ) + item.image : '',
				//~ link: item.url,
				// Это для тестирования. После переноса приложения на основной сайт проверку url можно будет убрать
				link: item.url ? ( /^https?:\/\//.test( item.url ) ? '' : siteURL ) + item.url : ''
			};
		} );

		cache.gateways = ( gateways || [] ).reduce(
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

		cache.cruises.add( new CruiseData( cruise ) );
		cache.setFilter({});

		window.dispatchEvent( new Event( 'cruisesDataLoaded' ) );
	}
}

async function fetchStartLocations( type: string, id?: string | string[] ) {
	let result;

	if (!id || ( Array.isArray( id ) && !id.length )) {
		await Promise.resolve();
		result = {};
	}
	else {
		const url = type === 'stops' ? apiEntries.startStops : apiEntries.startSights;

		const data = await connector.send( url, { id } );
		result = ( data || [] ).reduce(
			( ret: Record<string, Location>, item: any ) => {
				ret[ item.id ] = {
					id: item.id,
					type: type === 'stops' ? LocationType.REGULAR : LocationType.SHOWPLACE,
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
				if (type === 'sights') {
					ret[ item.id ].category = item.category;
				}
				return ret;
			}, {}
		) as Record<string, Location>;
	}

	if (type === 'stops') cache.stops = result;
	else cache.sights = result;

	window.dispatchEvent( new Event( 'cruisesDataLoaded' ) );
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
	sights: Record<string, Location | Promise<any>> = {};
	gateways: Record<string, Location> = null;
}

class CruiseAPICache extends Cache implements CruiseAPI {
	activeFilters: {
		companyName?: string,
		shipName?: string,
		startDate?: Date | null,
		endDate?: Date | null
	} = {};

	constructor( mapMode: string, entityId: string ) {
		super();
		switch (mapMode) {
		case 'cruise':
			fetchStartSingleCruise( entityId );
			break;
		case 'stops':
			fetchStartLocations( 'stops', ( window.frameElement as HTMLIFrameElement )?.dataset.ids?.split(',') ?? [] );
			break;
		case 'single-stop':
			fetchStartLocations( 'stops', entityId );
			break;
		case 'places':
			fetchStartLocations( 'sights', ( window.frameElement as HTMLIFrameElement )?.dataset.ids?.split(',') ?? [] );
			break;
		case 'single-place':
			fetchStartLocations( 'sights', entityId );
			break;
		default:
			fetchStartCruises();
		}
	}

	get navigationStartDate(): Date | undefined {
		if (!this.activeCruises.length) return;
		else {
			const datetime = this.cruises.at( this.activeCruises[0] ).departure;
			if (datetime) {
				const navigationStartDate = new Date( +datetime );
				navigationStartDate.setMilliseconds(0);
				navigationStartDate.setSeconds(0);
				navigationStartDate.setMinutes(0);
				navigationStartDate.setHours(0);
				return navigationStartDate;
			}
			else return;
		}
	}

	get navigationEndDate(): Date | undefined {
		if (!this.activeCruises.length) return;
		else {
			const max = Math.max( ...this.activeCruises.map( index => +( this.cruises.at( index ).arrival ?? -Infinity ) ) );
			if (Number.isFinite( max )) {
				const navigationEndDate = new Date( max );
				navigationEndDate.setMilliseconds(999);
				navigationEndDate.setSeconds(59);
				navigationEndDate.setMinutes(59);
				navigationEndDate.setHours(23);
				return navigationEndDate;
			}
			else return;
		}
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

	get allStops(): Location[] {
		if (this.stops) return Object.values( this.stops );
		else return [];
	}

	get allSights(): Location[] {
		return Object.values( this.sights ).filter( item => !( item instanceof Promise ) ) as Location[];
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

let cache: CruiseAPICache;

export default function init( mapMode: string, entityId: string ) {
	cache = new CruiseAPICache( mapMode, entityId );
	return cache;
}

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
