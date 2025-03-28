import {TypedEventTarget} from 'typescript-event-target';

/** Добавляет возможность получать информацию о текущих слушателях событий */
export class AuditableEventTarget<
	M extends ValueIsEvent<M>
> extends TypedEventTarget<M> {

	private listeners = {} as Record<keyof M, Set<unknown>>;

	listenersCount(type: keyof M): number {
		return type in this.listeners ? this.listeners[type].size : 0;
	}

	// @ts-ignore
	addEventListener(
		...args: Parameters<TypedEventTarget<M>['addEventListener']>
	): void {
		super.addEventListener(...args);
		const [type, listener] = args;
		if (!(type in this.listeners))
			this.listeners[type] = new Set();
		this.listeners[type].add(listener);
	}

	// @ts-ignore
	removeEventListener(
		...args: Parameters<TypedEventTarget<M>['addEventListener']>
	): void {
		super.removeEventListener(...args);
		const [type, listener] = args;
		if (type in this.listeners)
			this.listeners[type].delete(listener);
	}

}

type ValueIsEvent<T> = {
	[key in keyof T]: Event;
};