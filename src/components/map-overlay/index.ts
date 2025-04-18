import { throttle, debounce } from "throttle-debounce";
import { TypedEventTarget } from "typescript-event-target";
import { CruiseAPI, Cruise, Ship, Company } from "../../state/cruise";
import { DOMComponent } from "../dom";
import { VisibilityControl } from "../map";
import CruiseMap from "../cruise-map";
import '../hintbox';
import "./index.css";

export default class MapOverlay extends DOMComponent {
	declare bounds: [number, number, number, number];

	events: TypedEventTarget<{
		resize: Event;
	}> = new TypedEventTarget();

	constructor(domNode: Element, cruiseMap: CruiseMap, api: CruiseAPI) {
		super(domNode);
		for (const [className, id, layer] of [
			["map-overlay--ship", "ship-layer-checkbox", cruiseMap.shipLayer],
			["map-overlay--anchor", "stops-layer-checkbox", cruiseMap.stopsLayer],
			["map-overlay--place", "sights-layer-checkbox", cruiseMap.sightsLayer],
			["map-overlay--gateways", "gateways-layer-checkbox", cruiseMap.gatewaysLayer],
			["map-overlay--sunrise", "sunrises-layer-checkbox", cruiseMap.sunrisesLayer],
			["map-overlay--sunset", "sunsets-layer-checkbox", cruiseMap.sunsetsLayer],
		] as [string, string, VisibilityControl][]) {
			new LayerVisibilityButton(
				domNode.getElementsByClassName(className)[0],
				document.getElementById(id) as HTMLInputElement,
				layer
			);
		}
		for (const checkbox of domNode.getElementsByClassName(
			"map-overlay--layers-checkbox"
		) as HTMLCollectionOf<HTMLInputElement>) {
			const layer = checkbox.id.split("-")[0];
			new LayerVisibilityCheckbox(
				checkbox,
				(cruiseMap as any)[`${layer}Layer`] as VisibilityControl
			);
		}
		for (const button of domNode.getElementsByClassName(
			"map-overlay--toggle-btn"
		)) {
			new ToggleButton(button);
		}

		const shipSlider = new TimelineSlider(
			domNode.getElementsByClassName(
				"map-overlay--range-dates"
			)[0] as HTMLElement,
			cruiseMap
		);
		new SearchBox(
			domNode.getElementsByClassName("map-overlay--search")[0],
			cruiseMap,
			api
		);

		new DateFilter(
			document.getElementById("datepicker-input"),
			document.getElementById("time-slider"),
			document.getElementById("timeInput"),
			shipSlider,
			cruiseMap,
			api
		);

		new DatePicker( document.getElementsByClassName("datepicker-container")[0] as HTMLInputElement );

		const overlayBoundsElements = [
			"map-overlay--search-box",
			"map-overlay--overlays",
			"map-overlay--range-dates",
			"map-overlay--search-results",
		].map((className) => domNode.getElementsByClassName(className)[0]);
		const setOverlayBounds = () => {
			this.bounds = [
				overlayBoundsElements[0].getBoundingClientRect().bottom,
				window.innerWidth -
					overlayBoundsElements[1].getBoundingClientRect().left,
				window.innerHeight -
					overlayBoundsElements[2].getBoundingClientRect().top,
				overlayBoundsElements[3].getBoundingClientRect().right,
			];
			this.events.dispatchEvent(new Event("resize"));
		};
		setOverlayBounds();
		window.addEventListener("resize", setOverlayBounds);

		const mapMode = cruiseMap.mapMode;

		window.addEventListener("cruisesDataLoaded", () => {
			const menuBtn = ( domNode as HTMLElement ).querySelector( ".map-overlay--menu" ) as HTMLElement;
			const clockBtn = ( domNode as HTMLElement ).querySelector( ".map-overlay--time" ) as HTMLElement;
			const layersBtn = ( domNode as HTMLElement ).querySelector( ".map-overlay--copy" ) as HTMLElement;

			const radioButtons = ( event: Event ) => {
				const target = event.currentTarget as HTMLElement;
				setTimeout (() => {
					if (target.classList.contains( 'active' )) {
						if (target === menuBtn && window.innerWidth < 901) {
							if (clockBtn?.classList.contains( 'active' )) clockBtn.click();
							if (layersBtn) layersBtn.classList.remove( 'active' );
						}
						else if (target === clockBtn) {
							if (mapMode === 'default' && window.innerWidth < 901 && menuBtn) menuBtn.classList.remove( 'active' );
							if (layersBtn) layersBtn.classList.remove( 'active' );
						}
						else if (target === layersBtn) {
							if (mapMode === 'default' && window.innerWidth < 901 && menuBtn) menuBtn.classList.remove( 'active' );
							if (clockBtn?.classList.contains( 'active' )) clockBtn.click();
						}
					}
				}, 0);
			};

			for (const element of [ menuBtn, clockBtn, layersBtn ]) {
				element?.addEventListener( 'click', radioButtons );
			}

			( domNode as HTMLElement ).style.removeProperty( 'display' );
		}, { once: true });

		// страница круиза начало
		if (mapMode === 'cruise') {
			document.body.classList.add('cruise-page');

			window.addEventListener("cruisesDataLoaded", () => {
				const ship: Ship = api.allShips()[Symbol.iterator]().next().value;
				const cruise = ship?.cruises()[Symbol.iterator]().next().value;
				if (!ship || !cruise) return;

				cruiseMap.addShip( ship );
				const departureDate = new Date(cruise.departure);
				const arrivalDate = new Date(cruise.arrival);

				// Создаем массив дат между отправлением и прибытием
				const getDatesArray = (start: Date, end: Date): Date[] => {
					const dates: Date[] = [];
					const currentDate = new Date(start);

					while (currentDate <= end) {
						dates.push(new Date(currentDate.setHours(3, 0, 0, 0))); // 00:00 по МСК (UTC+3)
						currentDate.setDate(currentDate.getDate() + 1);
					}

					return dates;
				};

				const datesArray = getDatesArray(departureDate, arrivalDate);

				// Находим контейнер для точек
				const rangeContainer = document.querySelector('.map-overlay--range-dates');
				const pointsContainer = document.querySelector('.rs-container');

				if (rangeContainer) {
					// Очищаем существующие точки, если они есть
					const existingPoints = rangeContainer.querySelectorAll('.range--deco:not(.range--deco-left):not(.range--deco-right)');
					existingPoints.forEach(point => point.remove());

					// Вычисляем общую длительность круиза в миллисекундах
					const totalDuration = arrivalDate.getTime() - departureDate.getTime();

					// Добавляем новые точки для каждой даты
					datesArray.forEach((date, index) => {
						if (index === 0) return; // Пропускаем первую и последнюю даты

						const markerElement = document.createElement('div');
						markerElement.className = 'rs-marker';

						const pointElement = document.createElement('div');
						pointElement.className = 'range--deco range--deco-point';
						pointElement.textContent = date.toLocaleDateString('ru-RU', {
							day: '2-digit',
							month: '2-digit'
						});

						// Вычисляем позицию точки на основе временных меток
						const timeDifference = date.getTime() - departureDate.getTime();
						const progress = (timeDifference / totalDuration) * 100;
						markerElement.style.left = `${progress}%`;
						pointElement.style.left = `${progress}%`;

						pointsContainer?.appendChild(markerElement);
						pointsContainer?.appendChild(pointElement);
					});
				}
			}, { once: true });
		}
		// страница круиза конец
		// страницы стоянок и мест начало
		if (mapMode === 'stops' || mapMode === 'single-stop' || mapMode === 'places' || mapMode === 'single-place') {
			document.body.classList.add('stops-page');
			if (mapMode === 'single-stop' || mapMode === 'single-place') document.body.classList.add('one-stop-page');
			const shipButton = document.querySelector('.map-overlay--ship') as HTMLInputElement;
			if (shipButton) shipButton.click();
			if (mapMode === 'places' || mapMode === 'single-place') {
				const sightsButton = document.querySelector('.map-overlay--place') as HTMLInputElement;
				if (sightsButton) sightsButton.click();
				const stopsButton = document.querySelector('.map-overlay--anchor') as HTMLInputElement;
				if (stopsButton) stopsButton.click();
			}

			window.addEventListener("cruisesDataLoaded", () => {
				const locations = mapMode === 'stops' || mapMode === 'single-stop' ? api.allStops : api.allSights;
				cruiseMap.forceShowPlaces( locations );
			}, { once: true });
		}
		// страницы стоянок и мест конец

		// яндекс
		const yandexMap = document.querySelector('.map-overlay--overlays-box #over2') as HTMLElement;
		if (yandexMap) yandexMap.click();
	}
}

// Недоделано: чекбоксы создаются костыльно (?)
class SearchBox extends DOMComponent {
	declare private cruiseMap: CruiseMap;

	constructor(domNode: Element, cruiseMap: CruiseMap, api: CruiseAPI) {
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
			const checkboxes = Array.from( shipsElement.getElementsByTagName('input') ).filter( el => !el.style.display );
			const allChecked = checkboxes.every(checkbox => checkbox.checked);

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
		checkboxOpening();

		if (cruiseMap.mapMode === 'default') {
			let searchLock = Promise.resolve();

			const onInput = () => {
				let value = input.value;
				searchLock = searchLock.then(async () => {
					if (value !== input.value)
						return;
					await new Promise( resolve => { setTimeout( resolve, 400 ); } );   // задержка 0.4 секунды
					if (value !== input.value)
						return;

					companiesElement.textContent = '';
					shipsElement.textContent = '';
					const companiesCheckboxes = [];
					const shipsCheckboxes = [];
					if (value.length < 2) value = '';   // поиск от 2 букв
					api.setFilter({ companyName: value, shipName: value });
					for (const company of api.allCompanies()) {
						companiesCheckboxes.push(
							...this.createCompanyElements(company),
						);
					}

					const allShips = [ ...api.allShips() ];
					for (const ship of this.cruiseMap.ships) {
						if (!allShips.includes( ship )) this.cruiseMap.removeShip( ship );
					}
					for (const ship of allShips) {
						shipsCheckboxes.push( ...this.createShipElements( ship ) );
					}
					companiesElement.prepend(...companiesCheckboxes);
					shipsElement.prepend(...shipsCheckboxes);
				});
			};

			window.addEventListener('cruisesDataLoaded', onInput, { once: true });
			input.addEventListener('input', onInput);
		}

		// мобильный датапикер начало
		document.addEventListener("DOMContentLoaded", function () {
			const currentYear = new Date().getFullYear();

			const creatDaysLi = (month: number) => {
				document.querySelectorAll('.mobile-options-container-day li').forEach((item) => {
					item.remove();
				});
				const lastDate = new Date(currentYear, month, 0).getDate();
				for (let i = 1; i <= lastDate; i++) {
					const li = document.createElement('li');
					li.textContent = i.toString();
					document.querySelector('.mobile-options-container-day')?.appendChild(li);
				}
			};

			const dayButton = document.querySelector('.mobile-input-button-day') as HTMLElement;
			if (dayButton) dayButton.addEventListener('click', () => {
				dayButton.classList.toggle('active');
				const dayContainer = document.querySelector('.mobile-options-container-day') as HTMLElement;
				if (dayContainer) dayContainer.classList.toggle('active');
				const monthButton = document.querySelector('.mobile-input-button-month') as HTMLElement;
				if (monthButton) monthButton.classList.remove('active');
				const monthContainer = document.querySelector('.mobile-options-container-month') as HTMLElement;
				if (monthContainer) monthContainer.classList.remove('active');
				const monthInputElement = document.querySelector('#mobile-month-input') as HTMLInputElement;
				if (monthInputElement) creatDaysLi(+monthInputElement.value);
			});

			const monthButton = document.querySelector('.mobile-input-button-month') as HTMLElement;
			if (monthButton) monthButton.addEventListener('click', () => {
				monthButton.classList.toggle('active');
				const monthContainer = document.querySelector('.mobile-options-container-month') as HTMLElement;
				if (monthContainer) monthContainer.classList.toggle('active');
				const dayButton = document.querySelector('.mobile-input-button-day') as HTMLElement;
				if (dayButton) dayButton.classList.remove('active');
				const dayContainer = document.querySelector('.mobile-options-container-day') as HTMLElement;
				if (dayContainer) dayContainer.classList.remove('active');
			});

			// Отслеживание скролла для .mobile-options-container-month
			const checkScroll = (container: HTMLElement, param: string) => {
				container.addEventListener('scroll', function() {
					const monthInput = document.querySelector('#mobile-month-input') as HTMLInputElement;
					const dayInput = document.querySelector('#mobile-day-input') as HTMLInputElement;

					const items = this.querySelectorAll('li');
					const containerHeight = this.clientHeight;
					const scrollTop = this.scrollTop;
					const itemHeight = containerHeight / 3; // Высота одного элемента (всего 3 видимых)

					items.forEach((item: HTMLElement, index: number) => {
							const itemTop = item.offsetTop;
							const itemBottom = itemTop + item.offsetHeight;
							const isInView = itemTop <= scrollTop + 10 + itemHeight && itemBottom >= scrollTop + 10;
							if (isInView) {
									// Удаляем класс active у всех элементов
									items.forEach((el: HTMLElement) => el.classList.remove('active'));
									// Добавляем класс active текущему элементу
									item.classList.add('active');
							}
					});


					if (param === 'month') {
						if (monthInput) monthInput.value = container.querySelector('li.active')?.textContent as string;
						// creatDaysLi(+monthInput.value);
					}

					if (param === 'day') {
						if (dayInput) dayInput.value = container.querySelector('li.active')?.textContent as string;

					}

					const formattedDate = `${dayInput.value}.${monthInput.value.padStart( 2, "0" )}.${currentYear}`;
					window.dispatchEvent(new CustomEvent('datepicker-change', {
							detail: {
									date: formattedDate
							}
					}));
				});
			};

			const monthContainer = document.querySelector('.mobile-options-container-month') as HTMLElement;
			if (monthContainer) checkScroll(monthContainer, 'month');
			const dayContainer = document.querySelector('.mobile-options-container-day') as HTMLElement;
			if (dayContainer) checkScroll(dayContainer, 'day');

			window.addEventListener('timeline-change', function (event: CustomEvent) {
				const date = event.detail;
				const day = date.getDate();
				const month = date.getMonth() + 1;
				const mobileDayInput = document.querySelector('#mobile-day-input') as HTMLInputElement;
				if (mobileDayInput) mobileDayInput.value = day.toString();
				const mobileMonthInput = document.querySelector('#mobile-month-input') as HTMLInputElement;
				if (mobileMonthInput) mobileMonthInput.value = month.toString();
			});
		});

		// мобильный датапикер конец
	}

	private createCompanyElements(company: Company): Element[] {
		const {id, name, color} = company;
		const elementId = `map-overlay--search-company_${id}`;

		const [input, label] = this.createCheckboxElements(elementId);
		input.checked = true;
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

		input.addEventListener('change', async event => {
			const checked = ( event.target as HTMLInputElement ).checked as boolean;
			for (const ship of company.ships()) {
				const {id} = ship;
				const input = document.getElementById( `map-overlay--search-ship_${id}` ) as HTMLInputElement;
				if (input) {
					if (checked && input.style.display) {
						input.checked = input.defaultChecked;
						for (const el of [ input, ...input.labels ]) {
							el.style.display = null;
						}
						if (input.checked) input.dispatchEvent( new Event( 'change' ) );
					}
					else if (!checked && !input.style.display) {
						input.defaultChecked = input.checked;
						input.checked = false;
						for (const el of [ input, ...input.labels ]) {
							el.style.display = 'none';
						}
						if (input.defaultChecked) input.dispatchEvent( new Event( 'change' ) );
					}
				}
			}
		});

		return [input, label];
	}

	private createShipElements(ship: Ship): Element[] {
		const {id, name} = ship;
		const {color} = ship.company;
		const elementId = `map-overlay--search-ship_${id}`;

		const [input, label] = this.createCheckboxElements(elementId);
		input.checked = true;
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

		input.addEventListener('change', () => {
			this.handleShipCheckbox(input, ship);
		});

		input.dispatchEvent( new Event( 'change' ) );
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

	private handleShipCheckbox(checkbox: HTMLInputElement, ship: Ship) {
		if (checkbox.checked) {
			this.cruiseMap.addShip(ship);
		} else {
			this.cruiseMap.removeShip(ship);
		}
	}
}

class ToggleButton extends DOMComponent {
	constructor(domNode: Element) {
		super(domNode);
		domNode.addEventListener("click", () => {
			domNode.classList.toggle("active");
		});
	}
}

class DateFilter {
	constructor(
		dateInput: Element,
		timeSlider: Element,
		timeInput: Element,
		shipSlider: TimelineSlider,
		cruiseMap: CruiseMap,
		api: CruiseAPI
	) {
		const date = dateInput as HTMLInputElement;
		const slider = timeSlider as HTMLInputElement;
		const time = timeInput as HTMLInputElement;

		let dateValue = "";
		let timeValue = "";

		const createDate = () => {
			if (!dateValue) return;
			let finalDate;

			if (timeValue) {
				const [day, month, year] = dateValue.split(".");
				let [hours, minutes, seconds = "00"] = timeValue.split(":");

				finalDate = new Date(
					Number(year),
					Number(month) - 1,
					Number(day),
					Number(hours),
					Number(minutes),
					Number(seconds)
				);
			} else {
				const [day, month, year] = dateValue.split(".");
				finalDate = new Date(
					Number(year),
					Number(month) - 1,
					Number(day)
				);
			}

			setDateTime( finalDate );
		};

		const handleDateChange = (event: Event) => {
			const { date } = (event as CustomEvent).detail;
			const [day, month, year] = date.split(".");
			dateValue = `${day}.${month}.${year}`;
			createDate();
			window.dispatchEvent(new Event("filterchange"));
		};

		const updateDateInput = () => {
			date.value = dateValue;
		};

		const handleTimeSliderChange = () => {
			timeValue =
				String( Math.floor( Number( slider.value ) / 60 ) ).padStart( 2, "0" ) +
				":" +
				String( Number( slider.value ) % 60 ).padStart( 2, "0" ) +
				":00";
			createDate();
			window.dispatchEvent(new Event("filterchange"));
		};

		const updateTimeSlider = (timeValue: string) => {
			const [hours, minutes] = timeValue.split(":");
			const totalMinutes = parseInt(hours) * 60 + parseInt(minutes);
			const sliderValue = Math.round(totalMinutes);
			slider.value = sliderValue.toString();

			const timeTooltip = document.getElementById("time-tooltip");
			const sliderRect = slider.getBoundingClientRect();
			const thumbWidth = 16;
			const percent = sliderValue / 1439;

			const newPosition =
				percent * (sliderRect.width - thumbWidth) + thumbWidth / 2;
			timeTooltip.style.left = `${newPosition}px`;
			timeTooltip.textContent = `${hours}:${minutes}`;
		};

		const handleTimeInputChange = () => {
			timeValue = time.value;
			createDate();
			window.dispatchEvent(new Event("filterchange"));
		};

		window.addEventListener("datepicker-change", handleDateChange);
		slider.addEventListener("input", handleTimeSliderChange);
		time.addEventListener("input", handleTimeInputChange);

		// Функция для получения текущего часового пояса в минутах
		function getCurrentTimezoneOffset(): number {
			return new Date().getTimezoneOffset();
		}

		// Функция для получения timestamp по московскому времени (UTC+3)
		function getMoscowTimestamp(): number {
			const now = Date.now();
			const currentOffset = getCurrentTimezoneOffset();
			const moscowOffset = -180; // UTC+3 в минутах
			const offsetDiff = (currentOffset - moscowOffset) * 60 * 1000; // разница в миллисекундах

			return now + offsetDiff;
		}

		// Функция для создания Date объекта с московским временем
		function createMoscowDate(): Date {
			const moscowTimestamp = getMoscowTimestamp();
			return new Date(moscowTimestamp);
		}

		const updateFilter = () => {
			const now = createMoscowDate();
			setDateTime( now );

			const dateIndicator = document.querySelector(".map-overlay--time-indicator-date") as HTMLElement;
			if (dateIndicator) dateIndicator.innerText = dateValue;
			const timeIndicator = document.querySelector(".map-overlay--time-indicator-time") as HTMLElement;
			if (timeIndicator) timeIndicator.innerText = timeValue;
		};

		const setDateTime = ( datetime: Date ) => {
			const dateString =
				datetime.getDate().toString() +
				"." +
				(datetime.getMonth() + 1).toString().padStart( 2, "0" ) +
				"." +
				datetime.getFullYear().toString();
			dateValue = dateString;

			updateDateInput();

			timeValue =
				datetime.getHours().toString().padStart(2, "0") +
				":" +
				datetime.getMinutes().toString().padStart(2, "0") +
				":" +
				datetime.getSeconds().toString().padStart(2, "0");
			updateTimeSlider(timeValue);

			time.value = timeValue;
			document.getElementById("timeDisplay").innerText = timeValue;

			cruiseMap.timelinePoint = datetime;
			shipSlider.setSlider( datetime );

			window.dispatchEvent( new CustomEvent( 'timeline-change', { detail: datetime } ) );
		};

		let isclockActive = cruiseMap.mapMode === 'default';

		document.addEventListener("DOMContentLoaded", () => {
			updateFilter();
			const interval = setInterval(() => {
				if (isclockActive) {
					updateFilter();
				}
			}, 1000);

			const clockBtn = document.querySelector(".map-overlay--time") as HTMLElement;

			const pointer = document.querySelector(".rs-pointer") as HTMLElement;
			const onPointerDown = () => {
				isclockActive = false;

				const timeIndicator = document.querySelector(".map-overlay--time-indicator") as HTMLElement;
				if (timeIndicator) timeIndicator.classList.remove("active");

				window.dispatchEvent(new Event("filterchange"));
			};
			pointer.addEventListener("mousedown", onPointerDown);
			pointer.addEventListener("touchstart", onPointerDown, { passive: true });

			window.addEventListener( "timelinemove", ( event: CustomEvent ) => {
				if (!isclockActive) {
					setDateTime( event.detail );
				}
				else {
					shipSlider.setSlider( cruiseMap.timelinePoint );
				}
			} );

			if (clockBtn) {
				const resetTime = (synchronize = false) => {
					const now = createMoscowDate();

					if (synchronize) {
						updateFilter();
						isclockActive = true;
						cruiseMap.timelinePoint = now;
						shipSlider.setSlider(now);

						const timeIndicator = document.querySelector(".map-overlay--time-indicator") as HTMLElement;
						if (timeIndicator) timeIndicator.classList.add("active");
					}

					if (clockBtn.classList.contains("active")) {
						clockBtn.classList.remove("active");

						const filterBox = document.querySelector(".filter-box");
						if (filterBox) filterBox.classList.remove("active");
					} else {
						clockBtn.classList.add("active");
						isclockActive = false;

						const timeIndicator = document.querySelector(".map-overlay--time-indicator") as HTMLElement;
						if (timeIndicator) timeIndicator.classList.remove("active");

						const filterBox = document.querySelector(".filter-box");
						if (filterBox) filterBox.classList.add("active");
					}

					window.dispatchEvent(new Event("filterchange"));
				};

				clockBtn.addEventListener("click", () => {
					resetTime();
				});

				const filterBtn = document.querySelector(".timepicker-hide-button");
				filterBtn.addEventListener("click", () => {
					resetTime(true);
				});
			}
		});

		if (cruiseMap.mapMode === 'cruise') {
			window.addEventListener("cruisesDataLoaded", () => {
				const ship: Ship = api.allShips()[Symbol.iterator]().next().value;
				const cruise = ship?.cruises()[Symbol.iterator]().next().value;
				if (!ship || !cruise) return;

				const mapTime = cruiseMap.timelinePoint;
				if (+mapTime < +cruise.departure) setDateTime( cruise.departure );
				else if (+mapTime > cruise.arrival) setDateTime( cruise.arrival );
			}, { once: true });
		}

		window.addEventListener("DOMContentLoaded", () => {
			if (window.innerWidth < 901 && !document.body.classList.contains('cruise-page')) {
				const menuBtn = document.querySelector(".map-overlay--menu") as HTMLElement;
				if (menuBtn) menuBtn.classList.remove("active");
			}
		});
	}
}

class LayerVisibilityButton extends DOMComponent {
	constructor(
		domNode: Element,
		checkbox: HTMLInputElement,
		layer: VisibilityControl
	) {
		super(domNode);
		const onVisibilityChange = () => {
			if (layer.visible) domNode.classList.add("active");
			else domNode.classList.remove("active");
		};
		onVisibilityChange();
		layer.events.addEventListener("visibilitychange", onVisibilityChange);
		domNode.addEventListener("click", () => {
			checkbox.click();
		});
	}
}

class LayerVisibilityCheckbox extends DOMComponent {
	constructor(domNode: HTMLInputElement, layer: VisibilityControl) {
		super(domNode);
		const onChange = () => {
			if (domNode.checked) layer.show();
			else layer.hide();
		};
		onChange();
		domNode.addEventListener("change", onChange);
	}
}

class TimelineSlider extends DOMComponent {
	declare private cruiseMap: CruiseMap;

	private _timelineRange: [Date, Date] = [new Date(0), new Date(0)];
	/** Начальная дата первого и конечная дата последнего круиза */
	get timelineRange(): readonly [Date, Date] {
		return this._timelineRange;
	}

	constructor(domNode: HTMLElement, cruiseMap: CruiseMap) {
		super(domNode);

		this.cruiseMap = cruiseMap;

		const slider = domNode.getElementsByClassName("rs-container")[0];
		const fromElement = domNode.getElementsByClassName(
			"range--deco-left"
		)[0] as HTMLElement;
		const toElement = domNode.getElementsByClassName(
			"range--deco-right"
		)[0] as HTMLElement;
		const valueElement = slider.getElementsByClassName(
			"rs-tooltip"
		)[0] as HTMLElement;

		const onTimeRangeChanged = () => {
			const ships = cruiseMap.ships;
			const navigationStartDate = Math.min( ...ships.map( ship => +( ship.navigationStartDate ?? Infinity ) ) );
			const navigationEndDate = Math.max( ...ships.map( ship => +( ship.navigationEndDate ?? -Infinity ) ) );

			if (Number.isFinite( navigationStartDate ) && Number.isFinite( navigationEndDate )) {
				this._timelineRange = [ new Date( navigationStartDate ), new Date( navigationEndDate ) ];
				window.dispatchEvent( new CustomEvent(
					'timelinemove',
					{ detail: new Date( Math.min( Math.max( +cruiseMap.timelinePoint, navigationStartDate ), navigationEndDate ) ) }
				) );

				for (const [value, element] of [
					[this._timelineRange[0], fromElement],
					[this._timelineRange[1], toElement],
				] as [Date, HTMLElement][])
					element.innerText = TimelineSlider.formatDate(value, true);
				domNode.classList.remove("map-overlay--range-dates-hidden");
			}
			else {
				this._timelineRange = [new Date(0), new Date(0)];
				domNode.classList.add("map-overlay--range-dates-hidden");
			}
		};
		onTimeRangeChanged();
		cruiseMap.events.addEventListener("timerangechanged", onTimeRangeChanged);

		let sliderPressed = false;
		slider.addEventListener("pointerdown", () => {
			sliderPressed = true;
		});
		document.addEventListener("pointerup", () => {
			sliderPressed = false;
		});
		const moveTimeline = throttle(100, (point) => {
			const [from, to] = this._timelineRange;
			window.dispatchEvent( new CustomEvent( 'timelinemove', { detail: new Date( +from + point * ( +to - +from ) ) } ) );
		});

		document.addEventListener("pointermove", (event: PointerEvent) =>
			window.requestAnimationFrame(() => {
				const clientX = event.clientX;
				const target = event.target as HTMLElement;
				if (!target.closest(".rs-container")) return;
				if (sliderPressed) {
					const { x, width } = slider.getBoundingClientRect();
					const point = Math.min(Math.max((clientX - x) / width, 0), 1);
					domNode.style.setProperty(
						"--map-overlay--range-dates_point",
						`${point}`
					);
					moveTimeline(point);
				}
			})
		);

		document.addEventListener("touchmove", (event: TouchEvent) => {
			const target = event.target as HTMLElement;
			if (!target.closest(".rs-container")) return;
			const clientX = event.touches[0].clientX;
			if (sliderPressed) {
				const { x, width } = slider.getBoundingClientRect();
				const point = Math.min(Math.max((clientX - x) / width, 0), 1);
				domNode.style.setProperty(
					"--map-overlay--range-dates_point",
					`${point}`
				);
				moveTimeline(point);
			}
		});
	}

	public setSlider(value: Date) {
		const [from, to] = this._timelineRange;
		const timeRange = +to - +from;
		const timePoint = +value - +from;
		let point = timePoint / timeRange;
		if (point < 0) {
			point = 0;
		} else if (point > 1) {
			point = 1;
		}
		const element = this.domNode as HTMLElement;
		element.style.setProperty("--map-overlay--range-dates_point", `${point}`);
		const slider = element.getElementsByClassName("rs-container")[0];
		const valueElement = slider.getElementsByClassName(
			"rs-tooltip"
		)[0] as HTMLElement;
		valueElement.innerText = TimelineSlider.formatDate(value);
	}

	private static formatDate(value: Date, isYear: boolean = false): string {
		return value.toLocaleDateString(undefined, {
			day: "2-digit",
			month: "2-digit",
			year: isYear ? "2-digit" : undefined,
		});
	}
}

class DatePicker extends DOMComponent {
	declare input: HTMLInputElement;
	declare calendar: HTMLDivElement;
	declare calendarBody: HTMLDivElement;
	declare calendarTitle: HTMLSpanElement;
	declare confirm: HTMLButtonElement;
	declare prevMonthBtn: HTMLButtonElement;
	declare nextMonthBtn: HTMLButtonElement;
	declare selectedDate: Date;

	constructor( domNode: HTMLDivElement ) {
		super( domNode );
		this.input = document.getElementById("datepicker-input") as HTMLInputElement;
		this.calendar = document.getElementById("datepicker-calendar") as HTMLDivElement;
		this.calendarBody = document.getElementById("calendar-body") as HTMLDivElement;
		this.calendarTitle = document.getElementById("calendar-title") as HTMLSpanElement;
		this.confirm = document.getElementById("confirm") as HTMLButtonElement;
		this.prevMonthBtn = document.getElementById("prev-month") as HTMLButtonElement;
		this.nextMonthBtn = document.getElementById("next-month") as HTMLButtonElement;
		this.selectedDate = new Date();

		const calendarSvgWrapper = domNode.querySelector('.calendar-svg-wrapper');
		const toggleCalendar = (event: Event) => {
			if (!this.calendar.classList.contains('hidden')) {
				this.calendar.classList.add('hidden');
			} else {
				const [ d, m, y ] = this.input.value.split( '.' ).map( Number );
				if (d && m && y) this.selectedDate = new Date( y, m - 1, d );
				this.updateCalendar();
				this.calendar.classList.remove('hidden');
			}
		}

		if (calendarSvgWrapper) {
			calendarSvgWrapper.addEventListener("click", toggleCalendar);
		}

		if (this.input) {
			this.input.addEventListener("click", toggleCalendar);
		}

		if (this.confirm) {
			this.confirm.addEventListener("click", (event) => {
				if (!this.calendar.classList.contains('hidden')) {
					this.calendar.classList.add('hidden');
				}
			});
		}

		document.addEventListener("click", (event) => {
			if (!( event.target as HTMLElement ).closest('.datepicker-label')
			&& !( event.target as HTMLElement ).closest('#datepicker-calendar')) {
				if (!this.calendar.classList.contains('hidden')) {
					this.calendar.classList.add('hidden');
				}
			}
		});

		this.prevMonthBtn.addEventListener("click", () => {
			this.selectedDate.setMonth(this.selectedDate.getMonth() - 1);
			this.updateCalendar();
		});

		this.nextMonthBtn.addEventListener("click", () => {
			this.selectedDate.setMonth(this.selectedDate.getMonth() + 1);
			this.updateCalendar();
		});

		this.updateCalendar();

		//time range
		const timeSlider = document.getElementById("time-slider");
		const timeTooltip = document.getElementById("time-tooltip");

		const formatTime = (minutes: number) => {
			let hours = Math.floor(minutes / 60);
			let mins = minutes % 60;
			return `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}`;
		}

		//hours
		const timeInput = document.getElementById("timeInput") as HTMLInputElement;
		const timeDisplay = document.getElementById("timeDisplay");

		const formatTimer = (timeStr: string) => {
			return timeStr ? timeStr : "00:00:00";
		}

		timeInput.addEventListener("input", () => {
			timeDisplay.textContent = formatTimer(timeInput.value);
		});

		timeDisplay.addEventListener("click", () => {
			timeInput.showPicker(); //
		});
	}

	updateCalendar() {
		this.calendarBody.innerHTML = "";
		const year = this.selectedDate.getFullYear();
		const month = this.selectedDate.getMonth();
		const [ d, m, y ] = this.input.value.split('.').map(Number);

		const firstDay = new Date(year, month, 1).getDay() || 7;
		const lastDate = new Date(year, month + 1, 0).getDate();

		this.calendarTitle.textContent = `${this.selectedDate.toLocaleString("ru-RU", { month: "long" })}`;

		for (let i = 1; i < firstDay; i++) {
			const emptyDiv = document.createElement("div");
			this.calendarBody.appendChild(emptyDiv);
		}

		for (let day = 1; day <= lastDate; day++) {
			const dayElement = document.createElement("div");
			dayElement.textContent = String(day);
			dayElement.classList.add("day");
			if (day === d && month + 1 === m && year === y) dayElement.classList.add("selected");

			dayElement.addEventListener("click", () => {
				this.selectedDate.setDate(day);
				// seleced date value
				this.input.value = `${day}.${String( month + 1 ).padStart( 2, '0' )}.${year}`;
				window.dispatchEvent(new CustomEvent('datepicker-change', {
					detail: {
						date: this.input.value
					}
				}));
				dayElement.classList.add("selected");

				const days = this.domNode.querySelectorAll(".day");
				days.forEach((day: Element) => {
					if (day !== dayElement) {
						day.classList.remove("selected");
					}
				});
			});

			this.calendarBody.appendChild(dayElement);
		}
	}
}
