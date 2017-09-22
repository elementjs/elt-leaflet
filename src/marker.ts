
import * as L from 'leaflet'

export interface DOMIconOptions extends L.DivIconOptions {
	node: Element
}

export const DOMIcon = L.Icon.extend({
	createIcon(this: L.DivIcon, old: HTMLElement) {
		return (this.options as any).node
	}
})


export function domMarker(ll: L.LatLngExpression, icon: Element, options: L.MarkerOptions = {}): L.Marker {
  options.icon = new DOMIcon({node: icon})
  var marker = L.marker(ll, options)
  return marker
}
