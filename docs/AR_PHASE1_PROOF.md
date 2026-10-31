# AR Phase 1: one controlled flat-artwork proof

> Historical calibration checkpoint. For the current Supabase-backed, automatic
> multi-artwork pipeline and Android checklist, use [AR_GALLERY.md](AR_GALLERY.md).
> The emulator commands and old measurement-only scope below are historical;
> they are not prerequisites for the current application. Firebase is retired.

This is an uncommitted development-only proof on the existing
`/artworks/:artworkId/ar` route. It is not a marketplace rollout or a
production asset service. Physical-device verification is still required.

## Prepared development fixture (2026-09-17)

The current emulator had no published artwork suitable for this proof. With
owner authorization, a clearly labelled calibration print was created only in
`demo-artvault`. Its **assigned physical print size is 300 x 200 mm, no frame**;
these are explicit design dimensions, not measurements inferred from pixels or
an assertion about an owner's original artwork. Compare it with a tape-marked
300 x 200 mm rectangle on the wall tomorrow. If printing, verify the resulting
paper dimensions with a ruler; do not trust a printer's fit-to-page setting.

- Artwork: `ar-dev-calibration-300x200-v1`; image: `front.png`.
- Artist projection: `ar-dev-calibration-artist-v1`, visibly a development fixture.
- Zero inventory, not for sale; no Auth user, seller application, or claims created.
- The fixture-only `developmentFixture` marker is not AR readiness or a schema
  change for real artworks. No existing account/artwork was changed. Never copy
  these fixture documents into a production project.
- Operator files, generated assets, browser screenshots and verification reports
  remain ignored under `ar-proof.local/`; none go into `public/` or a production build.
- Source SHA-256: `08277cb89df84137461309433058b631a81f28b12b948b9acb16f26f4e03886c`.
- GLB SHA-256: `fe6e7274b64832d178339788af923c9a51048f19d656420f20131be2ceb2ea44`.
- GLB: **57,428 bytes**, embedded 900 x 600 JPEG, 0.300 x 0.200 m XY plane,
  zero depth, front normal +Z. Float32 rounding is below 0.000001 m.

Reproduce with the existing persistent emulators and one Vite server running:

```powershell
Set-Location 'C:\Users\bm440\Desktop\ARTVAULT_WEB\artvault'
node scripts/prepare-ar-fixture.mjs --demo-artvault-only
npm.cmd run ar:prepare -- ar-proof.local/selection.json
node scripts/verify-ar-proof.mjs
node scripts/verify-ar-browser.mjs
```

The fixture helper uses fixed loopback endpoints and a fixed demo project. It
refuses a conflicting selection, unrelated existing documents, changed source
bytes, or a fixture that is no longer published. It creates only its dedicated
fixture records/image and never clears emulator data. Source media uses the
existing token-bearing artwork download mechanism; rules remain unchanged.
The AR middleware separately rechecks publication and source bytes on every read.

Asset verification checks deterministic regeneration, geometry/UVs, embedded
texture bytes, both hashes, live route delivery, raw-file denial and stale-manifest
rejection/restoration. Browser verification uses installed desktop Chrome through
its debugging protocol, not an XR emulator: actual GLB rendering, lazy loading,
unsupported-device wording, navigation, failure/retry and all seven requested
viewports. Screenshots include the viewer after scrolling the app container.
An observed retry bug in model-viewer 4.3.1 was fixed by evicting only the failed
source on disposal; recreating an element alone had retained the failed GLTF.

Desktop/browser verification is complete on Chrome 152.0.7977.83. Camera tracking,
wall placement, real size accuracy and native handoff are not established by it.

Final local checks: generator/boundary 28/28; focused frontend 37/37; full
frontend 1301/1301 across 153 files, one worker, exit 0; typecheck, lint and
production build exit 0. Lint warnings and the existing large production chunk
warning remain. Browser load measured 4.35 s on the final local run; this is not
a phone performance claim. Model-viewer's Lit development warnings remain;
the deliberate network-failure test logs its expected fetch error.

The fixture currently exists in the running emulator. Automatic approval review
rejected the existing `checkpoint:emulators` command because promotion may
overwrite previous checkpoints, so it did not execute and no new persistent
snapshot is claimed. If the fixture is absent after an emulator restart, rerun
the fixed-demo fixture command above; it will not overwrite unrelated data.
Generated files and reports remain on disk independently of emulator state.

## Select and prepare an owner-supplied artwork instead

The owner/operator must supply one published development artwork ID, its
front-facing image ID, measured width/height in whole millimetres, and whether
the rectangle includes its frame. No measurements are inferred. The selected
image must depict exactly that rectangle: its oriented pixel aspect ratio must
equal the supplied physical aspect ratio. A mismatch stops generation; the tool
does not stretch or crop the image automatically.

Create `ar-proof.local/selection.json` in the repository root with these fields:

```json
{
  "artworkId": "REPLACE_WITH_EXISTING_ID",
  "imageId": "REPLACE_WITH_EXISTING_IMAGE_ID",
  "widthMm": null,
  "heightMm": null,
  "includesFrame": false
}
```

Replace both nulls with actual measurements (1–10000 mm) and set includesFrame
to match the image. Read the image ID from the artwork's existing images array
in the local Firestore emulator; do not edit the artwork document for this proof.
With the existing persistent development emulators running, execute:

```powershell
npm.cmd run ar:prepare -- ar-proof.local/selection.json
```

The operator command reads only from demo-artvault Firestore/Storage on
127.0.0.1:8080/9199. It uses anonymous reads, not Admin credentials. It creates
`ar-proof.local/<sha256>.glb` and `manifest.json`. Existing `*.local` ignore rules
exclude this folder. Neither file belongs in public/ or source control.

The GLB is a front-facing XY plane with width/height converted from mm to metres,
an embedded JPEG texture, and no invented thickness. Orientation is normalised;
the texture is reduced to at most 2048 pixels per side, JPEG quality 85, with
transparent pixels flattened onto white. Use an opaque photograph for this
proof. Source input is limited to 10 MB/25 megapixels and output to 5 MB.
Identical inputs with the pinned toolchain produce identical bytes/hash.
Generation runs once per operator invocation, never in the shopper browser.

## Trust and access

The local manifest is operator-owned metadata, separate from seller fields.
No Firestore schema, Storage rules, Functions, credentials, or persistence
configuration changes are required. The Vite development middleware checks the
current published artwork, selected image path and source hash on every manifest
and model request. Missing/private/rejected/suspended/changed artwork, offline
emulators, and corrupt assets fail closed. Raw local files are denied through
Vite's filesystem server; responses use no-store. The page rechecks readiness
every 15 seconds and on focus. Previously downloaded native-viewer assets cannot
be remotely recalled.

Only the selected artwork can activate the proof, and only in Vite development
with the demo-artvault emulator environment. Production builds keep the existing
informational fallback. Do not expose the development emulators to the internet.

## Viewer and platform limits

The shared wrapper lazy-loads model-viewer 4.3.1. It requests wall placement and
fixed model scale, shows loading/error/retry states, and offers a real launch
action only after the model loads and model-viewer reports an eligible AR path.
Eligibility is not proof that the phone can complete a session.

Android uses WebXR first and Scene Viewer second. Desktop/unsupported browsers
get labelled 3D and image previews. iOS Quick Look is deliberately disabled:
USDZ generation, wall orientation, and fixed-size behaviour have not been proven.
No camera overlay or synthetic placement is implemented.

Unmount removes listeners/timers/model elements and ends this viewer's active
WebXR session. The cleanup adapter uses a pinned model-viewer renderer symbol;
dependency upgrades must recheck that contract. Native viewers own their own
session and exit controls.

## Android physical test

1. The calibration proof above is already prepared. Reuse it; do not substitute
   an owner's artwork or dimensions without explicit selection and measurements.
2. Reuse the existing Vite server and persistent emulators. If Vite is not running,
   run `npm.cmd run dev` once. Confirm its actual port (normally 5173).
   If USB forwarding cannot reach an IPv6-only localhost listener, stop only the
   existing Vite process and restart it with `npm.cmd run dev -- --host 127.0.0.1`.
   Do not start a duplicate server or restart the persistent emulators.
3. On an ARCore-compatible Android phone, enable USB debugging, connect USB, and
   accept the debugging prompt. Use current Chrome and Google Play Services for AR.
4. In PowerShell, use the installed Android platform tools:

```powershell
$arAdb = "$env:LOCALAPPDATA\Android\Sdk\platform-tools\adb.exe"
& $arAdb devices
& $arAdb shell getprop ro.product.model
& $arAdb shell getprop ro.build.version.release
& $arAdb shell dumpsys package com.android.chrome | Select-String 'versionName='
& $arAdb shell dumpsys package com.google.ar.core | Select-String 'versionName='
& $arAdb reverse tcp:5173 tcp:5173
& $arAdb reverse tcp:8080 tcp:8080
& $arAdb reverse tcp:9199 tcp:9199
& $arAdb reverse tcp:9099 tcp:9099
```

5. Open `http://localhost:5173/artworks/ar-dev-calibration-300x200-v1/ar` on the phone. Localhost
   supplies a trustworthy browser origin; port forwarding also preserves the
   app's existing loopback emulator endpoints. Do not use a plain LAN HTTP URL
   for WebXR. Native Scene Viewer must also be able to retrieve that model URL;
   localhost handoff remains a physical-device test, not a claimed success.
6. Check the 3D image orientation and supplied measurements. Tap **View in your
   space**, grant camera permission, scan a well-lit textured wall, and place it.
   Compare width/height against a ruler/tape on the wall. Check that resizing is
   disabled, move/reposition, exit, navigate away, and return. Record phone/OS,
   Chrome version, launch path, tracking errors, and measured size error.
7. Test permission denial, unsupported browser, offline asset loading, and retry.
   Check narrow screens (302/320, 350×515, 390) and tablet/desktop widths.
8. Test the Scene Viewer fallback separately on eligible Android hardware. Check
   wall orientation and scale there too; WebXR success does not prove native
   handoff success. iPhone/iPad should show the labelled preview without an AR
   launch button in this phase.

   To explicitly exercise Scene Viewer, connect desktop Chrome's
   `chrome://inspect/#devices` to the phone tab, open its console and run:

   ```js
   document.querySelector('model-viewer').setAttribute('ar-modes', 'scene-viewer')
   ```

   Wait for capability detection and tap **View in your space** on the phone if
   offered. This selects a real native path; it does not override capability
   detection or simulate success. Reload the tab afterward to restore WebXR-first
   behavior. If native handoff cannot fetch the localhost asset, record that
   failure; do not expose the emulators publicly or claim fallback passed.
9. Record initial model-load time and launch-to-placement time, wall detection
   reliability, visible jitter/drift, and width/height error in mm and percent.
   Compare against a taped 300 x 200 mm rectangle at several viewing distances;
   check the TOP/LEFT/RIGHT labels, reposition three times, and confirm pinch does
   not resize the AR model. Orbit/zoom in desktop 3D preview is camera movement,
   not a change to the model's physical dimensions.
10. Exit/re-enter AR, navigate to artwork/artist and back, and verify the camera
    session ends. Deny camera permission once and check recovery after allowing
    it. Record WebXR and Scene Viewer results separately, including unsupported
    paths rather than counting them as passes.

Record tomorrow's result:

| Check | Actual result |
| --- | --- |
| Phone / Android / Chrome / Google Play Services for AR versions | Pending |
| Model load / launch-to-placement time | Pending |
| Camera permission and denial recovery | Pending |
| Wall detection, vertical orientation and correct front image | Pending |
| Measured width/height and error against 300 x 200 mm | Pending |
| Fixed scale, repositioning, stability/drift | Pending |
| Exit, re-entry and navigation cleanup | Pending |
| Scene Viewer handoff, wall placement and scale | Pending |
| Owner physical-device approval | Pending |

Approval requires a successful physical wall test and a measured size comparison
of the prepared calibration proof (or an explicitly selected measured artwork).
Software fixtures and desktop rendering alone are not physical AR proof.
Ordering, payment, inventory, production hosting, broader artwork eligibility,
seller dimension editing, automated processing, and iOS USDZ are deferred.
