# Waymo player-car detail pass

The player car has a dedicated I-PACE-inspired visual specification and detail layer in `js/waymo-detail.js`.
The traffic fleet keeps its existing instanced geometry. This is an original procedural interpretation fitted
around the existing gameplay chassis, not manufacturer CAD or surveyed sensor dimensions.

## Reference

- [Waymo media resources](https://waymo.com/media-resources/), fifth-generation Jaguar I-PACE front/side views.
- [Waymo vehicle guide, December 2024](https://assets.ctfassets.net/e6t5diu0txbw/7ckbCH7e2hw3zhYDdaFkPU/47687bc860ed818d0a5067ff24ecb2ba/Waymo_Jaguar_I-PACE_California_Emergency_Response_Guide_and_Law_Enforcement_Interaction_Protocol_-_December_2024.pdf), pages 5–6:
  roof assembly, front fender additions, rear/front sensors, blue sensor bands and roof display.

Reference images are viewed for modeling; none are embedded in runtime assets. Fine measurements, camera
aperture counts and surface profiles are artistic approximations, not engineering specifications.

## What changed

- Taller crossover glasshouse and hatch profile, smoother body loft, paint clearcoat and tinted reflective glazing.
- One rounded camera fairing seated on the actual curved roof; compact lidar housing, blue collar, optical apertures and W display.
- Fender and rear-quarter sensor pods with separate dark bezels/lenses.
- Modeled diamond grille, central front sensor, headlamp housings/projectors and J-shaped daytime running lights.
- Split-spoke wheels with rounded tyres, metal rim lips, hub/lug geometry and brake discs.
- Flush handles, wipers, spoiler, diffuser, reflectors, California plates and door wordmarks.
- Seat/headrest forms, dashboard, console and steering-wheel form inside the cabin. Glazing remains tinted/opaque;
  these forms do not constitute a fully detailed, transparent passenger interior.

The model retains the prior horizontal envelope, wheel centers and wheel radius; collision behavior and ride
physics are not changed by this visual pass. The collision-realism proposal remains separate.

Geometry is merged by material, including small sensor/grille details and wheel lugs. Measured review scene:
**46,370 triangles, 28 meshes** for the player asset, including wheels, plates and contact shadow. This is a
geometry count, not a GPU timing claim. Most detail uses shared material batches; no new textures are downloaded.
Door/display lettering uses small local canvas textures.

## Verification

41 targeted tests pass: player specification/cache isolation, chassis preservation, roof/body attachment, boot, controls and vehicle lights.
A regression prevents the hero spec inheriting the traffic model's cached body/layout closures. Static build and
syntax/whitespace checks pass. Browser review covers front/rear, both profiles, four three-quarter views, overhead and wheel close-up; see
[the review gallery](../review/waymo/index.md). Existing driving/traffic physics are unchanged.

The old broad city collision approximation, pedestrian reactions and missing tree colliders are not addressed here.

## Cohesion revision

The first detail pass read as stacked separate objects. The revised assembly derives its lower surface
from `carLayout(spec).cabinTop()`, overlapping the roof by 8 mm. The lidar collar, optical bands and
display all reference that assembly height. No rail-height or tray-height constants can leave a gap
when the roof changes. This is an artistic integrated fairing, not an exact replica of Waymo's mounts.

The body now has a lower hood shoulder, wider/taller glasshouse, curved door sections, subtle hood
creases and more finely sampled wheel arches. Rear pods and spoiler sit closer to the body; trim and
grille brightness are restrained. Body and sensor housing use the same paint color/finish.
All of these paths apply only to the player hero spec. Traffic, handling and city geometry are unchanged.

Full regression: 184/186 on the parallel run; the unchanged curb-drape and road-build timing
checks passed in separate reruns without relaxing limits. All three full-city ride seeds had zero contacts.
