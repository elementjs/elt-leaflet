
import * as L from 'leaflet'
import {_unmount} from 'elt'

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
  options.icon = di
	var marker = L.marker(ll, options)
	marker.on('remove', function (this: L.Marker, ev) {
		const node = (this.options.icon!.options as any).node as Node

		_unmount(node, node.parentNode!, node.previousSibling, node.nextSibling)
	})
  return marker
}
