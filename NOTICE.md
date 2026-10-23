# Notice

Slop San Francisco is derived from [slop-newyork](https://github.com/mrdoob/slop-newyork) by mrdoob,
imported at commit `0049a49`, used under the [MIT License](LICENSE). The original copyright notice is retained.
The San Francisco adaptation and contributions are by Kamil ([@unable0_](https://x.com/unable0_)), also under MIT.

Three.js is a separate dependency, loaded from the pinned CDN URL in `index.html`, under its own
[MIT license](https://github.com/mrdoob/three.js/blob/dev/LICENSE). Offline tool dependencies retain their own licenses.
The project’s MIT license applies to software; it does not relicense the geographic datasets below.

## Data

- City and County of San Francisco open data (DataSF): Public Domain Dedication and License (PDDL) / CC0.
- USGS 3D Elevation Program: US government work.
- © OpenStreetMap contributors, available under the Open Database License (ODbL 1.0).
  The generated `js/sf-geodata.js` and landmark anchors in `js/sf-places.js` contain geometry derived from OpenStreetMap and are provided under ODbL 1.0.
  Source URLs, transformation tools and provenance are documented in `docs/data-sources.md`; retain these notices when redistributing the derived data.
- DataSF Analysis Neighborhoods (`j2bu-swwd`): the 41 official analysis polygons in `js/sf-places.js`; credited to City and County of San Francisco / DataSF.

OSM-derived regional coastline, island and ferry-route geometry also retains ODbL terms. The regional export
combines sources; use the provenance and transformation notes in [data sources](docs/data-sources.md) rather
than treating all generated assets as MIT-licensed code.
