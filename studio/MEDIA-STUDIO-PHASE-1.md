# OBITREND Image & Video Studio â€” Phase 1

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
- Original uploaded image remains unchanged. The selected web font is a¶»§q«^