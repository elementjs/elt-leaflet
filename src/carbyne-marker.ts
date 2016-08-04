
import {c, Atom, Appendable} from 'carbyne'

/**
 * Extension de leaflet pour signaler qu'on a créé un nouveau type d'icône.
 */
declare global {
	namespace L {
		export interface CarbyneIconOptions extends IconOptions {
			marker: () => Atom
		}

		export interface CarbyneIcon extends Icon { }

		export interface CarbyneIconStatic extends ClassStatic {
			new(options: CarbyneIconOptions): CarbyneIcon
		}

		export var CarbyneIcon: CarbyneIconStatic
		export var carbyneIcon: (options: CarbyneIconOptions) => CarbyneIcon

		export interface CarbyneMarker extends Marker { }
		export interface CarbyneMarkerStatic extends ClassStatic {
			new(ll: LatLngExpression, options?: MarkerOptions): CarbyneMarker
		}

		export var CarbyneMarker: CarbyneMarkerStatic
		export var carbyneMarker: (ll: LatLngExpression, options?: MarkerOptions) => CarbyneMarker
	}
}

L.CarbyneIcon = L.Icon.extend({
	options: {
		marker: false
	},

	createIcon(oldIcon: any) {
    let fragment: DocumentFragment = null;
    if (!this._carbyne_icon) {
      this._carbyne_icon = this.options.marker();
      fragment = document.createDocumentFragment();
      this._carbyne_icon.mount(fragment); // force creation of the DOM.
    }
    return this._carbyne_icon.element;
  },

  destroy() {

  }
})

L.carbyneIcon = function (options: L.CarbyneIconOptions) {
	return new L.CarbyneIcon(options)
}

// On doit forcer Marker en any car il est mal défini et ne dit pas les choses correctement.
L.CarbyneMarker = (L.Marker as any).extend({
	onRemove(map: L.Map) {
		const icon = this.options.icon._carbyne_icon
		if (icon)
			// On ne s'occupe pas du DOM, qui sera géré par leaflet.
			icon.broadcast('destroy')
		L.Marker.prototype.onRemove.apply(this, arguments)
	}
})

L.carbyneMarker = function (latlng: L.LatLngExpression, opts?: L.MarkerOptions) {
	return new L.CarbyneMarker(latlng, opts)
}


/**
 *
 */
export function createCarbyneIcon(cnts: Appendable, opts?: any): L.CarbyneIcon {

	let icon = L.carbyneIcon({
		marker: () =>
			c('.leaflet-marker-icon', {class: opts.class||''},
				c('.map-marker-icon', {},
					c('.map-marker-circle', {class: opts.class||''}, cnts)
				),
				c('.map-marker-pin', {class: opts.class||''})
			)
	})

	return icon
}
