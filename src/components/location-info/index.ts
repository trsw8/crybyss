import copyIcon from '../../icons/copy.svg';
import {svgAsset} from '../../util';
import {DOMComponent} from '../dom';
import './index.css';

export default class LocationInfo extends DOMComponent {

	static create(
		lat: number,
		lng: number,
		classNames: string[] = []
	): LocationInfo {
		const div = document.createElement('div');
		div.classList.add('location-info', ...classNames);
		div.addEventListener('click', () => {
			navigator.clipboard?.writeText(`${lat},${lng}`);
		});

		for (const value of [lat, lng]) {
			const span = document.createElement('span');
			span.classList.add('location-info__coord');
			span.append(value.toString());
			div.appendChild(span);
		}

		const copyButton = svgAsset(copyIcon);
		copyButton.classList.add('location-info__copy-button');
		div.appendChild(copyButton);

		return new LocationInfo(div);
	}

}
