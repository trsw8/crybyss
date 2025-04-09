import {TypedEventTarget} from 'typescript-event-target';
import {
  map,
  Map as LMap,
  canvas,
  Renderer,
  TileLayer,
  Layer as LLayer,
  marker,
  Marker,
  DivIcon,
  polyline,
  circleMarker,
  point,
  Point,
  PointExpression,
  LatLngExpression,
} from "leaflet";
import "leaflet/dist/leaflet.css";
import {AuditableEventTarget} from "../../util/events";
import IntersectionSearchTree, {
  Marker as IntersectionMarker,
} from "../../util/intersection";
import Map, {
  Layer,
  MapMarker,
  InteractiveMapMarker,
  MapPolyline,
  InteractiveMapPolyline,
  PointerEvent,
  IntersectionEvent,
} from ".";
import "./index.css";
import "./leaflet.css";
import * as L from "leaflet";
import "./yandex.js";

export default abstract class LeafletMap extends Map {
  // protected abstract tileLayer(): TileLayer;

  private static readonly TILE_LAYER_URL =
    "https://tile.openstreetmap.org/{z}/{x}/{y}.png";

  protected tileLayer(): TileLayer {
    return new TileLayer(LeafletMap.TILE_LAYER_URL);
  }

  private declare map: LMap;
  private declare renderer: Renderer;
  private layersCount = 0;
  private autoPan: [Point, Point] = [point(0, 0), point(0, 0)];

  declare mainLayer: Layer;

  constructor(node: HTMLElement, center: LatLngExpression, zoom: number) {
    super(node);
    this.map = map(node, {
      center,
      zoom,
      attributionControl: false,
      zoomControl: false,
      renderer: canvas(),
    });
    this.mainLayer = new LeafletPane(this.map, this.autoPan);

    this.tileLayer().addTo(this.map);

    this.map.on("move", () => {
      const { lat, lng } = this.map.getCenter();
      this.events.dispatchEvent(new PointerEvent("pointermove", lat, lng));
    });
    this.map.on("mousemove", ({ latlng: { lat, lng } }) => {
      this.events.dispatchEvent(new PointerEvent("pointermove", lat, lng));
    });

    // линейка начало

    const measurePoints: L.CircleMarker<any>[] = [];
    let isLine: boolean = false;

    const removeMeasure = () => {
      measurePoints.forEach((point) => point.remove());
      measurePoints.length = 0;
      this.map.eachLayer((layer) => {
        if (layer instanceof L.Polyline && !(layer instanceof L.Circle)) {
          layer.remove();
        }
      });
    };

    const measureOpenButton = document.querySelector(".map-overlay--line");

    const toggleMeasure = () => {
      measureOpenButton.classList.toggle("active");
      setTimeout(() => {
        const measureButton = document.querySelector(".map-overlay--line");
        if (!measureButton.classList.contains("active")) {
          removeMeasure();
          this.map.getContainer().style.cursor = "grab";
          this.map.on("dragstart", () => {
            this.map.getContainer().style.cursor = "grabbing";
          });
          this.map.on("dragend", () => {
            this.map.getContainer().style.cursor = "grab";
          });
        } else {
          this.map.getContainer().style.cursor = "crosshair";
        }
      }, 100);
    };

    measureOpenButton?.addEventListener("click", () => {
      setTimeout(toggleMeasure, 100);
    });

    this.map.on("mousedown", () => {
      if (isLine) {
        removeMeasure();
        isLine = false;
      }
    });

    this.map.on("click", (event) => {
      if (!measureOpenButton.classList.contains("active")) return;

      var lat = event.latlng.lat;
      var lng = event.latlng.lng;

      const circle = L.circleMarker([lat, lng], {
        radius: 5,
        color: "red",
        fillColor: "red",
        fillOpacity: 1
      }).addTo(this.map);
      measurePoints.push(circle);

      if (measurePoints.length > 1) {
        const lastPoint = measurePoints[measurePoints.length - 2];
        const line = L.polyline([lastPoint.getLatLng(), circle.getLatLng()], {
          color: "red",
        }).addTo(this.map);
        isLine = true;

        const distance = lastPoint.getLatLng().distanceTo(circle.getLatLng());
        const popupContent = `${(distance / 1000).toFixed(2)} км`;
        line
          .bindPopup(popupContent, {
            className: "measure__popup",
          })
          .openPopup();
      }
    });

    // линейка конец
    // курсор начало
    const coordsDiv = L.DomUtil.create("div", "leaflet-control-coords");
    coordsDiv.insertAdjacentHTML(
      "afterbegin",
      `
			<div class="leaflet-control-coords__lat"></div>
			<div class="leaflet-control-coords__lng"></div>
			<div class="leaflet-control-coords__total"></div>
		`
    );
    this.map.getContainer().appendChild(coordsDiv);

    function convertToDMS(coordinate: number, digits: number): string {
      const absolute = Math.abs(coordinate);
      const degrees = Math.floor(absolute);
      const minutesFloat = (absolute - degrees) * 60;
      const minutes = Math.floor(minutesFloat);
      const seconds = ((minutesFloat - minutes) * 60).toFixed(2);
      const secondsFull = seconds.split(".")[0];
      const secondsDecimal = seconds.split(".")[1];

      return `${degrees.toString().padStart(digits, "0")}° ${minutes
        .toString()
        .padStart(2, "0")}' ${secondsFull.padStart(2, "0")}.${secondsDecimal}`;
    }

    const checkCoords = (lat: number, lng: number) => {
      const lngFull = lng.toFixed(4).toString().split(".")[0];
      const lngDecimal = lng.toFixed(4).toString().split(".")[1];
      const coordsLat = document.querySelector(".leaflet-control-coords__lat");
      const coordsLng = document.querySelector(".leaflet-control-coords__lng");
      const coordsTotal = document.querySelector(
        ".leaflet-control-coords__total"
      );
      if (coordsLat && coordsLng && coordsTotal) {
        coordsLat.textContent = `N${convertToDMS(lat, 2)}`;
        coordsLng.textContent = `E${convertToDMS(lng, 3)}`;
        coordsTotal.textContent = `(${lat.toFixed(4)}, ${lngFull.padStart(
          3,
          "0"
        )}.${lngDecimal})`;
      }
    };

    this.map.on("mousemove", (event) => {
      const lat = event.latlng.lat;
      const lng = event.latlng.lng;
      checkCoords(lat, lng);
    });

    const mapCenter = this.map.getCenter();
    checkCoords(mapCenter.lat, mapCenter.lng);
    // курсор конец
    // отрезок начало
    const mileDiv = L.DomUtil.create("div", "leaflet-mile");
    mileDiv.insertAdjacentHTML(
      "afterbegin",
      `
			<div class="leaflet-mile__block leaflet-mile__block_type_km">
				<div class="leaflet-mile__block-marker"></div>
				<div class="leaflet-mile__block-line"></div>
				<div class="leaflet-mile__block-text leaflet-mile__block-text_type_km"></div>
				<div class="leaflet-mile__block-line"></div>
				<div class="leaflet-mile__block-marker"></div>
			</div>
			<div class="leaflet-mile__block leaflet-mile__block_type_mile">
				<div class="leaflet-mile__block-marker"></div>
				<div class="leaflet-mile__block-line"></div>
				<div class="leaflet-mile__block-text leaflet-mile__block-text_type_mile"></div>
				<div class="leaflet-mile__block-line"></div>
				<div class="leaflet-mile__block-marker"></div>
			</div>
		`
    );

    const updateMileWidth = () => {
      const zoom = this.map.getZoom();
      const center = this.map.getCenter();
      const point1 = this.map.project(center);

      const kmWidth = 60;
      let distance = 1000;

      // Находим точку на расстоянии distance метров от центра
      const point2 = this.map.project([
        center.lat,
        center.lng +
          distance / (111320 * Math.cos((center.lat * Math.PI) / 180)),
      ]);

      // Вычисляем ширину в пикселях
      const width = Math.abs(point2.x - point1.x);

      const precent = (width / kmWidth) * 100;
      const kmValue = (distance * 100) / precent / 1000;
      let kmValueText = kmValue;
      if (kmValue > 1) {
        kmValueText = Math.round(kmValue);
      } else {
        kmValueText = Math.round(kmValue * 100) / 100;
      }

      const kmBlock = mileDiv.querySelector(".leaflet-mile__block_type_km");
      const mileBlock = mileDiv.querySelector(".leaflet-mile__block_type_mile");
      const kmTextBlock = kmBlock?.querySelector(
        ".leaflet-mile__block-text_type_km"
      );
      const mileTextBlock = mileBlock?.querySelector(
        ".leaflet-mile__block-text_type_mile"
      );

      if (kmBlock && mileBlock && kmTextBlock && mileTextBlock) {
        kmTextBlock.textContent = `${kmValueText} km`;
        mileTextBlock.textContent = `${kmValueText} ml`;
        (kmBlock as HTMLElement).style.width = `${(width * 100) / precent}px`;
        (mileBlock as HTMLElement).style.width = `${
          ((width * 100) / precent) * 1.609
        }px`;
      }
    };

    this.map.on("zoomend", updateMileWidth);
    updateMileWidth();
    this.map.getContainer().appendChild(mileDiv);
    // отрезок конец
    // подложка начало
    const OSM_TILE_LAYER_URL = "https://tile.openstreetmap.org/{z}/{x}/{y}.png";
    ("https://core-sat.maps.yandex.net/tiles?l=sat&x={x}&y={y}&z={z}");

    const changeTileLayer = (url: string) => {
      this.map.eachLayer((layer) => {
        if (layer instanceof L.TileLayer || layer instanceof L.Yandex) {
          layer.remove();
        }
      });
      new L.TileLayer(url).addTo(this.map);
    };

    const changeYandexLayer = (type: string) => {
      this.map.eachLayer((layer) => {
        if (layer instanceof L.TileLayer || layer instanceof L.Yandex) {
          layer.remove();
        }
      });
      // @ts-ignore
      const yandexLayer = new L.Yandex(type, {
        apiParams: {
          apikey: "<your API-key>",
        },
      });
      this.map.addLayer(yandexLayer);
    };

    const radioInputs = document.querySelectorAll('input[name="over"]');
    radioInputs.forEach((input) => {
      input.addEventListener("change", (e) => {
        const target = e.target as HTMLInputElement;
        if (target.checked) {
          switch (target.id) {
            case "over1":
              changeTileLayer(OSM_TILE_LAYER_URL);
              break;
            case "over2":
              changeYandexLayer("map");
              break;
            case "over3":
              changeYandexLayer("satellite");
              break;
          }
        }
      });
    });

    // подложка конец
    // блок с кнопками масштабирования начало
    const plusButton = document.querySelector(".map-overlay--zoom-block-button-plus");
    const minusButton = document.querySelector(".map-overlay--zoom-block-button-minus");
    const resetButton = document.querySelector(".map-overlay--zoom-block-button-reset");

    if (plusButton) {
      plusButton.addEventListener("click", () => {
        this.map.zoomIn();
      });
    }

    if (minusButton) {
      minusButton.addEventListener("click", () => {
        this.map.zoomOut();
      });
    }

    if (resetButton) {
      resetButton.addEventListener("click", () => {
        if (navigator.geolocation) {
          navigator.geolocation.getCurrentPosition((position) => {
            const { latitude, longitude } = position.coords;
            this.map.setView([latitude, longitude]);
          });
        }
      });
    }
    // блок с кнопками масштабирования конец
    // страница круиза начало
    if (document.location.href.includes('cruise=')) {
      window.addEventListener('cruisePointsCreated', (event: Event) => {
        const {cruise, points} = (event as CustomEvent).detail;
        const {northPoint, southPoint, westPoint, eastPoint} = points;
        
        // Создаем границы для карты
        const bounds = L.latLngBounds(
          [southPoint.lat, westPoint.lng], // юго-западная точка
          [northPoint.lat, eastPoint.lng]  // северо-восточная точка
        );
        
        // Устанавливаем вид карты по границам с небольшим отступом
        this.map.fitBounds(bounds, {
          padding: [20, 20], // отступ в пикселях со всех сторон
          maxZoom: 12, // ограничиваем максимальное приближение
          animate: true // плавная анимация
        });
      });
    }
    // страница круиза конец
  }

  addLayer() {
    return new LeafletPane(
      this.map,
      this.autoPan,
      (this.layersCount++).toString()
    );
  }

  panTo(lat: number, lng: number) {
    this.map.panTo([lat, lng]);
  }

  setOverlayBounds(top: number, right: number, bottom: number, left: number) {
    this.autoPan[0].x = left;
    this.autoPan[0].y = top;
    this.autoPan[1].x = right;
    this.autoPan[1].y = bottom;
  }

  coordsToPoint(lat: number, lng: number): [number, number] {
    const { x, y } = this.map.project([lat, lng], 1);
    return [x, y];
  }
}

/** Реализация слоя с помощью набора панелей */
class LeafletPane<
  TMarker extends MapMarker = MapMarker
> extends Layer<TMarker> {

  declare visible: boolean;

  /** Стандартные панели leaflet, внутри которых будут располагаться панели слоя */
  protected static parentPanes: Set<string> = new Set([
    "overlayPane",
    "markerPane",
    "popupPane",
  ]);
  protected get parentPanes(): Set<string> {
    return (this.constructor as typeof LeafletPane).parentPanes;
  }
  declare private paneName: string;

  declare private map: LMap;
  /** Для каждой панели (дочерней для overlayPane) требуется свой Renderer */
  declare private renderer: Renderer;
  /** Точки, задаваемые setOverlayBounds */
  declare private autoPan: [Point, Point];

  /** Соответствия объектов leaflet сущностям приложения */
  private representations: WeakMap<TMarker | MapPolyline, LLayer[]> =
    new WeakMap();

  private intersections: IntersectionSearchTree<
    IntersectionMapMarker<TMarker>
  > = new IntersectionSearchTree();
  /** Соответствия маркеров пересечений маркерам приложения */
  private intersectionMarkers: WeakMap<
    TMarker,
    IntersectionMapMarker<TMarker>
  > = new WeakMap();
  /**
   * Запланированные для проверки пересечений маркеры (для оптимизации).
   * true означает проверку всех имеющихся.
   */
  private plannedIntersectionChecks: Set<TMarker> | true = new Set();

  events: AuditableEventTarget<
    Layer<TMarker>['events'] extends TypedEventTarget<infer E> ? E : never
  > = new AuditableEventTarget();

  constructor(map: LMap, autoPan: [Point, Point], paneName = "") {
    super();
    this.visible = true;

    this.map = map;
    this.autoPan = autoPan;
    this.paneName = paneName;

    if (paneName)
      for (const parentPaneName of this.parentPanes) {
        const pane = map.createPane(
          this.compositePaneName(parentPaneName),
          map.getPane(parentPaneName)
        );
        pane.classList.add("map__layer", "map__layer_visible");
      }
    this.renderer = canvas({
      pane: this.compositePaneName("overlayPane"),
    });

    this.map.on("zoomend", () => this.checkAllIntersections());
  }

  show() {
    if (this.visible) return;
    this.visible = true;
    for (const pane of this.panes()) pane.classList.add("map__layer_visible");
    this.events.dispatchEvent(new Event("visibilitychange"));
    this.checkAllIntersections();
  }

  hide() {
    if (!this.visible) return;
    this.visible = false;
    for (const pane of this.panes()) {
      pane.classList.remove("map__layer_visible");
    }
    this.events.dispatchEvent(new Event("visibilitychange"));
  }

  toggle() {
    if (this.visible) this.hide();
    else this.show();
  }

  addMarker(mapMarker: TMarker) {
    mapMarker.marker = marker([mapMarker.lat, mapMarker.lng], {
      icon: new DOMIcon({
        html: mapMarker.icon,
        iconSize: mapMarker.iconSize,
      }),
      pane: this.compositePaneName("markerPane"),
    });
    this.syncMarker(mapMarker);
  }

  addInteractiveMarker(interactiveMarker: TMarker & InteractiveMapMarker) {
    interface popupMarker extends Marker<any> {
      isOpen?: boolean;
    }
    const lMarker: popupMarker = marker(
      [interactiveMarker.lat, interactiveMarker.lng],
      {
        icon: new DOMIcon({
          html: interactiveMarker.icon,
          iconSize: interactiveMarker.iconSize,
        }),
        pane: this.compositePaneName("markerPane"),
      }
    );
    interactiveMarker.marker = lMarker;
    // Удаление одноразового маркера
    lMarker.on("popupclose", () => {
      lMarker.unbindPopup();
      lMarker.isOpen = false;
    });

    // Создание и открытие одноразового маркера
    const open = async () => {
      if (!lMarker.isOpen) {
        lMarker.isOpen = true;
        const content = await interactiveMarker.popupContent();

        const contentDiv = document.createElement("div");
        contentDiv.classList.add("map__popup-scroller");
        contentDiv.appendChild( content );
        const popupDiv = document.createElement("div");
        popupDiv.classList.add("map__popup", "map__popup_loaded");
        popupDiv.appendChild( contentDiv );
        
        // Ищем оптимальное положение попапа
        popupDiv.style.maxWidth = null;
        popupDiv.style.maxHeight = null;
        contentDiv.style.maxWidth = null;
        contentDiv.style.maxHeight = null;
        document.body.appendChild(popupDiv);
        const popupSize = point([ popupDiv.offsetWidth, popupDiv.offsetHeight ]);
        document.body.removeChild(popupDiv);

        const coord = this.map.latLngToContainerPoint( lMarker.getLatLng() );
        const size = this.map.getSize();
        const iconSize = point( lMarker.getIcon().options.iconSize );
        const left = coord.x - popupSize.x;
        const right = size.x - coord.x - popupSize.x;
        const top = coord.y - popupSize.y;
        const bottom = size.y - coord.y - popupSize.y;
        const max = Math.max( left, right, top, bottom );

        let offset: PointExpression;
        if (top == max || coord.y >= popupSize.y + 30 + iconSize.y / 2) {
          let x = 0;
          if (size.x - coord.x < popupSize.x / 2 + 20) x = size.x - coord.x - popupSize.x / 2 - 20;
          if (coord.x < popupSize.x / 2 + 20) x = popupSize.x / 2 + 20 - coord.x;
          offset = [ x, -10 - iconSize.y / 2 ];
          if (coord.y - iconSize.y / 2 - popupSize.y < 30) {
            const height = coord.y - iconSize.y / 2 - 30;
            contentDiv.style.maxHeight = `${height - 40}px`;
          }
        }
        else if (left == max) {
          let y = iconSize.y / 2;
          if (coord.y < popupSize.y + 20) y = popupSize.y + 20 - coord.y;
          offset = [ -10 - popupSize.x / 2 - iconSize.x / 2, y ];
          if (coord.x - iconSize.x / 2 - popupSize.x < 30) {
            const width = coord.x - iconSize.x / 2 - 30;
            offset[0] += ( popupSize.x - width ) / 2;
            popupDiv.style.maxWidth = `${width}px`;
          }
        }
        else if (right == max) {
          let y = iconSize.y / 2;
          if (coord.y < popupSize.y + 20) y = popupSize.y + 20 - coord.y;
          offset = [ popupSize.x / 2 + 10 + iconSize.x / 2, y ];
          if (size.x - coord.x - iconSize.x / 2 - popupSize.x < 30) {
            const width = size.x - coord.x - iconSize.x / 2 - 30;
            offset[0] -= ( popupSize.x - width ) / 2;
            popupDiv.style.maxWidth = `${width}px`;
          }
        }
        else {
          let x = 0;
          if (size.x - coord.x < popupSize.x / 2 + 20) x = size.x - coord.x - popupSize.x / 2 - 20;
          if (coord.x < popupSize.x / 2 + 20) x = popupSize.x / 2 + 20 - coord.x;
          offset = [ x, popupSize.y + 10 + iconSize.y / 2 ];
          if (size.y - coord.y - iconSize.y / 2 - popupSize.y < 30) {
            const height = size.y - coord.y - iconSize.y / 2 - 30;
            offset[1] -= popupSize.y - height;
            contentDiv.style.maxHeight = `${height - 40}px`;
          }
        }
        
        lMarker.bindPopup(popupDiv, {
          closeButton: false,
          closeOnClick: false,
          autoPan: false,
          offset,
          pane: this.compositePaneName('popupPane'),
        }).openPopup();
      }
    };

    lMarker.on("mouseover click", () => {
      if (!lMarker.isOpen) open();
    });
    // Закрытие попапа только при выходе мыши за его пределы либо пределы маркера
    lMarker.on("mouseout", event => {
      const popup = lMarker.getPopup();
      if (popup) {
        const container = popup.getElement();
        if (container.contains(event.originalEvent?.relatedTarget as Node)) {
          container.addEventListener("mouseleave", () => {
            popup.close();
          });
        } else {
          popup.close();
        }
      }
    });

    this.syncMarker(interactiveMarker);
  }

  removeMarker(marker: TMarker) {
    this.checkSiblingsIntersections(marker);
    this.removePath(marker);
    this.intersections.remove(this.intersectionMarkers.get(marker));
    this.intersectionMarkers.delete(marker);
    marker.marker = undefined;
  }

  /** Связать маркер приложения и маркер leaflet */
  private syncMarker(marker: TMarker): void {
    const lMarker = marker.marker;
    this.representations.set(marker, [lMarker]);
    const intersectionMarker = new IntersectionMapMarker(marker);
    this.intersectionMarkers.set(marker, intersectionMarker);
    this.intersections.add(intersectionMarker);
    marker.events.addEventListener("locationchange", () => {
      lMarker.setLatLng([marker.lat, marker.lng]);
      this.intersections.update(intersectionMarker);
      this.checkIntersections([marker]);
    });
    lMarker.addTo(this.map);
    this.checkIntersections([marker]);
  }

  private checkIntersections(markers: TMarker[]): void {
    if (this.plannedIntersectionChecks === true) return;
    if (markers.length > 0 && this.plannedIntersectionChecks.size === 0)
      window.queueMicrotask(() => {
        if (this.plannedIntersectionChecks === true) return;
        const markers = new Set<IntersectionMapMarker<TMarker>>();
        for (const marker of this.plannedIntersectionChecks)
          if (this.intersectionMarkers.has(marker))
            markers.add(this.intersectionMarkers.get(marker));
        this.plannedIntersectionChecks.clear();
        if (
          this.events.listenersCount("intersect") === 0
          || markers.size === 0
        ) return;
        const { entries, graph } = this.intersections.check(markers, (obj) =>
          obj && obj.marker ? obj.marker : null
        );
        this.events.dispatchEvent(
          new IntersectionEvent("intersect", entries, graph)
        );
      });
    for (const marker of markers) this.plannedIntersectionChecks.add(marker);
  }

  private checkAllIntersections(): void {
    this.plannedIntersectionChecks = true;
    window.queueMicrotask(() => {
      if (this.plannedIntersectionChecks !== true) return;
      this.plannedIntersectionChecks = new Set();
      if (this.events.listenersCount("intersect") === 0) return;
      const { entries, graph } = this.intersections.checkAll((obj) =>
        obj && obj.marker ? obj.marker : null
      );
      if (entries.size > 0)
        this.events.dispatchEvent(
          new IntersectionEvent("intersect", entries, graph)
        );
    });
  }

  /**
   * Проверить пересечения всех маркеров, в данный момент пересекающихся с указанным.
   * Используется перед удалением.
   */
  private checkSiblingsIntersections(marker: TMarker): void {
    const { entries: siblings } = this.intersections.check(
      new Set([this.intersectionMarkers.get(marker)]),
      (obj) => obj && obj.marker ? obj.marker : null,
    );
    this.checkIntersections([...siblings]);
  }

  /** В данный момент никак не реализован InteractiveMapPolylinePoint */
  drawPolyline(mapPolyline: MapPolyline | InteractiveMapPolyline) {
    if (!this.representations.has( mapPolyline )) {
      const { points } = mapPolyline;
      const color = `#${mapPolyline.color.toString(16)}`;
      const layers: LLayer[] = [
        polyline(points, {
          color,
          weight: 3,
          renderer: this.renderer,
        })
      ];

      if (points.length) {
        for (const { lat, lng } of [ points[0], points[points.length - 1] ]) {
          layers.push(
            circleMarker([lat, lng], {
              color,
              radius: 8,
              stroke: false,
              fill: true,
              fillOpacity: 1,
              renderer: this.renderer,
            })
          );
        }
      }

      if (( mapPolyline as InteractiveMapPolyline ).events) {
        for (const layer of layers) {
          const events = ( mapPolyline as InteractiveMapPolyline ).events;
          for (const type of Object.keys( events )) {
            layer.on( type, events[ type ] );
          }
        }
      }

      this.representations.set(mapPolyline, layers);
      for (const path of layers) path.addTo(this.map);
    }
  }

  clearPolyline(polyline: MapPolyline) {
    if (this.representations.has( polyline )) {
      this.removePath(polyline);
    }
  }

  private *panes(): Iterable<HTMLElement> {
    for (const parentPaneName of this.parentPanes)
      yield this.map.getPane(this.compositePaneName(parentPaneName));
  }

  private compositePaneName(parentPaneName: string) {
    return this.paneName
      ? `${parentPaneName}-${this.paneName}`
      : parentPaneName;
  }

  private removePath(key: any): void {
    for (const layer of this.representations.get(key) ?? [])
      layer.removeFrom(this.map);
    this.representations.delete(key);
  }
}

/** Иконка с доступом к своему html-элементу */
type ExposedDivIcon = DivIcon & {
  container: HTMLElement;
};

/** Иконка в стилизованном контейнере */
const DOMIcon = DivIcon.extend({
  createIcon() {
    const div = document.createElement("div");
    div.classList.add("leaflet-marker-icon");
    div.style.setProperty(
      "--leaflet-marker-icon_width",
      `${this.options.iconSize[0]}px`
    );
    div.style.setProperty(
      "--leaflet-marker-icon_height",
      `${this.options.iconSize[1]}px`
    );
    div.appendChild(this.options.html);
    this.container = div;
    return div;
  },
}) as any; // С конструкторами объектов leaflet сложности, поэтому any

/** Адаптер маркера для рассчета пересечений */
class IntersectionMapMarker<TMarker extends MapMarker = MapMarker>
  implements IntersectionMarker {

  declare marker: TMarker;

  get x() {
    return this.marker.lng;
  }

  get y() {
    return -this.marker.lat;
  }

  constructor(marker: TMarker) {
    this.marker = marker;
  }

  rect() {
    const icon = this.marker.marker?.options.icon as ExposedDivIcon;
    return icon?.container.getBoundingClientRect() || new DOMRect;
  }
}
