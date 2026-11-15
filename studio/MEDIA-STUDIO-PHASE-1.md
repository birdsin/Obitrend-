# OBITREND Image & Video Studio — Phase 1

## Scope and delivery boundary

Added two authenticated, local-first editing workspaces to the existing /studio application:

- /studio/image-studio.html
- /studio/video-studio.html

The existing Creator Studio is preserved. The new pages are separate from image generation and the existing AI Video Creator. Uploads, edit state and exports remain in the browser; neither editor calls a generation endpoint, creates history records, writes to cloud storage or deducts image/video credits.

The dashboard shortcuts gain two additive links. Existing tool routes, pricing and account surfaces are not replaced.

## Image Studio

- Local JPG, PNG and WEBP upload; 25 MB file limit and 40-megapixel decoded-image guard.
- Live canvas preview with Original, 9:16, 4:5, 1:1, 16:9 and 5:4 framing.
- Horizontal/vertical crop positioning, 90-degree rotation and horizontal/vertical flip.
- Brightness, contrast, saturation and warmth controls.
- Six local looks: Natural, Editorial, Warm silk, Monochrome, Cinematic and Soft light.
- Text/watermark with font family, size, colour, alignment, vertical placement, weight and opacity. Font options include Playfair Display, Cormorant Garamond, Great Vibes, DM Sans, Inter, Montserrat, Oswald, Roboto Mono and Georgia.
- Before/after view, preview zoom, undo/redo and reset.
- PNG and JPEG exports (JPEG quality 92%) up to a 3000 px longest edge.
- Original uploaded image remains unchanged. The selected web font is awaited before rendering text to export; browser/system fallbacks remain available if remote fonts cannot load.

## Video Studio

- Local browser-decodable video upload, up to 200 MB.
- Playback, scrub, 0.1-second frame stepping, trim in/out and set trim points at the playhead.
- 9:16, 4:5, 1:1 and 16:9 framing with Fit/Fill.
- Brightness, contrast and saturation adjustments.
- Original clip volume/mute and an optional local audio/music track with independent volume.
- Timed title/caption overlay with font family, size, colour and position.
- Undo/redo and reset for edit settings.
- Real-time export from a canvas recording stream, mixed audio and MediaRecorder. The export resolution is 720p or 1080p (height-based); MIME type is selected only from formats the current browser reports as supported. The downloaded file uses the actual chosen extension.
- Export can be cancelled; temporary streams, audio nodes and object URLs are cleaned up.

### Honest Phase 1 limitations

This first increment edits one source clip. Multi-clip timelines, split/merge, transitions, keyframed animation, advanced audio mixing, colour curves, chroma key, masks and AI editing are not implemented yet. They are not presented as working controls.

Video export runs in real time and must remain in the foreground. Mobile browsers can throttle background tabs or restrict codecs. WebM is typical in Chromium; MP4 is used only when the browser advertises MediaRecorder support for it. If MediaRecorder, canvas capture, AudioContext or a supported codec is unavailable, export is disabled. The source video itself must be decodable by the user's browser. 1080p export can be memory-intensive on older phones; 720p is the recommended mobile setting.

## Security and preservation

- Both editor pages call the existing /supabase.js bootstrap and require an authenticated OBITREND session before showing the workspace.
- No server upload, external editing API, AI inference, gallery/history write or generation request.
- No credit, entitlement, pricing, Paystack, Monnify, database, secret, environment or Vercel project-setting changes.
- Existing /video, video-ui.js, /api/generate-video, /api/video-status, /api/video-credits.js, payment flows and separate video-second wallet are untouched.
- The existing 20 fashion tools and 35-tool Studio registry are untouched.
- Only the Studio static entry page receives an additive dashboard-shortcut injector; the existing dashboard content and routes remain.

## Files added/changed

Added:
- studio/media-studio.css
- studio/image-studio.html
- studio/image-studio.js
- studio/video-studio.html
- studio/video-studio.js
- studio/MEDIA-STUDIO-PHASE-1.md

Changed:
- studio/index.html — adds authenticated-dashboard shortcuts to the two new editor pages.

## Verification

- node --check studio/image-studio.js — passed.
- node --check studio/video-studio.js — passed.
- HTML parser check — 46 unique IDs in Image Studio and 49 unique IDs in Video Studio; all literal JavaScript DOM references resolve; no duplicate IDs.
- git diff --check — passed.
- Headless Chromium smoke tests at 390×844 and 1280×900 with an authenticated-session fixture:
  - Image upload, 9:16 crop framing, crop-position adjustment, brightness, font selection, text overlay and PNG export passed. PNG was 2400×3000 for the 4:5 export before changing ratio.
  - JPEG export decoded successfully at 2400×3000.
  - Video upload, trim in/out, 9:16 preview, caption font, local MediaRecorder export and download passed.
  - Video export decoded successfully in Chromium at 1280×720 for the 16:9 720p setting; the trimmed output was approximately 1.45 seconds for the 0.2–1.8 second trim range.
  - No horizontal overflow at either tested viewport and no browser page errors in the smoke test.
- The repository package.json has no application build/test scripts and the deployed Studio tree is a compiled static bundle, so no source-framework build was claimed. Actual Android device testing, production-account verification and testing through the protected Vercel staging login remain for owner review.

