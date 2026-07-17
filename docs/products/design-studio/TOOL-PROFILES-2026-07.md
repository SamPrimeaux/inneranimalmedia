# Design Studio tool profiles

**Status:** Accepted · **Decision:** Migration 940

Design Studio is the product surface. It is not a synonym for Meshy, and its
default model menu must not expose every provider operation.

## Profile ownership

`agentsam_tool_profile_bindings` resolves `task_type` to a profile.
`agentsam_tool_profiles` owns the ordered menu, cap, and write policy.
`agentsam_prompt_routes` owns prompt/model routing only; its legacy
`tool_keys` and `max_tools` fields are null for bound routes.

The bounded profiles are:

- `design_studio_base`: named scene list, asset list, CAD job status.
- `cad_generation`: engine-neutral OpenSCAD, FreeCAD, or Blender generation and job controls.
- `meshy_generate`: new provider models and status.
- `meshy_transform`: operations on existing provider models and status.
- `meshy_animation`: rig, animate, and status.
- `meshy_manage`: list, status, and cancel.

`illustration_create` remains a broad Create-family intake envelope. It does not
appear in Meshy profiles and is not a substitute for provider-native operations.

## Native operation inventory

Server-backed operations registered for model use:

- `designstudio_scene_list`
- `designstudio_asset_list`
- `cad_job_status`
- `cad_job_cancel`
- `cad_generate`

The following are real Studio operations but remain browser-local because they
act on the live Three.js scene: selection, object transforms, dimensions,
materials, spawning/importing a local GLB, scene JSON export, GLB download, and
viewport capture. They must use a typed client-action bridge before becoming
model-callable. Registering inert server tools for them would misrepresent the
product.

## Walking action

The typed animation action selects `meshy_animation` when provider work is
required. If action 92 already has a ready GLB URL, the UI applies the artifact
directly and invokes neither Agent Sam nor Meshy.

The current direct apply loads the ready animated GLB into the scene. In-place
animation playback on the existing selected rig requires an `AnimationMixer`
client implementation and is a separate viewport capability.

## Legacy aliases

Legacy `meshyai_*` names remain accepted at execution boundaries through the
catalog alias resolver. Their catalog rows are inactive and hidden from model
discovery. New profiles contain canonical `meshy_*` keys only.
