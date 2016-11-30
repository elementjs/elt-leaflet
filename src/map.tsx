
import {
	ArrayOrSingle,
	Component,
	o,
	O,
	Observable,
	onmount,
	onunmount,
	BasicAttributes,
	d,
	Controller,
	HTMLComponent,
} from 'domic'

import * as L from 'leaflet'

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

	public o_zoom: Observable<number> = o(-1)
	public o_center: Observable<L.LatLng> = o(null)

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

		this.l.on('zoomend', ev => this.o_zoom.set(this.l.getZoom()))
		this.l.on('moveend', ev => this.o_center.set(this.l.getCenter()))

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


export const DivIcon: new (opts: L.DivIconOptions) => L.DivIcon = (L as any).DivIcon

export interface DOMIconOptions extends L.DivIconOptions {
	node: HTMLElement
}

export class DOMIcon extends DivIcon {

	options: DOMIconOptions

	constructor(opts: DOMIconOptions) {
		super(opts)
	}

	createIcon(old: HTMLElement) {
		return old ? old : this.options.node
	}

}


export interface MarkerStoreAttributes<T> extends BasicAttributes {

	obs: Observable<T[]>
	latlngfn: (t: T) => L.LatLng
	markerfn?: (lst: Observable<T>[]) => Node
	popupfn?: (lst: Observable<T>[]) => Node
	onselect?: (lst: Observable<T>[]) => void

	// Linked to zoom level
	threshold?: number

}


/**
 *
 */
export class MarkerStore<T> extends Component {

	attrs: MarkerStoreAttributes<T>

	map: Map
	layer: L.FeatureGroup

	@onmount
	getMap(node: Node) {
		this.map = Map.get(node)
	}

	@onunmount
	remove() {

		// destroy this layer.
		if (this.layer)
			this.map.l.removeLayer(this.layer)

		this.map = null
	}

	updateMarkers(lst: T[]) {
		const fn = this.attrs.latlngfn

		if (this.layer) {
			this.map.l.removeLayer(this.layer)
			this.layer = null
		}

		let markers = lst.map(item => {
			// let di = divIcon({})
			// di.createIcon = function (old: HTMLElement) {
			// 	console.log('WHAT ?')
			// 	console.log(old, icon)
			// 	return old ? old : icon
			// }
			if (!this.attrs.markerfn)
				return L.circleMarker(fn(item))

			let ma = L.marker(fn(item), {
				icon: new DOMIcon({node: this.attrs.markerfn([o(item)]) as HTMLElement}),
			})
			return ma
			// return circleMarker(fn(item))
		})
		this.layer = L.featureGroup(markers)
		this.layer.addTo(this.map.l)

		this.map.l.fitBounds(this.layer.getBounds(), {
			animate: true,
			padding: [50, 50]
		})
	}

	render() {

		this.observe(this.attrs.obs, list => {
			// create markers for this list.
			this.updateMarkers(list)
		})

		return document.createComment('marker store')
	}

}


export class PolylineStore extends Component {

	attrs: {line: O<L.Polyline>, options?: O<L.PathOptions>}

	render() {

		let previous_line: L.Polyline = null

		this.observe(this.attrs.line, line => {
			const map = Map.get(this.node)
			if (previous_line)
				previous_line.remove()

			previous_line = line
			if (line) line.addTo(map.l)
		})

		return document.createComment('polyline store')
	}

}



export class Layer extends Component {

	attrs: {
		contents: O<ArrayOrSingle<L.Layer>>,
	}

	layer = L.featureGroup()
	current: ArrayOrSingle<L.Layer> = null

	@onunmount
	remove() {
		_foreach(this.current, ob => ob.remove())
		this.layer.remove()
	}

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

	update(obj: ArrayOrSingle<L.Layer>) {
			const map = Map.get(this.node)
			const layer = Layer.get(this.node.parentNode)

			_foreach(this.current, ob => ob.remove())
			this.current = obj
			_foreach(obj, ob => layer ? layer.layer.addLayer(ob) : ob.addTo(map.l))
	}

	render() {

		// If there is contents, just add them.
		if (this.attrs.contents)
			this.observe(this.attrs.contents, layer => this.update(layer))

		return document.createComment('layer')
	}

}


export class MarkerFactory extends Layer {

}


export interface MarkerAttributes extends L.MarkerOptions {
	coords: L.LatLngExpression
	// popup ?
	// onclick ?
	// ???
}


/**
 *
 */
export class SVGMarker extends Component {

	attrs: MarkerAttributes
	marker: L.Marker = null

	@onmount
	addToMap(node: Node) {
		if (!this.marker)
			this.marker = this.renderMarker()
		_addLayer(node, this.marker)
	}

	@onunmount
	removeFromMap(node: Node) {
		this.marker.remove()
	}

	/**
	 * extend this.
	 */
	renderMarker(): L.Marker {
		// let opts = Object.assign({} as L.MarkerOptions, this.attrs || {})

		return L.marker(this.attrs.coords as L.LatLng, {
			icon: new DOMIcon({node: this.renderSVG() as HTMLElement})
		})
	}

	renderSVG(): Node {
		return null
	}

	render() {
		return document.createComment('marker')
	}

}



export class Centerer extends Component {

	attrs: {center: Observable<L.LatLng>}
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
			if (this.map && center) this.map.l.setView(center, this.map.l.getZoom())
		})

		return document.createComment('centerer')
	}

}