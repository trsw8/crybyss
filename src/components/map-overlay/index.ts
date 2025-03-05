import {throttle} from 'throttle-debounce';
import {TypedEventTarget} from 'typescript-event-target';
import CruiseEntry, {Cruise, Ship, Company} from '../../state/cruise';
import {DOMComponent} from '../dom';
import {VisibilityControl} from '../map';
import CruiseMap from '../cruise-map';
import './index.css';

export default class MapOverlay extends DOMComponent {

	declare bounds: [number, number, number, number];

	events: TypedEventTarget<{
		resize: Event
	}> = new TypedEventTarget();

	constructor(
		domNode: Element,
		cruiseMap: CruiseMap,
		entry: CruiseEntry,
	) {
		super(domNode);
		for (const [className, layer] of [
			['map-overlay--ship', cruiseMap.shipLayer],
			['map-overlay--anchor', cruiseMap.stopLayer],
			['map-overlay--place', cruiseMap.showplaceLayer],
		] as [string, CruiseMap['shipLayer']][])
			new LayerVisibilityButton(
				domNode.getElementsByClassName(className)[0],
				layer,
			);
		new TimelineSlider(
			domNode.getElementsByClassName(
				'map-overlay--range-dates'
			)[0] as HTMLElement,
			cruiseMap,
		);
		new SearchBox(
			domNode.getElementsByClassName('map-overlay--search')[0],
			cruiseMap, entry,
		);

		const overlayBoundsElements = [
			'map-overlay--search-box',
			'map-overlay--overlays',
			'map-overlay--range-dates',
			'map-overlay--search-results',
		].map(className => domNode.getElementsByClassName(className)[0]);
		const setOverlayBounds = () => {
			this.bounds = [
				overlayBoundsElements[0].getBoundingClientRect().bottom,
				window.innerWidth - overlayBoundsElements[1]
					.getBoundingClientRect().left,
				window.innerHeight - overlayBoundsElements[2]
					.getBoundingClientRect().top,
				overlayBoundsElements[3].getBoundingClientRect().right,
			];
			this.events.dispatchEvent(new Event('resize'));
		};
		setOverlayBounds();
		window.addEventListener('resize', setOverlayBounds);
	}

}

// Недоделано: отсутствует реакция на события CruiseMap, чекбоксы создаются костыльно,
// нет синхронизации между чекбоксами компаний и чекбоксами кораблей,
// не реализованы фолды и "выбрать все".
class SearchBox extends DOMComponent {

	declare private cruiseMap: CruiseMap;

	private selectedCruises: Map<unknown, number> = new Map();

	constructor(domNode: Element, cruiseMap: CruiseMap, entry: CruiseEntry) {
		super(domNode);
		this.cruiseMap = cruiseMap;

		const input = domNode.getElementsByClassName(
			'map-overlay--search-box'
		)[0].querySelector('input') as HTMLInputElement;
		const resultsElement = domNode
			.getElementsByClassName('map-overlay--search-results')[0];
		const shipsElement = resultsElement
			.getElementsByClassName('map-overlay--search-ships')[0]
			.getElementsByClassName('map-overlay--search-checks')[0];
		const companiesElement = resultsElement
			.getElementsByClassName('map-overlay--search-companies')[0]
			.getElementsByClassName('map-overlay--search-checks')[0];
		const checkAllCompanies = document.getElementById('companyAllSelect') as HTMLInputElement;
		const checkAllShips = document.getElementById('shipsAllSelect') as HTMLInputElement;

		const onSelectAll = () => {
			const checkboxes = shipsElement.getElementsByTagName('input');
			const allChecked = Array.from(checkboxes).every(checkbox => checkbox.checked);

			for (const checkbox of checkboxes) {
					checkbox.checked = !allChecked;
					checkbox.dispatchEvent(new Event('change'));
			}
		}
		checkAllShips.addEventListener('click', onSelectAll);

		const onSelectAllCompanies = () => {
			const checkboxes = companiesElement.getElementsByTagName('input');
			const allChecked = Array.from(checkboxes).every(checkbox => checkbox.checked);

			for (const checkbox of checkboxes) {
					checkbox.checked = !allChecked;
					checkbox.dispatchEvent(new Event('change'));
			}
		}
		checkAllCompanies.addEventListener('click', onSelectAllCompanies);

		const openBtns = document.querySelectorAll('.map-overlay--search-title')
		const closeCheckboxList = document.querySelectorAll('.map-overlay--search-block ')

		const checkboxOpening = ()=>{
				openBtns.forEach((openBtn , index) =>{
					openBtn.addEventListener('click',()=>{
						if(!closeCheckboxList[index].classList.contains('active')){
							closeCheckboxList[index].classList.add('active')
							
						}else{
							
							closeCheckboxList[index].classList.remove('active')
						}
					})
				})
			}
		checkboxOpening()
		
		let searchLock = Promise.resolve();
		const onInput = () => {
			const value = input.value;
			searchLock = searchLock.then(async () => {
				if (value !== input.value)
					return;
				const companiesCheckboxes = [];
				const shipsCheckboxes = [];
				if (value)
					for await (const [type, entity] of entry.search(value)) {
						if (type === 'company')
							companiesCheckboxes.push(
								...this.createCompanyElements(entity),
							);
						if (type === 'ship')
							shipsCheckboxes.push(...this.createShipElements(entity));
					}
				else {
					for await (const company of entry.allCompanies())
						companiesCheckboxes.push(
							...this.createCompanyElements(company),
						);
					for await (const ship of entry.allShips())
						shipsCheckboxes.push(...this.createShipElements(ship));
				}
				for (const checkbox of [
					...companiesElement.getElementsByTagName('input'),
					...shipsElement.getElementsByTagName('input'),
				] as HTMLInputElement[])
					if (!checkbox.checked)
						for (const element of [checkbox, ...checkbox.labels])
							element.remove();
				companiesElement.prepend(...companiesCheckboxes);
				shipsElement.prepend(...shipsCheckboxes);
			});
		};
		onInput();
		input.addEventListener('input', onInput);
	}

	private createCompanyElements(company: Company): Element[] {
		const {id, name, color} = company;
		const elementId = `map-overlay--search-company_${id}`;
		const existingInput =
			document.getElementById(elementId) as HTMLInputElement;
		if (existingInput)
			return [existingInput, existingInput.labels[0]];

		const [input, label] = this.createCheckboxElements(elementId);
		label.style.setProperty(
			'--map-overlay--search-check_color',
			`#${color.toString(16)}`
		);

		const colorElement = document.createElement('span');
		colorElement.classList.add('color');
		label.appendChild(colorElement);

		const nameElement = document.createElement('span');
		nameElement.classList.add('name');
		nameElement.innerText = name;
		label.appendChild(nameElement);

		input.addEventListener('change', async () => {
			for await (const ship of company.ships())
				for await (const cruise of ship.cruises())
					this.handleCruiseCheckbox(input, cruise);
		});

		return [input, label];
	}

	private createShipElements(ship: Ship): Element[] {
		const {id, name} = ship;
		const elementId = `map-overlay--search-ship_${id}`;
		const existingInput =
			document.getElementById(elementId) as HTMLInputElement;
		if (existingInput)
			return [existingInput, existingInput.labels[0]];

		const [input, label] = this.createCheckboxElements(elementId);

		const nameElement = document.createElement('span');
		nameElement.classList.add('name');
		nameElement.innerText = name;
		label.appendChild(nameElement);

		input.addEventListener('change', async () => {
			for await (const cruise of ship.cruises())
				this.handleCruiseCheckbox(input, cruise);
		});

		return [input, label];
	}

	private createCheckboxElements(id: string): [
		HTMLInputElement, HTMLLabelElement
	] {
		const input = document.createElement('input');
		input.classList.add('custom-checkbox');
		input.id = id;
		input.type = 'checkbox';

		const label = document.createElement('label');
		label.classList.add('map-overlay--search-check');
		label.htmlFor = id;

		return [input, label];
	}

	private handleCruiseCheckbox(checkbox: HTMLInputElement, cruise: Cruise) {
		const {id} = cruise;
		const selectedTimes = this.selectedCruises.get(id) ?? 0;
		if (checkbox.checked) {
			if (selectedTimes === 0)
				this.cruiseMap.addCruise(cruise);
			this.selectedCruises.set(id, selectedTimes + 1);
		} else {
			if (selectedTimes <= 1) {
				this.cruiseMap.removeCruise(cruise);
				this.selectedCruises.delete(id);
			}
			this.selectedCruises.set(id, selectedTimes - 1);
		}
	}

}

class LayerVisibilityButton extends DOMComponent {

	constructor(domNode: Element, layer: VisibilityControl) {
		super(domNode);
		const onVisibilityChange = () => {
			if (layer.visible)
				domNode.classList.add('active');
			else
				domNode.classList.remove('active');
		};
		onVisibilityChange();
		layer.events.addEventListener('visibilitychange', onVisibilityChange);
		domNode.addEventListener('click', () => {
			layer.toggle();
		});
	}

}

class TimelineSlider extends DOMComponent {

	constructor(domNode: HTMLElement, cruiseMap: CruiseMap) {
		super(domNode);
		const slider = domNode.getElementsByClassName('rs-container')[0];
		const fromElement = domNode
			.getElementsByClassName('range--deco-left')[0] as HTMLElement;
		const toElement = domNode
			.getElementsByClassName('range--deco-right')[0] as HTMLElement;
		const valueElement = slider
			.getElementsByClassName('rs-tooltip')[0] as HTMLElement;

		const onCruiseEdit = () => {
			if (cruiseMap.cruises.length > 0) {
				for (const [value, element] of [
					[cruiseMap.timelineRange[0], fromElement],
					[cruiseMap.timelineRange[1], toElement],
				] as [Date, HTMLElement][])
					element.innerText = TimelineSlider.formatDate(value);
				domNode.classList.remove('map-overlay--range-dates-hidden');
			} else
				domNode.classList.add('map-overlay--range-dates-hidden');
		};
		onCruiseEdit();
		cruiseMap.events.addEventListener('cruiseedit', onCruiseEdit);
		const onTimelineMove = () => {
			const [from, to] = cruiseMap.timelineRange;
			if (+from !== 0 || +to !== 0)
				domNode.style.setProperty(
					'--map-overlay--range-dates_point',
					`${(+cruiseMap.timelinePoint - +from) / (+to - +from)}`,
				);
			valueElement.innerText =
				TimelineSlider.formatDate(cruiseMap.timelinePoint);
		};
		onTimelineMove();
		cruiseMap.events.addEventListener('timelinemove', onTimelineMove);

		let sliderPressed = false;
		slider.addEventListener('pointerdown', () => {
			sliderPressed = true;
		});
		document.addEventListener('pointerup', () => {
			sliderPressed = false;
		});
		const moveTimeline = throttle(100, point => {
			const [from, to] = cruiseMap.timelineRange;
			cruiseMap.timelinePoint = new Date(+from + point * (+to - +from));
		});
		document.addEventListener('pointermove', ({
			clientX
		}) => window.requestAnimationFrame(() => {
			if (sliderPressed) {
				const {x, width} = slider.getBoundingClientRect();
				const point = Math.min(Math.max((clientX - x) / width, 0), 1);
				domNode.style.setProperty(
					'--map-overlay--range-dates_point',
					`${point}`
				);
				moveTimeline(point);
			}
		}));
	}

	private static formatDate(value: Date): string {
		return value.toLocaleDateString(undefined, {
			day: '2-digit',
			month: '2-digit',
			year: 'numeric',
		});
	}

}
