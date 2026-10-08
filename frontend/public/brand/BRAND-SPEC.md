# Kourtly brand specification

## Wordmark
- Typeface: Plus Jakarta Sans (SIL OFL), converted to vector outlines in every SVG, no font install needed
- Weight: Bold 700
- Case: lowercase, "kourtly"
- Tracking: -0.02em (pair kerning on)

## Colours (flat, no gradients)
| Role | HEX |
|---|---|
| Deep teal: stem, cork, wordmark, app-icon background | #0F464B |
| Cream: K stem and cork on dark | #E8F3F0 |
| Blades on light backgrounds (gold, aqua, teal, coral) | #E3A92B  #34B8A6  #1F8A8A  #E8663D |
| Blades on dark backgrounds (yellow, mint, turquoise, coral) | #F4EC9B  #8FE0C0  #3CC4B5  #FF9E6B |
| Monochrome | #000000 / #FFFFFF |

## Dimensions
- Lockup: viewBox 260.78 x 73.76 (aspect 3.536:1), SVG 1043 x 295. PNG 720 x 204 and 1440 x 407 (transparent).
- Mark: viewBox 68.69 x 73.76 (aspect 0.931:1), SVG 275 x 295. PNG 477 x 512 (transparent).
- Small marks: 24 x 24 and 16 x 16 viewBox, pixel-aligned stem.
- Clear space: x = cork diameter (about 1/3 of mark height). Keep x free on all four sides.
- Minimum size: lockup 32px tall (113px wide, about 30 mm in print). Master mark 32px tall. Below that use kourtly-mark-24 (24px) or kourtly-mark-16 (16px).

## Favicon
favicon.svg (tile, dedicated small-size geometry) plus favicon.ico (16/32/48) and favicon-16/32/48.png. Never use the master mark for 16 px.

## PWA
manifest.webmanifest lists icon-192/512 (purpose any) and icon-maskable-192/512 (purpose maskable). theme_color and background_color #0F464B. Maskable artwork is inside the 80 percent safe circle. apple-touch-icon.png is a 180 px opaque square.

## Which asset where
| Place | Asset |
|---|---|
| Desktop navbar (light) | logo/kourtly-logo.svg at 32-40px tall |
| Desktop navbar (dark) | logo/kourtly-logo-on-dark.svg |
| Mobile navbar | mark/kourtly-mark.svg at 28-32px tall |
| Favicon | favicon/favicon.svg, favicon/favicon.ico fallback |
| PWA | pwa/icon-*.png, pwa/icon-maskable-*.png, manifest.webmanifest |
| Login screen | logo/kourtly-logo.svg on light, logo/kourtly-logo-on-dark.svg on #0F464B |
| Splash / loading | mark/kourtly-mark-on-dark.svg centred on #0F464B (matches manifest background) |
| Dark background | logo/kourtly-logo-on-dark.svg (colour) or logo/kourtly-logo-dark.svg (white mono) |
| Light background | logo/kourtly-logo.svg (colour) or logo/kourtly-logo-light.svg (black mono) |

## Naming
-light = artwork for light backgrounds, -dark = artwork for dark backgrounds. Those two are single-path monochrome (black / white). -on-dark is the full-colour version for dark backgrounds.

## Next.js
- App Router: copy favicon.ico to app/favicon.ico, favicon.svg to app/icon.svg, apple-touch-icon.png to app/apple-icon.png, and serve manifest.webmanifest from app/manifest.ts or public/.
- Or place the folder at public/brand/ and reference /brand/... paths (manifest already uses them).
