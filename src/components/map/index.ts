import {Graph} from '@datastructures-js/graph';
import {TypedEventTarget} from 'typescript-event-target';
import {DOMComponent} from '../dom';
import './index.css';

/** Низкоуровневый интерфейс карты */
export default abstract class Map extends DOMComponent {

	/** Базовый слой, желательно использовать addLayer вместо него */
	abstract mainLayer: Layer;
	/**
	 * Создает и возвращает новый слой.
	 * Методов для именования и получения слоев нет, это выходит за рамки ответственности класса.
	 */
	abstract addLayer(): Layer;

	abstract panTo(lat: number, lng: number): void;
	/** Установка границ, за которые не будут выходить попапы */
	abstract setOverlayBounds(
		top: number,
		right: number,
		bottom: number,
		left: number,
	): void;

	events: TypedEventTarget<{
		pointermove: PointerEvent,
	}> = new TypedEventTarget();

	coordsToPoint(lat: number, lng: number): [number, number] {
		return [lng, lat];
	}

}

export interface VisibilityControl {
	visible: boolean;
	show: () => void;
	hide: () => void;
	toggle: () => void;
	events: TypedEventTarget<{
		visibilitychange: Event,
	}>;
}

/** Слой карты, используется для непосредственного нанесения маркеров и прочих данных. */
export abstract class Layer<
	TMarker extends MapMarker = MapMarker
> implements VisibilityControl {

	abstract addMarker(marker: TMarker): void;
	abstract addInteractiveMarker(marker: TMarker & InteractiveMapMarker): void;
	abstract removeMarker(marker: TMarker): void;
	abstract drawPolyline(polyline: MapPolyline): void;
	abstract clearPolyline(polyline: MapPolyline): void;

	abstract visible: boolean;
	abstract show(): void;
	abstract hide(): void;
	abstract toggle(): void;

	/**
	 * intersect - Обнаружено пересечение нескольких маркеров, см. IntersectionEvent.
	 */
	events: TypedEventTarget<{
		visibilitychange: Event,
		intersect: IntersectionEvent<TMarker>,
	}> = new TypedEventTarget();

}

export interface MapMarker {
	lat: number;
	lng: number;
	icon: Element;
	iconSize: [number, number];
	events: TypedEventTarget<{
		locationchange: Event,
	}>;
}

export interface InteractiveMapMarker extends MapMarker {
	popupContent: () => Promise<Element>;
}

export interface MapPolyline {
	points: (MapPolylinePoint | InteractiveMapPolylinePoint)[];
	color: number;
}

export interface MapPolylinePoint {
	lat: number;
	lng: number;
}

export interface InteractiveMapPolylinePoint extends MapPolylinePoint {
	popupContent: () => Promise<Element>;
}

export class PointerEvent extends Event {

	declare lat: number;
	declare lng: number;

	constructor(type: string, lat: number, lng: number) {
		super(type);
		this.lat = lat;
		this.lng = lng;
	}

}

/** Пересечение маркеров. */
export class IntersectionEvent<
	TMarker extends MapMarker = MapMarker
> extends Event {

	/** Точки входа в граф intersections. */
	declare affectedMarkers: Set<TMarker>;
	/**
	 * Ребра отражают пересечение маркеров друг с другом.
	 * Стоит иметь ввиду, что для непересекающихся маркеров отсутствуют какие-либо ребра.
	 */
	declare intersections: Graph<TMarker>;

	constructor(
		type: string,
		affectedMarkers: Set<TMarker>,
		intersections: Graph<TMarker>
	) {
		super(type);
		this.affectedMarkers = affectedMarkers;
		this.intersections = intersections;
	}

}