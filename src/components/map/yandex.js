// https://tech.yandex.com/maps/doc/jsapi/2.1/quick-start/index-docpage/

/* global ymaps: true */

L.Yandex = L.Layer.extend({

	options: {
		type: 'yandex#map', // 'map', 'satellite', 'hybrid', 'map~vector' | 'overlay', 'skeleton'
		mapOptions: { // https://tech.yandex.com/maps/doc/jsapi/2.1/ref/reference/Map-docpage/#Map__param-options
			// yandexMapDisablePoiInteractivity: true,
			balloonAutoPan: false,
			suppressMapOpenBlock: true
		},
		overlayOpacity: 0.8,
		minZoom: 0,
		maxZoom: 19
	},

	initialize: function (type, options) {
		if (typeof type === 'object') {
			options = type;
			type = false;
		}
		options = L.Util.setOptions(this, options);
		if (type) { options.type = type; }
		this._isOverlay = options.type.indexOf('overlay') !== -1 ||
		                  options.type.indexOf('skeleton') !== -1;
		this._animatedElements = [];
	},

	_setStyle: function (el, style) {
		for (var prop in style) {
			el.style[prop] = style[prop];
		}
	},

	_initContainer: function (parentEl) {
		var zIndexClass = this._isOverlay ? 'leaflet-overlay-pane' : 'leaflet-tile-pane';
		var _container = L.DomUtil.create('div', 'leaflet-yandex-container leaflet-pane ' + zIndexClass);
		var opacity = this.options.opacity || this._isOverlay && this.options.overlayOpacity;
		if (opacity) {
			L.DomUtil.setOpacity(_container, opacity);
		}
		var auto = {width: '100%', height: '100%'};
		this._setStyle(parentEl, auto);   // need to set this explicitly,
		this._setStyle(_container, auto); // otherwise ymaps fails to follow container size changes
		return _container;
	},

	onAdd: function (map) {
		var mapPane = map.getPane('mapPane');
		if (!this._container) {
			this._container = this._initContainer(mapPane);
			map.once('unload', this._destroy, this);
			this._initApi();
		}
		mapPane.appendChild(this._container);
		if (!this._yandex) { return; }
		this._setEvents(map);
		this._update();
	},

	beforeAdd: function (map) {
		map._addZoomLimit(this);
	},

	onRemove: function (map) {
		map._removeZoomLimit(this);
	},

	_destroy: function (e) {
		if (!this._map || this._map === e.target) {
			if (this._yandex) {
				this._yandex.destroy();
				delete this._yandex;
			}
			delete this._container;
		}
	},

	_setEvents: function (map) {
		var events = {
			move: this._update,
			resize: function () {
				this._yandex.container.fitToViewport();
			}
		};
		if (this._zoomAnimated) {
			events.zoomanim = this._animateZoom;
			events.zoomend = this._animateZoomEnd;
		}
		map.on(events, this);
		this.once('remove', function () {
			map.off(events, this);
			this._container.remove(); // we do not call this until api is initialized (ymaps API expects DOM element)
		}, this);
	},

	_update: function () {
		var map = this._map;
		var center = map.getCenter();
		this._yandex.setCenter([center.lat, center.lng], map.getZoom());
		var offset = L.point(0,0).subtract(L.DomUtil.getPosition(map.getPane('mapPane')));
		L.DomUtil.setPosition(this._container, offset); // move to visible part of pane
	},

	_resyncView: function () { // for use in addons
		if (!this._map) { return; }
		var ymap = this._yandex;
		this._map.setView(ymap.getCenter(), ymap.getZoom(), {animate: false});
	},

	_animateZoom: function (e) {
		var map = this._map;
		var viewHalf = map.getSize()._divideBy(2);
		var topLeft = map.project(e.center, e.zoom)._subtract(viewHalf)._round();
                var offset = map.project(map.getBounds().getNorthWest(), e.zoom)._subtract(topLeft);
		var scale = map.getZoomScale(e.zoom);
		this._animatedElements.length = 0;
		this._yandex.panes._array.forEach(function (el) {
			if (el.pane instanceof ymaps.pane.MovablePane) {
				var element = el.pane.getElement();
				L.DomUtil.addClass(element, 'leaflet-zoom-animated');
				L.DomUtil.setTransform(element, offset, scale);
				this._animatedElements.push(element);
			}
		},this);
	},

	_animateZoomEnd: function () {
		this._animatedElements.forEach(function (el) {
			L.DomUtil.setTransform(el, 0, 1);
		});
		this._animatedElements.length = 0;
	},

	_initApi: function () { // to be extended in addons
		ymaps.ready(this._initMapObject, this);
	},

	_mapType: function () {
		var shortType = this.options.type;
		if (!shortType || shortType.indexOf('#') !== -1) {
			return shortType;
		}
		return 'yandex#' + shortType;
	},

	_initMapObject: function () {
		ymaps.mapType.storage.add('yandex#overlay', new ymaps.MapType('overlay', []));
		ymaps.mapType.storage.add('yandex#skeleton', new ymaps.MapType('skeleton', ['yandex#skeleton']));
		ymaps.mapType.storage.add('yandex#map~vector', new ymaps.MapType('map~vector', ['yandex#map~vector']));
		var ymap = new ymaps.Map(this._container, {
			center: [0, 0], zoom: 0, behaviors: [], controls: [],
			type: this._mapType()
		}, this.options.mapOptions);

		if (this._isOverlay) {
			ymap.container.getElement().style.background = 'transparent';
		}
		this._container.remove();
		this._yandex = ymap;
		if (this._map) { this.onAdd(this._map); }

		this.fire('load');
	}
});

L.yandex = function (type, options) {
	return new L.Yandex(type, options);
};

// This addon provides dynamical loading of Yandex Maps JS API, overriding L.Yandex's stub _initApi method.
// Implements static function `loadApi`, and embeds some api defaults in static properies `url`, `version`, `params`.
// If function is not called explicitly, it will be called on layer's add, appying layer's options.

// So typical usage is:
// ```js
// var yandex = L.yandex({
//   apiParams: '<your API-key>'
// }).addTo(map);
// ```

// For advanced usage see details below.

// @method loadApi(options?: Object): L.Yandex
// Starts loading API with specified `options`.
// (Most can be defaulted, see details in `apiParams`)

// @options apiLoader: function or thennable = undefined
// Function that will be used to load Yandex JS API (if it turns out not enabled on layer add).
// Must return any Promise-like thennable object.
// Instead of function it's also possible to specify Promise/thennable directly as option value.

// Alternatively:
// Standard loader will be used, picking `apiUrl` / `apiVersion` / `apiParams` options,
// and predefined defaults.

// @options apiUrl: String = 'https://api-maps.yandex.ru/{version}/'
// Either url template, or fully-qualified link to api script
// (incl. at least mandatory parameters).
// more info: https://tech.yandex.com/maps/jsapi/doc/2.1/dg/concepts/load-docpage/

// @options apiVersion: String = '2.1'
// Can be specified to use api version other then default,
// more info: https://tech.yandex.com/maps/jsapi/doc/2.1/versions/index-docpage/

// @option apiParams: Object or String
// Parameters to use when enabling API.
// There are some predefined defaults (see in code), but 'apikey' is still mandatory.
// It's also possible to specify `apikey` directly as `apiParams` string value.

var statics = {
	loadApi: function (options) {
		if (this.loading) { return this; }
		if ('ymaps' in window) {
			this.loading = Promise.resolve();
			return this.loading;
		}
		options = options || {};
		var loading = options.apiLoader ||
			this._loadScript.bind(this, this._makeUrl(options));
		if (!loading.then) {
			loading = loading();
		}
		loading.catch(this.onerror);
		this.loading = loading;
		return this;
	},

	onerror: function (e) {
		if (typeof e !== 'string') { arguments = ['API loading failed: ', e]; }
		console.error.apply(console, arguments);
	},

	// API defaults: https://tech.yandex.com/maps/jsapi/doc/2.1/dg/concepts/load-docpage/

	url: 'https://api-maps.yandex.ru/{version}/',

	version: '2.1',

	params: {
		// apikey: '<Your API key>',
		lang: 'ru_RU',
		// load: 'package.all',
		// mode: 'debug',
		// csp: true,
		// onload: console.log,
		onerror: 'console.error'
	},

	_makeUrl: function (options) {
		var url = options.apiUrl || this.url;
		if (url.search('{') === -1) { return url; } // fully-qualified url specified

		var params = options.apiParams;
		if (typeof params === 'string') { params = { apikey: params }; }
		params = L.extend({}, this.params, params);
		if (!params.apikey || !params.lang) {
			throw new Error('api params expected in options');
		}
		url += L.Util.getParamString(params, url);
		return L.Util.template(url, { version: options.apiVersion || this.version });
	},

	_onerror: function (resolve, reject, event) {
		reject('API loading failed: ' + event.target.src);
	},

	_loadScript: function (url) {
		return new Promise(function (resolve, reject) {
			var script = document.createElement('script');
			script.onload = resolve;
			script.onerror = this._onerror.bind(this, resolve, reject);
			script.src = url;
			document.body.appendChild(script);
		}.bind(this));
	}
};

for (var method in statics) {
	L.Yandex[method] = statics[method];
}

L.Yandex.include({
	loadApi: function (options) {
	        this._initApi(options);
		return this;
	},

	_initApi: function (options) {
		this.constructor.loadApi(options || this.options).loading.then(function () {
			window.ymaps.ready(this._initMapObject, this);
		}.bind(this), L.Util.falseFn);
	}
});

