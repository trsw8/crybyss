/** Интерфейсы для получения данных о круизах по API */

export interface CruiseAPI {
	navigationStartDate: Date;
	navigationEndDate: Date;
	company: ( id : string ) => Company;
	cruise: ( id : string ) => Cruise;
	ship: ( id : string ) => Ship;
	allCruises: () => Iterable<Cruise>;
	allShips: () => Iterable<Ship>;
	allCompanies: () => Iterable<Company>;
	setFilter: ( options: { companyName?: string, shipName?: string, startDate?: Date | null, endDate?: Date | null } ) => void;
}

export interface Cruise {
	id: string;
	name: string;
	departure: Date;
	arrival: Date;
	departureLocationName: string;
	arrivalLocationName: string;
	url: string;
	ship: Ship;
	company: Company;
	routeReady: boolean;
	stops: Promise<TrackLocation[]>;
	sights: Promise<TrackLocation[]>;
	gateways: Promise<TrackLocation[]>;
	sunrises: Promise<TrackPoint[]>;
	sunsets: Promise<TrackPoint[]>;
	route: Promise<CruiseRoute>;
}

//~ export const defaultCompanyColor = 0xD9D9D9;
export const defaultCompanyColor = 0x888888;

export interface Company {
	id: string;
	name: string;
	color: number;
	ships: () => Iterable<Ship>;
	cruises: () => Iterable<Cruise>;
}

export interface Ship {
	id: string;
	name: string;
	navigationStartDate?: Date;
	navigationEndDate?: Date;
	company: Company;
	cruises: () => Iterable<Cruise>;
	cruisesOn: ( datetime: Date ) => Cruise[];
	cruiseOn: ( datetime: Date ) => Cruise | undefined;
	positionAt: ( datetime: Date ) => Promise<TrackPoint>;
}

export interface Location {
	id: string;
	type: LocationType;
	lat: number;
	lng: number;
	name: string;
	category?: string;
	//~ description?: string;
	image?: string;
	link?: string;
}

export interface TrackLocation {
	arrival: Date;
	departure?: Date;
	side?: 'left' | 'right';
	location: Location;
}

export interface TrackPoint {
	lat: number;
	lng: number;
	arrival: Date;
	isStop: boolean;
	sunrise?: boolean;
	sunset?: boolean;
	angle?: number;
}

export enum LocationType {
	REGULAR,
	SHOWPLACE,
	GATEWAY
}

export class CruiseRoute {

	declare points: TrackPoint[];

	constructor(points: TrackPoint[]) {
		this.points = points;
	}

	positionAt( datetime: Date ): TrackPoint {
		if (!this.points.length) {
			return { arrival: datetime, lat: 0, lng: 0, isStop: true };
		}
		
		const needle = +datetime;
		let sliceStart = 0;
		let sliceEnd = this.points.length - 1;
		let previous = -1;
		while (sliceStart <= sliceEnd) {
			const center = sliceStart + sliceEnd >> 1;
			const arrival = +this.points[center].arrival;
			if (arrival === needle) {
				let index = center;
				while (index < this.points.length - 1 && !this.points[ index ].isStop && this.points[ index ].arrival >= this.points[ index + 1 ].arrival) index++;
				while (index > 0 && !this.points[ index ].isStop && this.points[ index ].arrival <= this.points[ index - 1 ].arrival) index--;
				return index > 0 && index < this.points.length - 1 ? this.points[index] : { ...this.points[index], angle: undefined };
			}
			if (arrival < needle) {
				previous = center;
				sliceStart = center + 1;
			}
			else {
				sliceEnd = center - 1;
			}
		}
		if (previous < 0) {
			return { ...this.points[0], angle: undefined };
		}
		else {
			while (previous < this.points.length - 1 && this.points[ previous + 1 ].arrival <= this.points[ previous ].arrival) previous++;
			if (previous >= this.points.length - 1) return { ...this.points[ this.points.length - 1 ], angle: undefined };
		};

		const frac = (needle - +this.points[ previous ].arrival) / ( +this.points[ previous + 1 ].arrival - +this.points[ previous ].arrival );
		const lat = this.points[ previous ].lat * ( 1 - frac ) + this.points[ previous + 1 ].lat * frac;
		const lng = this.points[ previous ].lng * ( 1 - frac ) + this.points[ previous + 1 ].lng * frac;
		let angle = undefined;
		if (
			!this.points[ previous ].isStop && this.points[ previous ].angle !== undefined &&
			!this.points[ previous + 1 ].isStop && this.points[ previous + 1 ].angle !== undefined
		) {
			let rot = this.points[ previous + 1 ].angle - this.points[ previous ].angle;
			if (rot > 180) rot -= 360;
			else if (rot < -180) rot += 360;
			rot *= frac;
			angle = this.points[ previous ].angle + rot;
			if (angle > 180) angle -= 360;
			else if (angle < -180) angle += 360;
		}
		else if (!this.points[ previous ].isStop && !this.points[ previous + 1 ].isStop && this.points[ previous ].angle !== undefined) angle = this.points[ previous ].angle;
		else if (!this.points[ previous ].isStop && !this.points[ previous + 1 ].isStop && this.points[ previous + 1 ].angle !== undefined) angle = this.points[ previous + 1 ].angle;

        return { arrival: datetime, lat, lng, angle, isStop: false };
	}

/*
	pointIndexInMoment(moment: Date): number {
		const needle = +moment;
		let sliceStart = 0;
		let sliceEnd = this.points.length - 1;
		while (sliceStart < sliceEnd) {
			const center = Math.floor((sliceStart + sliceEnd) / 2);
			const arrival = +this.points[center].arrival;
			if (arrival === needle)
				return center;
			if (arrival < needle)
				sliceStart = center + 1;
			if (arrival > needle)
				sliceEnd = center - 1;
		}
		const
			candidatesStart = Math.max(sliceStart - 1, 0),
			candidatesEnd = Math.min(sliceStart + 1, this.points.length - 1);
		let result = candidatesStart;
		let minDifference = Infinity;
		for (let i = candidatesStart; i <= candidatesEnd; i++) {
			const difference = Math.abs(needle - +this.points[i].arrival);
			if (difference < minDifference) {
				result = i;
				minDifference = difference;
			}
		}
		return result;
	}
*/
}
