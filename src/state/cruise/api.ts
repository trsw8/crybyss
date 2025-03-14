import {
	CruiseAPI,
	Cruise, Company, Ship,
	CruiseRoute, TrackPoint, TrackStop, TrackStopDetails
} from '.';

/// @todo: Конфиг вынести в отдельный файл
const siteURL = 'https://krubiss.ru';
const apiURL = 'https://krubiss.ru/api';
const apiEntries = {
	start : 'cruis/start/',
	cruiseByID : 'cruis/byID/',
	shipByID : 'ship/byID/',
	stopByID : 'stop/byID/',
	search : 'search/title/',
	cruisesByShipIDS : 'cruis/shipid/',
	shipCompanies : 'ship/companies/'
};

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
			id: data.ID,
			name: data.NAME,
			color: 0x31739D,
		} );
	}

	async* cruises(): AsyncIterable<Cruise> {
		for (const index of cache.activeCruises) {
			const cruise = cache.cruises.at( index );
			const ship = await cruise.ship();
			if (ship?.companyId === this.id) yield cruise;
		}
	}

	async* ships(): AsyncIterable<Ship> {
		const shipIds: Record<string, true> = {};
		for (const index of cache.activeCruises) {
			const cruise = cache.cruises.at( index );
			const ship = await cruise.ship();
			if (ship?.companyId === this.id) shipIds[ ship.id ] = true;
		}
		yield* cache.ships.filter( ship => shipIds[ ship.id ] );
	}
}

class CruiseData implements Cruise {
	declare id: string;
	declare name: string;
	declare departure: Date;
	declare arrival: Date;
	declare departureLocationName?: string;
	declare arrivalLocationName?: string;
	declare alias: string;
	declare url: string;
	declare shipId: string;
	declare stops: TrackStop[];
	declare route: CruiseRoute;

	constructor( data: any ) {
		const route = new CruiseRoute(
			data.POINTS
				.filter(Boolean)
				.map(({
					coordinates: {latitude: lat, longitude: lng},
					pointArrivalDate,
					Sunrise,
					angle
				}: any) => ({
					lat, lng,
					arrival: parseDate(pointArrivalDate),
					sunrise: isFinite( Sunrise ) ? Number( Sunrise ) : undefined,
					angle: isFinite( angle ) ? Number( angle ) : undefined
				}))
				.sort( ( a: TrackPoint, b: TrackPoint ) => +a.arrival - +b.arrival )
		);

		const stops = data.PROPERTY_TRACKSTOPS_VALUE.map(
			(data: any): TrackStop =>
			({
				id: data.CR_ID,
				lat: data.DETAIL.coordinates.latitude,
				lng: data.DETAIL.coordinates.longitude,
				type: undefined,
				arrival: parseDate( data.CR_ARRIVAL ),
				departure: parseDate( data.CR_DEPARTURE ),
				details: {
					name: data.DETAIL.NAME,
					categoryName: undefined,
					description: data.DETAIL.DETAIL_TEXT,
					//~ image: data.DETAIL.DETAIL_PICTURE
					// Это для тестирования. После переноса приложения на основной сайт проверку url можно будет убрать
					image: ( /^https?:\/\//.test( data.DETAIL.DETAIL_PICTURE ) ? '' : siteURL ) + data.DETAIL.DETAIL_PICTURE,
					//~ link: data.DETAIL.URL
					// Это для тестирования. После переноса приложения на основной сайт проверку url можно будет убрать
					link: ( /^https?:\/\//.test( data.DETAIL.URL ) ? '' : siteURL ) + data.DETAIL.URL,
				}
			})
		);

		Object.assign( this, {
			id: data.ID,
			name: data.NAME,
			departure: parseDate( data.PROPERTY_DEPARTUREDATE_VALUE ),
			arrival: parseDate( data.PROPERTY_ARRIVALDATE_VALUE ),
			departureLocationName: undefined,
			arrivalLocationName: undefined,
			alias: data.CODE,
			url: data.PROPERTY_WEB_VALUE,
			shipId: data.PROPERTY_SHIPID_VALUE,
			stops,
			route
		} );
	}

	async ship(): Promise<Ship> {
		return this.shipId ? await cache.ship( this.shipId ) : undefined;
	}

	async company(): Promise<Company> {
		const ship = await this.ship();
		return ship?.companyId ? await cache.company( ship.companyId ) : undefined;
	}
}

class ShipData implements Ship {
	declare id: string;
	declare name: string;
	declare companyId: string;

	constructor( data: any ) {
		Object.assign( this, {
			id: data.ID,
			name: data.NAME,
			//~ companyId: data.companyId_VALUE
			companyId: data.COMPANY?.ID
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

	//~ async company(): Promise<Company> {
		//~ return await cache.company( this.companyId );
	//~ }
	company(): Company {
		return cache.company( this.companyId );
	}

	*cruises(): Iterable<Cruise> {
		for (const index of cache.activeCruises) {
			const cruise = cache.cruises.at( index );
			if (cruise.shipId === this.id) yield cruise;
		}
	}

	cruiseOn( datetime: Date ): Cruise | undefined {
		const moment = +datetime;
		let found: Cruise;
		for (const index of cache.activeCruises) {
			const cruise = cache.cruises.at( index );
			if (cruise.shipId === this.id) {
				if (+( cruise.arrival ?? 0 ) >= moment) return cruise;
				found = cruise;
			}
		}
		return found;
	}

	positionAt( datetime: Date ): TrackPoint {
		const moment = +datetime;
		let found: Cruise;
		for (const index of cache.activeCruises) {
			const cruise = cache.cruises.at( index );
			if (cruise.shipId === this.id) {
				found = cruise;
				if (+( cruise.arrival ?? 0 ) >= moment) break;
			}
		}
		if (found) {
			return found.route.positionAt( datetime );
		}
		else {
			return { lat: 0, lng: 0, arrival: datetime };
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
		return !!data.PROPERTY_SHIPID_VALUE && data.POINTS?.length > 0;
	}
	return true;
}

//~ async function fetchCompanies() : Promise<Record<string, Company>> {
	//~ const data = await connector.send( apiEntries.shipCompanies ) ?? [];
	//~ const ret : Record<string, Company> = {};
	//~ for (const company of data) {
		//~ if (!ret[ company.ID ]) ret[ company.ID ] = new CompanyData( company );
	//~ }
	//~ return ret;
//~ }

async function fetchCruise( id: string ) : Promise<Cruise> {
	const data = await connector.send( apiEntries.cruiseByID, { id } ) ?? [];
	if (!dataIsSane( 'cruise', data )) throw new Error( 'Invalid data' );
	const ret = new CruiseData( data );
	if (ret.shipId) await cache.ship( ret.shipId );
	return ret;
}

async function fetchShip( id: string ) : Promise<Ship> {
	const data = Object.values( await connector.send( apiEntries.shipByID, { id } ) )[0] as any;
	if (!data) throw new Error( 'Invalid data' );
	const ret = new ShipData( data );
	//~ if (ret.companyId) await cache.company( ret.companyId );
	if (ret.companyId && !cache.company( ret.companyId )) {
		cache.companies.add( new CompanyData( data.COMPANY ) );
	}
	return ret;
}

async function fetchStartCruises() : Promise<void> {
	//~ const [ data, companies ] = await Promise.all([ connector.send( apiEntries.start ), fetchCompanies() ]);
	const data = await connector.send( apiEntries.start );
	const allShips: Record<string, any> = {};
	for (const cruise of Object.values( data ?? {} ) as any) {
		if (dataIsSane( 'cruise', cruise )) {
			cache.cruises.add( new CruiseData( cruise ) );
			if (cache.cruises.item( cruise.ID ).shipId) {
				allShips[ cache.cruises.item( cruise.ID ).shipId ] = true;
			}
		}
	}
	( await Promise.allSettled( Object.keys( allShips ).map( fetchShip ) ) )
// @ts-ignore
		.forEach( ({ value }) => { if (value?.id) cache.ships.add( value ) } );
	await cache.setFilter({});
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
		fetchStartCruises()
			.then( () => {
				window.dispatchEvent( new Event( 'cruisesDataLoaded' ) );
			} );
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

	//~ async company( id : string ) : Promise<Company> {
	company( id : string ) : Company {
		//~ if (this.companies[ id ]) return this.companies[ id ];
		//~ if (Object.keys( this.companies ).length === 0) {
			//~ this.companies = await fetchCompanies();
		//~ }
		return this.companies.item( id );
	}

	async cruise( id : string ) : Promise<Cruise> {
		let ret = this.cruises.item( id );
		if (ret) return ret;
		ret = await fetchCruise( id );
		if (ret) this.cruises.add( ret );
		return ret;
	}

	async ship( id : string ) : Promise<Ship> {
		let ret = this.ships.item( id );
		if (ret) return ret;
		ret = await fetchShip( id );
		if (ret) this.ships.add( ret );
		return ret;
	}

	*allCruises(): Iterable<Cruise> {
		for (const index of this.activeCruises) {
			yield this.cruises.at( index );
		}
	}

	async* allShips(): AsyncIterable<Ship> {
		const shipIds: Record<string, true> = {};
		for (const index of this.activeCruises) {
			const id = this.cruises.at( index ).shipId;
			shipIds[ id ] = true;
			if (!this.ships.item( id )) await this.ship( id );
		}
		yield* this.ships.filter( ship => shipIds[ ship.id ] );
	}

	async* allCompanies(): AsyncIterable<Company> {
		const companyIds: Record<string, true> = {};
		for await (const ship of this.allShips()) {
			companyIds[ ship.companyId ] = true;
			//~ if (!this.companies.item( ship.companyId )) await ship.company();
		}
		yield* this.companies.filter( company => companyIds[ company.id ] );
	}

	async* search( text : string ) : AsyncIterable<any> {
		return;
	};

	async setFilter( options: { companyName?: string, shipName?: string, startDate?: Date | null, endDate?: Date | null } ) {
		for (const key of [ 'companyName', 'shipName', 'startDate', 'endDate' ]) {
			if (key in options) (this.activeFilters as any)[ key ] = (options as any)[ key ];
		}
		if (this.activeFilters.shipName) {
			await Promise.all( this.cruises.items.map( cruise => cruise.ship() ) );
		}
		if (this.activeFilters.companyName) {
			await Promise.all( this.cruises.items.map( cruise => cruise.company() ) );
		}
		this.activeCruises = [ ...this.cruises.items.keys() ].filter( index => {
			const cruise = this.cruises.at( index );
			let ret = true;
			if (this.activeFilters.companyName || this.activeFilters.shipName) {
				ret =
					( this.activeFilters.companyName && this.companies.item( this.ships.item( cruise.shipId )?.companyId )?.name.toLowerCase().includes( this.activeFilters.companyName.toLowerCase() ) )
					||
					( this.activeFilters.shipName && this.ships.item( cruise.shipId )?.name.toLowerCase().includes( this.activeFilters.shipName.toLowerCase() ) );
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

	match = dateString
		.match(/(\d{4})-(\d{2})-(\d{2})\s(\d{2}):(\d{2}):(\d{2})?/);
	const [, year, month, day, hour, minute, second = '00'] = match;
	return new Date(+year, +month - 1, +day, +hour, +minute, +second);
}
