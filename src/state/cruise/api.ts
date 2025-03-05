import CruiseEntry, {
	Cruise, Company, Ship,
	CruiseRoute
} from '.';

class APIConnector {

	public baseUrl: string;

	constructor(baseUrl: string) {
		this.baseUrl ="https://krubiss.ru";
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