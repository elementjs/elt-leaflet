
import {o, c, Controller} from 'carbyne'
import 'leaflet'

export var TILE_LAYER = 'https://swtiles.sales-way.com/mapbox-studio-humanitarian-print/{z}/{x}/{y}' + (L.Browser.retina ? '@2x' : '') + '.png'

// export const TILE_LAYER = `https://{s}-s.mqcdn.com/tiles/1.0.0/osm/{z}/{x}/{y}.png`
// export const TILE_SUBDOMAINS = ['otile1', 'otile2', 'otile3', 'otile4']

function _isMarker(o: any): o is L.Marker { return o instanceof L.Marker }
function _isPolyline(o: any): o is L.Polyline { return o instanceof L.Polyline }


/**
 * Additions to the leaflet typings for some undocumented methods.
 */
declare global {
	namespace L {

		/**
		 * Give the layer id of any layer. Useful with
		 * featureGroup (not in the original typings)
		 */
		function stamp(layer: ILayer): number
	}
}

/**
 * Un type d'icone custom qui prend du carbyne pour faire son marker.
 * Nota : c'est peut être pas trop ce qu'on veut faire (après tout, il n'y
 * a peut être pas grand chose de dynamique dans ce qu'on veut mettre
 * dans une icône)
 */
// export var CarbyneIcon = L.Icon.extend({
// 	options: {
//     marker: false
//   },

//   createIcon(oldIcon: any) {
//     let fragment: DocumentFragment = null;

//     if (!this._carbyne_icon) {
//       this._carbyne_icon = this.options.marker();
//       fragment = document.createDocumentFragment();
//       this._carbyne_icon.mount(fragment); // force creation of the DOM.
//     }

//     return this._carbyne_icon.element;
//   },

//   destroy() {

//   }

// })

export type MapReadyFn = (map: L.Map) => any

/**
 * Le contrôle appelé par tous les états/controlleurs qui souhaitent afficher des
 * informations.
 */
export class MapCtrl extends Controller {

	private l: L.Map = null
	private _queue: MapReadyFn[] = []

	onMount() {

		if (this.l) return

		this.l = L.map(this.atom.element, {
			zoomControl: false,
			minZoom: 7,
			attributionControl: false
		})

		// Cleanup total des layers carbyne.
		this.l.on('unload', ev => {
			this.l.eachLayer(l => {
				this.l.removeLayer(l)
			})
		})

		// Rajout des tiles OSM
    L.tileLayer(TILE_LAYER, {
			// subdomains: TILE_SUBDOMAINS
    }).addTo(this.l);

    // Enfin, un petit fix pour être sûr que la map calcule bien sa propre taille.
		requestAnimationFrame(() => {
			for (let fn of this._queue)
				fn(this.l)
			this._queue = []
		})

	}

	run(fn: MapReadyFn): void {
		if (!this.l)
			this._queue.push(fn)
		else
			fn(this.l)
	}

	onDestroy() {
		// cleanup pour éviter les memory leaks.
		if (this.l) {
			this.l.remove()
			this.l = null
		}
	}

}
