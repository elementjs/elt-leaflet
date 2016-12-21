
import {
	ArrayOrSingle,
	BasicAttributes,
	Component,
	Controller,
	d,
	HTMLComponent,
	getChildren,
	o,
	O,
	Observable,
	onmount,
	onfirstmount,
	onunmount,
	onrender,
	VirtualHolder,
} from 'domic'

import * as Leaflet from 'leaflet'

export const L = Leaflet;

(window as any).L_NO_TOUCH = true


export interface MapAttributes extends BasicAttributes {
	center?: O<L.LatLng>
	zoom?: O<number>
	tileLayer: string
}


/**
 * special foreach function
 */
function _foreach<T>(ob: ArrayOrSingle<T>, callback: (t: T) => any) {
	if (ob == null) return
	if (Array.isArray(ob))
		ob.forEach(callback)
	else
		callback(ob)
}

function _addLayer(node: Node, layer: L.Layer) {
	const parent = Layer.get(node)
	if (parent) {
		parent.layer.addLayer(layer)
		return
	}

	const map = Map.get(node)
	map.l.addLayer(layer)
}


export class Map extends HTMLComponent {

	attrs: MapAttributes
	l: L.Map

	@onmount
	drawMap() {
		this.l = L.map(this.node, {
			zoomControl: false,
			minZoom: 7,
			zoom: 13,
			attributionControl: false,
			// zoom sur le centre de la france.
			center: [46.48333, 2.53333]
		})

				// Rajout des tiles OSM
    L.tileLayer(this.attrs.tileLayer, {
			// subdomains: TILE_SUBDOMAINS
    }).addTo(this.l);

		requestAnimationFrame(() => this.l.invalidateSize({}))
	}

	@onunmount
	cleanup() {
		this.l.eachLayer(l => {
			this.l.removeLayer(l)
		})
		this.l.remove()
		this.l = null
	}

	panTo(ll: L.LatLng) {
		this.l.panTo(ll)
	}

	render(children: DocumentFragment) {

		this.observe(this.attrs.center, center => {
			if (center) this.l.panTo(center, {animate: true})
		})

		this.observe(this.attrs.zoom, zoom => {
			if (zoom != null) this.l.setZoom(zoom, {animate: true})
		})

		return <div class='domic-leaflet-map'>{children}</div>
	}

}


export interface DOMIconOptions extends L.DivIconOptions {
	node: HTMLElement
}

export const DOMIcon = L.Icon.extend({
	createIcon(this: L.DivIcon, old: HTMLElement) {
		return (this.options as any).node
	}
})



export class Layer extends Component {

	name = 'leaflet layer'

	attrs: {
		contents?: O<ArrayOrSingle<L.Layer>>,
	}

	layer = L.featureGroup()
	current: ArrayOrSingle<L.Layer> = null

	@onmount
	addToMap(node: Node) {
		const layer = Layer.get(node.parentNode)
		if (layer) {
			layer.layer.addLayer(this.layer)
			return
		}

		// If there was no Layer above us, just add ourselves
		// to the map.
		const map = Map.get(node)
		map.l.addLayer(this.layer)
	}

	@onunmount
	remove() {
		_foreach(this.current, ob => ob.remove())
		this.layer.remove()
	}

	@onrender
	linkContent() {

		// If there is contents, just add them.
		if (this.attrs.contents) {
			this.observe(this.attrs.contents, layer => this.update(layer))
		}
	}

	update(obj: ArrayOrSingle<L.Layer>) {
			const map = Map.get(this.node)
			const layer = Layer.get(this.node.parentNode)

			_foreach(this.current, ob => ob.remove())
			this.current = obj
			_foreach(obj, ob => layer ? layer.layer.addLayer(ob) : ob.addTo(map.l))
	}

	render(children: DocumentFragment) {
		// we still need a div because we want the children to find it.
		return <div style='display: none;'>{children}</div>
	}

}


export interface PopupAttributes extends L.PopupOptions {
	coords: O<L.LatLngExpression>
	onclose?: (ev: L.PopupEvent) => any
}


export class Popup extends Component {

	attrs: PopupAttributes
	contents: HTMLElement
	popup: L.Popup

	@onfirstmount
	attachToLayer(node: Node) {
		const map = Map.get(node).l

		this.popup = L.popup(this.attrs)
		.setContent(this.contents)
		.setLatLng(o.get(this.attrs.coords))

		this.popup.addEventListener('add', () => {
			// on resize le popup tout de suite
			requestAnimationFrame(() => {
				requestAnimationFrame(() => {
					this.popup.update()
				})
			})
		})

		if (this.attrs.onclose) {
			var close = (ev: L.PopupEvent) => {
				if (ev.popup === this.popup) {
					map.removeEventListener('popupclose', close)
					// Only run this if the popup was closed by a map interaction,
					// not if we were unmounted.
					if (!this.mounted) return
					this.attrs.onclose(ev)
				}
			}

			map.addEventListener('popupclose', close)

		}

		map.openPopup(this.popup)
	}

	@onunmount
	cleanup() {
		// popup is removed if our node is gone from the DOM.
		this.popup.remove()
	}

	render(children: DocumentFragment) {
		this.contents = <div class='dl--popup'>
			{children}
		</div> as HTMLElement

		this.observe(this.attrs.coords, coords => {
			this.popup && this.popup.setLatLng(coords)
		})

		return document.createComment('popup')
	}

}


export interface SVGMarkerAttributes extends L.MarkerOptions {
	coords: O<L.LatLngExpression>
	className?: O<string>
	onclick?: (ev: MouseEvent) => any
	// popup ?
	// onclick ?
	// ???
}


/**
 *
 */
export class SVGMarker extends Component {

	attrs: SVGMarkerAttributes
	marker: L.Marker = null

	@onmount
	addToMap(node: Node) {
		_addLayer(node, this.marker)
	}

	@onunmount
	removeFromMap(node: Node) {
		this.marker.remove()
	}

	/**
	 * extend this.
	 */
	renderMarker(children: DocumentFragment): L.Marker {

		const opts: L.MarkerOptions = {}
		const icon_opts: DOMIconOptions = {node: this.renderSVG(children) as HTMLElement}

		opts.icon = new DOMIcon(icon_opts)

		let mark = L.marker(o.get(this.attrs.coords), opts)

		if (this.attrs.onclick) {
			mark.addEventListener('click', this.attrs.onclick)
		}

		return mark
	}

	renderSVG(ch: DocumentFragment): Node {
		return null
	}

	render(children: DocumentFragment) {
		this.marker = this.renderMarker(children)

		this.observe(this.attrs.coords, coords => this.marker.setLatLng(coords))

		return document.createComment('marker')
	}

}



export class Centerer extends Component {

	attrs: {center: Observable<L.LatLngExpression | L.LatLngBoundsExpression>}
	map: Map

	@onmount
	setupCentering() {
		this.map = Map.get(this.node)
	}

	@onunmount
	bye() {
		this.map = null
	}

	render() {
		this.observe(this.attrs.center, center => {
			if (this.map && center) {
				if (center instanceof L.LatLng) {
					this.map.l.setView(center as L.LatLngExpression, this.map.l.getZoom())
				} else {
					this.map.l.fitBounds(center as L.LatLngBoundsExpression, {
						animate: true, padding: [150, 150]
					})
				}
			}

		})

		return document.createComment('centerer')
	}

}



export type LeafletCallback<T extends L.Event> = (ev: T) => any

export interface MapWatcherAttributes {

	autopanstart?: LeafletCallback<L.Event>
	baselayerchange?: LeafletCallback<L.LayersControlEvent>
	click?: LeafletCallback<L.MouseEvent>
	// contextmenu?:	LeafletCallback<L.MouseEvent> FIXME incompatibility with domic.
	dblclick?: LeafletCallback<L.MouseEvent>
	keypress?: LeafletCallback<L.Event> // FIXME there should be KeyboardEvent
	layeradd?: LeafletCallback<L.LayerEvent>
	layerremove?: LeafletCallback<L.LayerEvent>
	load?: LeafletCallback<L.Event>
	locationerror?: LeafletCallback<L.ErrorEvent>
	locationfound?: LeafletCallback<L.LocationEvent>
	mousedown?: LeafletCallback<L.MouseEvent>
	mousemove?: LeafletCallback<L.MouseEvent>
	mouseout?: LeafletCallback<L.MouseEvent>
	mouseover?: LeafletCallback<L.MouseEvent>
	mouseup?: LeafletCallback<L.MouseEvent>
	move?: LeafletCallback<L.Event>
	moveend?: LeafletCallback<L.Event>
	movestart?: LeafletCallback<L.Event>
	overlayadd?: LeafletCallback<L.LayersControlEvent>
	overlayremove?: LeafletCallback<L.LayersControlEvent>
	popupclose?: LeafletCallback<L.PopupEvent>
	popupopen?: LeafletCallback<L.PopupEvent>
	preclick?: LeafletCallback<L.MouseEvent>
	resize?: LeafletCallback<L.ResizeEvent>
	tooltipclose?: LeafletCallback<L.TooltipEvent>
	tooltipopen?: LeafletCallback<L.TooltipEvent>
	unload?: LeafletCallback<L.Event>
	viewreset?: LeafletCallback<L.Event>
	zoom?: LeafletCallback<L.Event>
	zoomend?: LeafletCallback<L.Event>
	zoomlevelschange?:	LeafletCallback<L.Event>
	zoomstart?: LeafletCallback<L.Event>

}


export class MapWatcher extends Component {

	attrs: MapWatcherAttributes
	leaflet_map: L.Map

	@onmount
	associateCallbacksToEvents() {
		const map = this.leaflet_map = Map.get(this.node).l

		for (var prop in this.attrs)
			map.on(prop, (this.attrs as any)[prop])
	}

	@onunmount
	unassociate() {
		const map = this.leaflet_map
		this.leaflet_map = null

		for (var prop in this.attrs)
			map.off(prop, (this.attrs as any)[prop])
	}

	render() {
		return document.createComment('map watcher')
	}

}