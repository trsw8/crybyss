/** Интерфейсы для получения данных о круизах по API */

export interface CruiseAPI {
	navigationStartDate?: Date;
	navigationEndDate?: Date;
	company: ( id : string ) => Company;
	cruise: ( id : string ) => Promise<Cruise>;
	ship: ( id : string ) => Promise<Ship>;
	allCruises: () => Iterable<Cruise>;
	allShips: () => AsyncIterable<Ship>;
	allCompanies: () => AsyncIterable<Company>;
	search: ( text: string ) => AsyncIterable<any>;
	setFilter: ( options: { companyName?: string, shipName?: string, startDate?: Date | null, endDate?: Date | null } ) => Promise<void>;
}

export interface Cruise {
	id: string;
	name: string;
	departure: Date;
	arrival: Date;
	departureLocationName?: string;
	arrivalLocationName?: string;
	shipId: string;
	alias: string;
	url: string;
	ship: () => Promise<Ship>;
	company: () => Promise<Company>;
	stops: TrackStop[];
	sights: TrackStop[];
	gateways: { gateway: TrackLocation, trackpoint: TrackPoint }[];
	sunrises: TrackPoint[];
	sunsets: TrackPoint[];
	route: CruiseRoute;
}

export interface Company {
	id: string;
	name: string;
	color: number;
	ships: () => AsyncIterable<Ship>;
	cruises: () => AsyncIterable<Cruise>;
}

export interface Ship {
	id: string;
	name: string;
	companyId: string;
	navigationStartDate?: Date;
	navigationEndDate?: Date;
	company: () => Company;
	cruises: () => Iterable<Cruise>;
	cruiseOn: ( datetime: Date ) => Cruise | undefined;
	positionAt: ( datetime: Date ) => TrackPoint;
}

export interface TrackLocation {
	id: string;
	type: LocationType;
	lat: number;
	lng: number;
	name: string;
}

export interface TrackStop extends TrackLocation {
	arrival?: Date;
	departure?: Date;
	details: TrackStopDetails;
}

export interface TrackStopDetails {
	category?: string;
	description: string;
	image?: string;
	link?: string;
}

export interface TrackPoint {
	lat: number;
	lng: number;
	arrival: Date;
	isStop: boolean;
	sunrise: boolean;
	sunset: boolean;
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

        return { arrival: datetime, lat, lng, angle, isStop: false, sunrise: false, sunset: false };
	}

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

}
