# Waymo cohesion review

- [Front](front.png): continuous hood/bumper, grille and headlamp placement.
- [Front left](front-left.png) / [front right](front-right.png): body contours and roof-mounted fairing.
- [Rear](rear.png): hatch, closer rear pods and spoiler attachment.
- [Rear left](rear-left.png) / [rear right](rear-right.png): quarter panels and hatch silhouette.
- [Left](left.png) / [right](right.png): body/glass proportions and roof contact.
- [Overhead](top.png): symmetric sensor layout and fairing footprint.
- [Wheel](wheel.png): smooth wheel opening, split spokes, rim, hub and lugs.

Captured in the actual High/midday WebGPU scene at 1280×720. The developer tool exposes
`?showcase=car&hero=front&hud=0`, ten review angles, geometry counts and full-resolution still export.
All ten views were inspected after the final change; the right-side camera is closer to avoid a tree.
The capture tool preserves a 16:9 image inside narrow viewports instead of stretching it.

41 targeted tests pass. Player geometry: **46,370 triangles across 28 meshes**. No new frame-time
benchmark is claimed. Roof/cabin contact tests use the production layout, including an altered roof
height to verify that the sensor housing moves with the roof.

This remains a procedural interpretation with opaque glazing and simple interior forms. Strong
sun reflections remain visible in the right/front and left/profile views. Details and references:
[model note](../../vehicles/waymo.md).

Full regression: 184/186 on the parallel run; the unchanged curb-drape and road-build timing
checks passed in separate reruns without relaxing limits. All three full-city ride seeds had zero contacts.
