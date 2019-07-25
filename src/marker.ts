
import * as L from 'leaflet'
import {mount, unmount} from 'elt'

export interface DOMIconOptions extends L.DivIconOptions {
	node: Element
}

export const DOMIcon = L.Icon.extend({
	createIcon(this: L.DivIcon, old: HTMLElement) {
		return (this.options as any).node
	}
})


export function domMarker(ll: L.LatLngExpression, icon: Element, options: L.MarkerOptions = {}): L.Marker {
	const di = new DOMIcon({node: icon})
	const node = di.options.node as Node
	options.icon = di

	var marker = L.marker(ll, options)

	marker.on('remove', function (this: L.Marker, ev) {
		unmount(node)
	})

	marker.on('add', function () {
		mount(node)
	})

  return marker
}
