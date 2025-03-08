import {
	CruiseAPI, 
	Cruise, Company, Ship,
	CruiseRoute, TrackStop, TrackStopDetails
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
		for (const cruise of cache.activeCruises) {
			const ship = await cache.cruises[ cruise ]?.ship();
			if (ship?.companyId === this.id) yield cache.cruises[ cruise ];
		}
	}

	async* ships(): AsyncIterable<Ship> {
		for (const cruise of cache.activeCruises) {
			const ship = await cache.cruises[ cruise ]?.ship();
			if (ship?.companyId === this.id) yield ship;
		}
	}
}

class CruiseData implements Cruise {
	declare id: string;
	declare departure: Date;
	declare arrival: Date;
	declare departureLocationName?: string;
	declare arrivalLocationName?: string;
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
					sunrise: Sunrise,
					angle
				}))
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
			departure: parseDate( data.PROPERTY_DEPARTUREDATE_VALUE ),
			arrival: parseDate( data.PROPERTY_ARRIVALDATE_VALUE ),
			departureLocationName: undefined,
			arrivalLocationName: undefined,
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
			companyId: data.companyId_VALUE
		} );
	}
	
	async company(): Promise<Company> {
		return await cache.company( this.companyId );
	}

	*cruises(): Iterable<Cruise> {
		for (const cruise of cache.activeCruises) {
			if (cache.cruises[ cruise ]?.shipId === this.id) yield cache.cruises[ cruise ];
		}
	};
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

async function fetchCompanies() : Promise<Record<string, Company>> {
	const data = await connector.send( apiEntries.shipCompanies ) ?? [];
	const ret : Record<string, Company> = {};
	for (const company of data) {
		if (!ret[ company.ID ]) ret[ company.ID ] = new CompanyData( company );
	}
	return ret;
}

async function fetchCruise( id: string ) : Promise<Cruise> {
	const data = await connector.send( apiEntries.cruiseByID, { id } ) ?? [];
	if (!dataIsSane( 'cruise', data )) throw new Error( 'Invalid data' );
	const ret = new CruiseData( data );
	if (ret.shipId) await cache.ship( ret.shipId );
	return ret;
}

async function fetchShip( id: string ) : Promise<Ship> {
	const data = await connector.send( apiEntries.shipByID, { id } ) ?? [];
	const ret = new ShipData( Object.values( data )[0] );
	if (ret.companyId) await cache.company( ret.companyId );
	return ret;
}

async function fetchStartCruises() : Promise<Record<string, Cruise>> {
	const [ data, companies ] = await Promise.all([ connector.send( apiEntries.start ), fetchCompanies() ]);
	cache.companies = companies ?? {};
	const allShips: Record<string, any> = {};
	cache.cruises = {};
	cache.ships = {};
	for (const cruise of Object.values( data ?? {} ) as any) {
		if (dataIsSane( 'cruise', cruise ) && !cache.cruises[ cruise.ID ]) {
			cache.cruises[ cruise.ID ] = new CruiseData( cruise );
			if (cache.cruises[ cruise.ID ].shipId) {
				allShips[ cache.cruises[ cruise.ID ].shipId ] = true;
			}
		}
	}
	cache.activeCruises = Object.keys( cache.cruises );
	( await Promise.allSettled( Object.keys( allShips ).map( fetchShip ) ) )
// @ts-ignore
		.forEach( ({ value }) => { if (value?.id) cache.ships[ value.id ] = value } );
	return cache.cruises;
}

class Cache {
	activeCruises : string[] = [];
	companies : Record<string, Company> = {};
	ships : Record<string, Ship> = {};
	cruises : Record<string, Cruise> = {};
}

class CruiseAPICache extends Cache implements CruiseAPI {
	constructor() {
		super();
		fetchStartCruises()
			.then( () => {
				window.dispatchEvent( new Event( 'cruisesDataLoaded' ) );
			} );
	}
	
	async company( id : string ) : Promise<Company> {
		if (this.companies[ id ]) return this.companies[ id ];
		if (Object.keys( this.companies ).length === 0) {
			this.companies = await fetchCompanies();
		}
		return this.companies[ id ];
	}

	async cruise( id : string ) : Promise<Cruise> {
		if (this.cruises[ id ]) return this.cruises[ id ];
		const ret = await fetchCruise( id );
		if (ret) this.cruises[ id ] = ret;
		return ret;
	}

	async ship( id : string ) : Promise<Ship> {
		if (this.ships[ id ]) return this.ships[ id ];
		const ret = await fetchShip( id );
		if (ret) this.ships[ id ] = ret;
		return ret;
	}
	
	*allCruises(): Iterable<Cruise> {
		for (const id of this.activeCruises) {
			yield this.cruises[ id ];
		}
	}
	
	async* allShips(): AsyncIterable<Ship> {
		const tmpShips: Record<string, Ship> = {};
		for (const cruise of this.allCruises()) {
			if (!tmpShips[ cruise.shipId ]) {
				tmpShips[ cruise.shipId ] = await cruise.ship();
			}
		}
		const tmpShipsArr = Object.values( tmpShips );
		tmpShipsArr.sort( ( a, b ) => a.name < b.name ? -1 : a.name > b.name ? 1 : 0 );
		yield* tmpShipsArr;
	}
	
	async* allCompanies(): AsyncIterable<Company> {
		const tmpCompanies: Record<string, Company> = {};
		for await (const ship of this.allShips()) {
			if (!tmpCompanies[ ship.companyId ]) {
				tmpCompanies[ ship.companyId ] = await ship.company();
			}
		}
		const tmpCompaniesArr = Object.values( tmpCompanies );
		tmpCompaniesArr.sort( ( a, b ) => a.name < b.name ? -1 : a.name > b.name ? 1 : 0 );
		yield* tmpCompaniesArr;
	}
	
	async* search( text : string ) : AsyncIterable<any> {
		return;
	};
}

const cache = new CruiseAPICache;

export default cache;

/*
class APIConnector {

	public baseUrl: string;

	constructor(baseUrl: string) {
		this.baseUrl = baseUrl;
	}

	async send(url: string, data: any = {}): Promise<any> {
		const response = await fetch(`${this.baseUrl}/${url}`, {
			method: 'POST',
			body: JSON.stringify(data),
			headers: {'content-type': 'application/json'},
		});
		return await response.json();
	}

}

class Cache {

	private _cruisesPreviews?: APICruisePreview[] = undefined;
	shipsCruises: Record<string, APICruisePreview[]> = {};
	get cruisesPreviews(): APICruisePreview[] | undefined {
		return this._cruisesPreviews;
	}
	set cruisesPreviews(value) {
		this._cruisesPreviews = value;
		for (const cruise of (value ?? [])) {
			if (!(cruise.shipId in this.shipsCruises))
				this.shipsCruises[cruise.shipId] = [];
			this.shipsCruises[cruise.shipId].push(cruise);
		}
	}

	ships: Record<string, APIShip> = {};

}

class APIEntry {

	declare protected connector: APIConnector;
	declare protected cache: Cache;

	constructor(connector: APIConnector, cache: Cache) {
		this.connector = connector;
		this.cache = cache;
	}

}

export default class CruiseAPIEntry extends APIEntry implements CruiseEntry {

	constructor(baseUrl = '') {
		super(new APIConnector(baseUrl), new Cache());
	}

	async* allShips() {
		await this.cruisesPreviews();
		for (const [cruise] of Object.values(this.cache.shipsCruises))
			yield await cruise.ship();
	}

	async* search(searchString: string): ReturnType<CruiseEntry['search']> {
		const data = await this.connector.send('api/search/title/', {
			q: searchString
		});
		for (const item of data)
			if (APIShip.dataFilter(item) && (item.ID in this.cache.shipsCruises)) {
				if (!(item.ID in this.cache.ships))
					this.cache.ships[item.ID] = new APIShip(
						this.connector, this.cache, item
					);
				yield ['ship', this.cache.ships[item.ID]];
			}
	}

	async* allCompanies() {}
	async* searchCompanies() {}

	private async cruisesPreviews(): Promise<APICruisePreview[]> {
		if (!this.cache.cruisesPreviews) {
			const data = await this.connector.send('api/cruis/start/');
			this.cache.cruisesPreviews = Object.values(data)
				.filter(data => APICruise.dataIntegrity(data))
				.map(data => new APICruise(this.connector, this.cache, data));
		}
		return this.cache.cruisesPreviews;
	}

}

class APICruise extends APIEntry implements Cruise {

	declare id: string;
	declare departure: Date;
	declare arrival: Date;
	departureLocationName?: string = undefined;
	arrivalLocationName?: string = undefined;
	declare shipId: string;
	declare stops: Cruise['stops'];
	declare route: Cruise['route'];

	static dataIntegrity(data: any): boolean {
		return !!data.PROPERTY_SHIPID_VALUE
			&& data.POINTS?.length > 0;
	}

	constructor(connector: APIConnector, cache: Cache, data: any) {
		super(connector, cache);
		Object.assign(this, {
			id: data.ID,
			departure: parseDate(data.PROPERTY_DEPARTUREDATE_VALUE),
			arrival: parseDate(data.PROPERTY_ARRIVALDATE_VALUE),
			shipId: data.PROPERTY_SHIPID_VALUE,
			stops: [],
			route: new CruiseRoute(
				data.POINTS
					.filter(Boolean)
					.map(({
						coordinates: {latitude: lat, longitude: lng},
						pointArrivalDate,
					}: any) => ({
						lat, lng,
						arrival: parseDate(pointArrivalDate),
					}))
			),
		});
	}

	async ship(): Promise<Ship> {
		if (!(this.shipId in this.cache.ships)) {
			const data = await this.connector.send('api/ship/byID/', {
				id: this.shipId,
			});
			this.cache.ships[this.shipId] = new APIShip(
				this.connector, this.cache, data[this.shipId]
			);
		}
		return this.cache.ships[this.shipId];
	}

	async full(): Promise<APICruise> {
		return this;
	}

}

type APICruisePreview = APICruise;

class APICompany extends APIEntry implements Company {

	declare id: unknown;
	declare name: string;
	declare color: number;

	constructor(connector: APIConnector, cache: Cache, data: any) {
		super(connector, cache);
		Object.assign(this, {
			id: data.ID,
			name: '<Компания>',
			color: 0x31739D,
		});
	}

	async* ships() {
		for (const [cruise] of Object.values(this.cache.shipsCruises))
			yield await cruise.ship();
	}

}

class APIShip extends APIEntry implements Ship {

	declare id: string;
	declare name: string;
	declare company: Ship['company'];

	static dataFilter(data: any) {
		return !!data.shipClass;
	}

	constructor(connector: APIConnector, cache: Cache, data: any) {
		super(connector, cache);
		Object.assign(this, {
			id: data.ID,
			name: data.NAME,
		});
		this.company = async () => new APICompany(connector, cache, data);
	}

	async* cruises() {
		for (const cruise of this.cache.shipsCruises[this.id] ?? [])
			yield await cruise.full();
	}

}
*/

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
