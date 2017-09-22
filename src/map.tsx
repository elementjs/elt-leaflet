
import {
	ArrayOrSingle,
	Attrs,
	Component,
	Mixin,
	DisplayIf,
	getChildren,
	o,
	MaybeObservable,
	Observable,
	observe,
	inserted,
	removed,
	Verb,
	VirtualHolder
} from 'domic'

import * as Leaflet from 'leaflet'

export const L = Leaflet;

(window as any).L_NO_TOUCH = true

export interface MapAttributes extends Attrs {
	center?: MaybeObservable<L.LatLng>
	zoom?: MaybeObservable<number>
	tileLayer: string
}


/**
 * special foreach function
 */
function _foreach<T>(ob: ArrayOrSingle<T> | null, callback: (t: T) => any) {
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
	if (!map)
		throw new Error('did not find the map for this node')
	map.leafletMap.addLayer(layer)
}


export class Map extends Component {

	attrs: MapAttributes
	private l: L.Map | null

	get leafletMap(): L.Map {
		if (!this.l) throw new Error('there is no map active on this node')
		return this.l
	}

	inserted(node: HTMLElement) {
		var map = this.l = L.map(node, {
			zoomControl: false,
			// minZoom: 7,
			zoom: 13,
			attributionControl: false,
			// zoom sur le centre de la france.
			center: [46.48333, 2.53333]
		})

				// Rajout des tiles OSM
    L.tileLayer(this.attrs.tileLayer, {
			// subdomains: TILE_SUBDOMAINS
    }).addTo(this.l);

		requestAnimationFrame(() => map.invalidateSize({}))
	}

	removed() {
		var map = this.leafletMap
		map.eachLayer(l => {
			map.removeLayer(l)
		})
		map.remove()
		this.l = null
	}

	panTo(ll: L.LatLng) {
		this.leafletMap.panTo(ll)
	}

	addLayer(layer: L.Layer) {
		this.leafletMap.addLayer(layer)
	}

	render(children: DocumentFragment) {

		if (this.attrs.center)
			this.observe(this.attrs.center, center => {
				if (center) this.leafletMap.panTo(center, {animate: true})
			})

		if (this.attrs.zoom)
			this.observe(this.attrs.zoom, zoom => {
				if (zoom != null) this.leafletMap.setZoom(zoom, {animate: true})
			})

		return <div class='domic-leaflet-map'>{children}</div>
	}

}


export interface DOMIconOptions extends L.DivIconOptions {
	node: Element
}

export const DOMIcon = L.Icon.extend({
	createIcon(this: L.DivIcon, old: HTMLElement) {
		return (this.options as any).node
	}
})



export interface LayerAttributes extends Attrs {
	contents?: MaybeObservable<ArrayOrSingle<L.Layer>>,
}


export class Layer extends Component {

	name = 'leaflet layer'

	attrs: LayerAttributes

	layer = L.featureGroup()
	current: ArrayOrSingle<L.Layer> | null = null

	inserted(node: Node, parent: Node) {
		const layer = Layer.get(parent)
		if (layer) {
			layer.layer.addLayer(this.layer)
			return
		}

		// If there was no Layer above us, just add ourselves
		// to the map.
		var map = Map.get(node)
		if (!map) throw new Error('no map to add this layer to')
		map.leafletMap.addLayer(this.layer)
	}

	removed() {
		_foreach(this.current, ob => ob.remove())
		this.layer.remove()
	}

	init(node: Node) {

		// If there is contents, just add them.
		if (this.attrs.contents) {
			this.observe(this.attrs.contents, layer => this.update(layer, node))
		}
	}

	update(obj: ArrayOrSingle<L.Layer>, node: Node) {
			const map = Map.get(node)
			const layer = Layer.get(node.parentNode!)

			_foreach(this.current, ob => ob.remove())
			this.current = obj
			_foreach(obj, ob => {
				layer ? layer.layer.addLayer(ob) : map ? ob.addTo(map.leafletMap) : null // this null is an error
			})
	}

	render(children: DocumentFragment) {
		// we still need a div because we want the children to find it.
		return <div style='display: none;'>{children}</div>
	}

}


//////////////////////////////////////////////////////////////////////////

export interface PopupOptions extends L.PopupOptions {
	coords: MaybeObservable<L.LatLngExpression>
	onclose?: (ev: L.PopupEvent) => any
}


export class PopupMixin extends Mixin {

	contents: Element
	popup: L.Popup

	constructor(
		public coords: MaybeObservable<L.LatLngExpression>,
		children: Node | (() => Node),
		public onclose?: (ev: L.PopupEvent) => any,
		public options?: L.PopupOptions
	) {
		super()

		this.contents = <div class='dl--popup'>
			{typeof children === 'function' ? DisplayIf(true, children) : children}
		</div>

		this.observe(this.coords, coords => {
			this.popup && this.popup.setLatLng(coords)
		})

	}

	inserted(node: Node) {
		if (this.popup) return

		const map = Map.get(node)!.leafletMap

		this.popup = L.popup(this.options || {})
		.setContent(this.contents as any)
		.setLatLng(o.get(this.coords))

		this.popup.addEventListener('add', () => {
			// on resize le popup tout de suite
			requestAnimationFrame(() => {
				requestAnimationFrame(() => {
					this.popup.update()
				})
			})
		})

		if (this.onclose) {
			var close = (ev: L.PopupEvent) => {
				if (ev.popup === this.popup) {
					map.removeEventListener('popupclose', close)
					// Only run this if the popup was closed by a map interaction,
					// not if we were unmounted.
					if (!this.mounted) return
					this.onclose!(ev)
				}
			}

			map.addEventListener('popupclose', close)

		}

		map.openPopup(this.popup)
	}

	removed() {
		// popup is removed if our node is gone from the DOM.
		this.popup.remove()
	}

}


export function DisplayPopup(
	coords: MaybeObservable<L.LatLngExpression>,
	popup: Element | (() => Element),
	onclose?: (ev: L.PopupEvent) => any,
	options?: L.PopupOptions
): Comment {
	var comment = document.createComment('popup')
	var ctl = new PopupMixin(coords, popup, onclose, options)
	ctl.addToNode(comment)
	return comment
}


export class MapCenterVerb extends Verb {

	constructor(public center: MaybeObservable<L.LatLngExpression | L.LatLngBoundsExpression>) {
		super('map centerer')
	}

	init() {
		this.observe(this.center, center => {
			var map = Map.get(this.node)
			if (!map) return // this should be an error.
			if (center) {
				if (center instanceof L.LatLng) {
					map.leafletMap.setView(center as L.LatLngExpression, map.leafletMap.getZoom())
				} else {
					map.leafletMap.fitBounds(center as L.LatLngBoundsExpression, {
						animate: true, padding: [150, 150]
					})
				}
			}
		})

	}

}

export function CenterMap(center: MaybeObservable<L.LatLngExpression | L.LatLngBoundsExpression>) {
	return MapCenterVerb.create(center)
}



export type LeafletCallback<T extends L.Event> = (ev: T) => any

export interface MapWatcherCallbacks {
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


export class MapWatcher extends Verb {

	leaflet_map: L.Map | null

	constructor(public callbacks: MapWatcherCallbacks) {
		super('map watcher')
	}

	inserted() {
		const map = this.leaflet_map = Map.get(this.node)!.leafletMap

		for (var prop in this.callbacks)
			map.on(prop, (this.callbacks as any)[prop])
	}

	removed() {
		const map = this.leaflet_map!

		for (var prop in this.callbacks)
			map.off(prop, (this.callbacks as any)[prop])

		this.leaflet_map = null
	}

}

export function WatchMap(callbacks: MapWatcherCallbacks) {
	return MapWatcher.create(callbacks)
}


export class MarkerDisplayer extends Verb {
	marker: L.Marker

	constructor(public coords: MaybeObservable<L.LatLngExpression>, public dom_marker: Element, public options: L.MarkerOptions) {
		super('marker')
	}

	init() {
		this.options.icon = new DOMIcon({node: this.dom_marker})
		this.marker = L.marker(o.get(this.coords), this.options)

		this.observe(this.coords, co => this.marker.setLatLng(co))
	}

	inserted(node: Node) {
		Map.get(node)!.addLayer(this.marker)
	}

	removed(node: Node) {
		this.marker.remove()
	}
}


export function DisplayMarker(coords: MaybeObservable<L.LatLngExpression>, marker: Element, options: L.MarkerOptions = {}) {
	return MarkerDisplayer.create(coords, marker, options)
}
