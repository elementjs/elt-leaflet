
import {
	Attrs,
	Component,
	Mixin,
	o,
	instanciate_verb,
} from 'elt'

import * as L from 'leaflet'

import { style as cls } from 'osun'
import { Styling as S } from 'elt-ui'

import {domMarker} from './marker'


(window as any).L_NO_TOUCH = true


export interface MapAttributes extends Attrs {
	center?: o.O<L.LatLng>
	bbox?: o.O<L.LatLngBounds>
	'center-ro'?: o.RO<L.LatLng | null>
	'bbox-ro'?: o.RO<L.LatLngBounds | null>
	zoom?: o.RO<number>
	tileLayer: string
}


/**
 * special foreach function
 */
function _foreach<T>(ob: T | T[] | null | undefined, callback: (t: T) => any) {
	if (ob == null) return
	if (Array.isArray(ob))
		ob.forEach(callback)
	else
		callback(ob)
}


export class Map extends Component {

	attrs: MapAttributes
	private from_event = false
	private l: L.Map | null

	get leafletMap(): L.Map {
		if (!this.l) throw new Error('there is no map active on this node')
		return this.l
	}

	init(node: HTMLElement) {
		var map = this.l = L.map(node, {
			zoomControl: false,
			// minZoom: 7,
			zoom: 13,
			attributionControl: false,
			// zoom sur le centre de la france.
			center: o.get(this.attrs.center) || [46.48333, 2.53333]
		})

				// Rajout des tiles OSM
		L.tileLayer(this.attrs.tileLayer, {
			// subdomains: TILE_SUBDOMAINS
		}).addTo(this.l);

		const upd = o.debounce(() => {
			this.from_event = true
			const center = o.get(this.attrs.center)
			const mapcenter = map.getCenter()
			if (this.attrs.center instanceof o.Observable && (!center || !mapcenter.equals(center))) {
				this.attrs.center.set(mapcenter)
			}

			const bbox = o.get(this.attrs.bbox)
			const mapbbox = map.getBounds()
			if (this.attrs.bbox instanceof o.Observable && (!bbox || !mapbbox.equals(bbox))) {
				this.attrs.bbox.set(mapbbox)
			}
			this.from_event = false
		}, 100)

		map.on('moveend', upd)
		map.on('zoomend', upd)

		if (this.attrs.center)
			this.observe(this.attrs.center, center => {
				if (this.from_event) return
				if (center && !this.leafletMap.getCenter().equals(center)) {
					this.leafletMap.panTo(center, {animate: true})
				}
			})

		if (this.attrs['center-ro'])
			this.observe(this.attrs['center-ro']!, center => {
				if (this.from_event) return
				if (center && !this.leafletMap.getCenter().equals(center)) {
					this.leafletMap.panTo(center, {animate: true})
				}
			})


		if (this.attrs.bbox) {
			this.observe(this.attrs.bbox, bbox => {
				if (this.from_event) return
				if (bbox && !this.leafletMap.getBounds().equals(bbox))
					this.leafletMap.fitBounds(bbox, {animate: true})
			})
		}

		if (this.attrs['bbox-ro']) {
			this.observe(this.attrs['bbox-ro']!, bbox => {
				if (this.from_event) return
				if (bbox && !this.leafletMap.getBounds().equals(bbox))
					this.leafletMap.fitBounds(bbox, {animate: true})
			})
		}

		if (this.attrs.zoom)
			this.observe(this.attrs.zoom, zoom => {
				if (zoom != null) this.leafletMap.setZoom(zoom, {animate: true})
			})

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
		return <div class={Map.cls_container}>{children}</div>
	}

}


export namespace Map {
	export const cls_container = cls('map', {
		background: S.BG,
		zIndex: 0
	})
}





export type LeafletCallback<T extends L.LeafletEvent> = (ev: T) => any

export interface MapWatcherCallbacks {
	autopanstart?: LeafletCallback<L.LeafletEvent>
	baselayerchange?: LeafletCallback<L.LayersControlEvent>
	click?: LeafletCallback<L.LeafletMouseEvent>
	// contextmenu?:	LeafletCallback<L.LeafletMouseEvent> FIXME incompatibility with elt.
	dblclick?: LeafletCallback<L.LeafletMouseEvent>
	keypress?: LeafletCallback<L.LeafletEvent> // FIXME there should be KeyboardEvent
	layeradd?: LeafletCallback<L.LayerEvent>
	layerremove?: LeafletCallback<L.LayerEvent>
	load?: LeafletCallback<L.LeafletEvent>
	locationerror?: LeafletCallback<L.ErrorEvent>
	locationfound?: LeafletCallback<L.LocationEvent>
	mousedown?: LeafletCallback<L.LeafletMouseEvent>
	mousemove?: LeafletCallback<L.LeafletMouseEvent>
	mouseout?: LeafletCallback<L.LeafletMouseEvent>
	mouseover?: LeafletCallback<L.LeafletMouseEvent>
	mouseup?: LeafletCallback<L.LeafletMouseEvent>
	move?: LeafletCallback<L.LeafletEvent>
	moveend?: LeafletCallback<L.LeafletEvent>
	movestart?: LeafletCallback<L.LeafletEvent>
	overlayadd?: LeafletCallback<L.LayersControlEvent>
	overlayremove?: LeafletCallback<L.LayersControlEvent>
	popupclose?: LeafletCallback<L.PopupEvent>
	popupopen?: LeafletCallback<L.PopupEvent>
	preclick?: LeafletCallback<L.LeafletMouseEvent>
	resize?: LeafletCallback<L.ResizeEvent>
	tooltipclose?: LeafletCallback<L.TooltipEvent>
	tooltipopen?: LeafletCallback<L.TooltipEvent>
	unload?: LeafletCallback<L.LeafletEvent>
	viewreset?: LeafletCallback<L.LeafletEvent>
	zoom?: LeafletCallback<L.LeafletEvent>
	zoomend?: LeafletCallback<L.LeafletEvent>
	zoomlevelschange?:	LeafletCallback<L.LeafletEvent>
	zoomstart?: LeafletCallback<L.LeafletEvent>
}


export class MapWatcher extends Mixin<Comment> {

	leaflet_map: L.Map | null

	constructor(public callbacks: MapWatcherCallbacks) {
		super()
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
	return instanciate_verb(new MapWatcher(callbacks))
}


export class MarkerDisplayer extends Mixin<Comment> {
	marker: L.Marker

	constructor(public coords: o.RO<L.LatLngExpression>, public dom_marker: Element, public options: L.MarkerOptions) {
		super()
	}

	init(node: Node) {
		this.marker = domMarker(o.get(this.coords), this.dom_marker, this.options)
		this.observe(this.coords, co => this.marker.setLatLng(co))
		window.setTimeout(() => {
			const m = Map.get(node)
			if (m) m.addLayer(this.marker)
		})
	}

	removed(node: Node) {
		this.marker.remove()
	}
}


export function DisplayMarker(coords: o.RO<L.LatLngExpression>, marker: Element, options: L.MarkerOptions = {}) {
	return instanciate_verb(new MarkerDisplayer(coords, marker, options))
}


export class LayerDisplayer extends Mixin<Comment> {
	map: L.Map
	layer: L.LayerGroup

	constructor(public layers: o.RO<null|undefined|L.Layer|(null|undefined|L.Layer)[]>) {
		super()
		this.layer = L.layerGroup([])
	}

	init(node: Node) {
		this.observe(this.layers, layers => {
			// update the layers in this group

			if (!Array.isArray(layers))
				layers = [layers]

			for (var l of this.layer.getLayers())
				l.remove()

			for (var l2 of layers)
				if (l2) this.layer.addLayer(l2)
		})

		requestAnimationFrame(() => {
			var map = Map.get(node)
			if (map)
				map.leafletMap.addLayer(this.layer)
		})
	}

	removed(node: Node) {
		this.layer.remove()
	}
}


export function DisplayLayers(layers: o.RO<null|undefined|L.Layer|(null|undefined|L.Layer)[]>) {
	return instanciate_verb(new LayerDisplayer(layers))
}


