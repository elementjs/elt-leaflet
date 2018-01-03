
export * from './map'
export * from './grouper'
import * as L_ from 'leaflet'
export const L = L_

import {o} from 'elt'

(L_.LatLng.prototype as any)[o.clone_symbol] = function (this: L.LatLng) {
	return L.latLng(this.lat, this.lng, this.alt)
}


;(L_.LatLngBounds.prototype as any)[o.clone_symbol] = function (this: L.LatLngBounds) {
	return L.latLngBounds(this.getSouthWest(), this.getNorthEast())
}
