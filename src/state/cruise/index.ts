/** Интерфейсы для получения данных о круизах по API */

export default interface CruiseEntry {
	allShips: () => AsyncIterable<Ship>;
	allCompanies: () => AsyncIterable<Company>;
	search: (searchString: string) => AsyncIterable<
		['ship', Ship]
		| ['company', Company]
	>;
}

export interface Cruise {
	id: unknown;
	departure: Date;
	arrival: Date;
	departureLocationName?: string;
	arrivalLocationName?: string;
	shipId: unknown;
	ship: () => Promise<Ship>;
	stops: TrackStop[];
	route: CruiseRoute;
}

export interface Company {
	id: unknown;
	name: string;
	color: number;
	ships: () => AsyncIterable<Ship>;
}

export interface Ship {
	id: unknown;
	name: string;
	company: () => Promise<Company>;
	cruises: () => AsyncIterable<Cruise>;
}

export interface TrackStop {
	id: unknown;
	lat: number;
	lng: number;
	type: LocationType;
	arrival: Date;
	departure: Date;
	details: () => Promise<TrackStopDetails>;
}

export interface TrackStopDetails {
	name: string;
	categoryName?: string;
	description: string;
	image?: string;
}

export interface TrackPoint {
	lat: number;
	lng: number;
	arrival: Date;
}

export enum LocationType {
	REGULAR,
	SHOWPLACE,
}

export class CruiseRoute {

	declare points: TrackPoint[];

	constructor(points: TrackPoint[]) {
		this.points = points;
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