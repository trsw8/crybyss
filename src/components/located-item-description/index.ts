import {DOMComponent} from '../dom';
import LocationInfo from '../location-info';
import './index.css';

export default class LocatedItemDescription extends DOMComponent {

	static create(
		content: LocatedItemDescriptionChild[],
		classNames: string[] = [],
		styles: Record<string, string>,
	): LocatedItemDescription {
		const div = document.createElement('div');
		div.classList.add('located-item-description', ...classNames);
		for (const style in styles)
			div.style.setProperty(style, styles[style]);
		for (const child of content)
			div.appendChild(child.domNode);
		return new LocatedItemDescription(div);
	}

}

abstract class LocatedItemDescriptionChild<
	TElement extends Element = Element
> extends DOMComponent<TElement> {}

export class LocatedItemDescriptionGroup extends LocatedItemDescriptionChild {

	static create(
		content: LocatedItemDescriptionChild[],
		gap: LocatedItemDescriptionGap = LocatedItemDescriptionGap.SMALL,
	): LocatedItemDescriptionGroup {
		const section = document.createElement('section');
		section.classList.add(
			'located-item-description__group',
			'located-item-description__group_gap_' + {
				[LocatedItemDescriptionGap.SMALL]: 'small',
				[LocatedItemDescriptionGap.MEDIUM]: 'medium',
				[LocatedItemDescriptionGap.LARGE]: 'large',
			}[gap],
		);
		for (const child of content)
			section.appendChild(child.domNode);
		return new LocatedItemDescriptionGroup(section);
	}

}

export class LocatedItemDescriptionRow extends LocatedItemDescriptionChild {

	static create(
		content: LocatedItemDescriptionChild[],
		gap: LocatedItemDescriptionGap = LocatedItemDescriptionGap.SMALL,
		alignment: string = 'center'
	): LocatedItemDescriptionGroup {
		const section = document.createElement('section');
		section.classList.add(
			'located-item-description__row',
			'located-item-description__row_gap_' + {
				[LocatedItemDescriptionGap.SMALL]: 'small',
				[LocatedItemDescriptionGap.MEDIUM]: 'medium',
				[LocatedItemDescriptionGap.LARGE]: 'large',
			}[gap],
			`located-item-description__row_align_${alignment}`
		);
		for (const child of content)
			section.appendChild(child.domNode);
		return new LocatedItemDescriptionRow(section);
	}

}

export class LocatedItemDescriptionText extends LocatedItemDescriptionChild {

	static create(text: string, classNames: string[] = [], {
		title = false,
	}: {
		title?: boolean,
	} = {}): LocatedItemDescriptionText {
		const p = document.createElement('p');
		p.classList.add(
			'located-item-description__text',
			...(title ? ['located-item-description__text_title'] : []),
			...classNames
		);
		p.append(text);
		return new LocatedItemDescriptionText(p);
	}

}

export class LocatedItemDescriptionRange extends LocatedItemDescriptionChild {

	static create(from: string, to: string, className: string = 'located-item-description__range'): LocatedItemDescriptionRange {
		const p = document.createElement('p');
		p.classList.add(className);
		for (const value of [from, to]) {
			const span = document.createElement('span');
			span.classList.add('located-item-description__range-value');
			span.append(value);
			p.appendChild(span);
		}
		return new LocatedItemDescriptionRange(p);
	}

}

export class LocatedItemDescriptionButton extends LocatedItemDescriptionChild {

	static create(
		text: string,
		action: () => void,
	): LocatedItemDescriptionButton {
		const button = document.createElement('button');
		button.classList.add('located-item-description__button');
		button.append(text);
		button.addEventListener('click', action);
		return new LocatedItemDescriptionButton(button);
	}

}

export class LocatedItemDescriptionImage extends LocatedItemDescriptionChild<
	HTMLImageElement
> {

	static create(src: string): LocatedItemDescriptionImage {
		const img = document.createElement('img');
		img.classList.add('located-item-description__image');
		img.src = src;
		return new LocatedItemDescriptionImage(img);
	}

	load(): Promise<void> {
		let resolve = () => {};
		const promise = new Promise<void>(r => {resolve = r;});
		if (this.domNode.complete)
			resolve();
		else {
			this.domNode.addEventListener('load', resolve);
			this.domNode.addEventListener('error', resolve);
		}
		return promise;
	}

}

export class LocatedItemDescriptionIcon extends LocatedItemDescriptionChild {

	static create(svg: SVGElement): LocatedItemDescriptionIcon {
		svg.classList.add('located-item-description__icon');
		return new LocatedItemDescriptionIcon(svg);
	}

}

export class LocatedItemDescriptionLocation
	extends LocatedItemDescriptionChild {

	static create(lat: number, lng: number): LocatedItemDescriptionLocation {
		const locationInfo = LocationInfo.create(lat, lng, [
			'located-item-description__location'
		]);
		return new LocatedItemDescriptionLocation(locationInfo.domNode);
	}

}

export enum LocatedItemDescriptionGap {
	SMALL,
	MEDIUM,
	LARGE,
}
