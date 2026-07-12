---
name: Nordic Serenity
colors:
  surface: '#faf9f8'
  surface-dim: '#dbdad9'
  surface-bright: '#faf9f8'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#f4f3f2'
  surface-container: '#efeeed'
  surface-container-high: '#e9e8e7'
  surface-container-highest: '#e3e2e1'
  on-surface: '#1b1c1b'
  on-surface-variant: '#42474d'
  inverse-surface: '#2f3130'
  inverse-on-surface: '#f2f0ef'
  outline: '#72777e'
  outline-variant: '#c2c7ce'
  surface-tint: '#3b6282'
  primary: '#3b6282'
  on-primary: '#ffffff'
  primary-container: '#769cbf'
  on-primary-container: '#013351'
  inverse-primary: '#a4cbf0'
  secondary: '#5e5f56'
  on-secondary: '#ffffff'
  secondary-container: '#e0e0d4'
  on-secondary-container: '#62635a'
  tertiary: '#7c5723'
  on-tertiary: '#ffffff'
  tertiary-container: '#bd9056'
  on-tertiary-container: '#462a00'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#cde5ff'
  primary-fixed-dim: '#a4cbf0'
  on-primary-fixed: '#001d32'
  on-primary-fixed-variant: '#214a69'
  secondary-fixed: '#e3e3d7'
  secondary-fixed-dim: '#c7c7bb'
  on-secondary-fixed: '#1a1c15'
  on-secondary-fixed-variant: '#46483f'
  tertiary-fixed: '#ffddb6'
  tertiary-fixed-dim: '#f0be7f'
  on-tertiary-fixed: '#2a1800'
  on-tertiary-fixed-variant: '#62400c'
  background: '#faf9f8'
  on-background: '#1b1c1b'
  surface-variant: '#e3e2e1'
typography:
  display-lg:
    fontFamily: Plus Jakarta Sans
    fontSize: 48px
    fontWeight: '700'
    lineHeight: '1.2'
    letterSpacing: -0.02em
  display-lg-mobile:
    fontFamily: Plus Jakarta Sans
    fontSize: 32px
    fontWeight: '700'
    lineHeight: '1.25'
  headline-md:
    fontFamily: Plus Jakarta Sans
    fontSize: 24px
    fontWeight: '600'
    lineHeight: '1.4'
  body-lg:
    fontFamily: Plus Jakarta Sans
    fontSize: 18px
    fontWeight: '400'
    lineHeight: '1.6'
  body-md:
    fontFamily: Plus Jakarta Sans
    fontSize: 16px
    fontWeight: '400'
    lineHeight: '1.6'
  label-sm:
    fontFamily: Plus Jakarta Sans
    fontSize: 13px
    fontWeight: '500'
    lineHeight: '1.2'
    letterSpacing: 0.05em
rounded:
  sm: 0.25rem
  DEFAULT: 0.5rem
  md: 0.75rem
  lg: 1rem
  xl: 1.5rem
  full: 9999px
spacing:
  base-unit: 8px
  container-padding-mobile: 20px
  container-padding-desktop: 64px
  gutter: 24px
  section-gap: 80px
---

## Brand & Style
The design system is rooted in Scandinavian minimalism, emphasizing "Hygge"—a quality of cosiness and comfortable conviviality that engenders a feeling of contentment. It is designed for users who seek a calm, focused, and high-quality digital environment.

The aesthetic blends **Modern Minimalism** with **Organic Tactility**. It prioritizes heavy whitespace (breathing room), a soft-toned palette that avoids harsh pure whites or blacks, and a systematic approach to functional beauty. The emotional response is one of professional reliability mixed with a warm, domestic softness.

## Colors
The palette is inspired by the Nordic landscape: stone, lichen, and the pale blue of a winter sky.

- **Surface (Base):** `#E6E5E4` serves as the primary background color. It is a warm, desaturated grey that reduces eye strain compared to pure white.
- **Ink (Text & Outline):** `#25271F` is used for all typography and structural borders. It is a deep, organic charcoal with a hint of forest green, providing high contrast without the clinical feel of #000.
- **Accent (Action):** `#769CBF` is a dusty Nordic blue used for primary actions and highlights. It evokes a sense of calm and trust.

## Typography
All text in this design system is rendered in **Plus Jakarta Sans**. While the font is geometric, its soft terminals complement the Japanese character sets (Hiragana, Katakana, and Kanji) by maintaining a modern, open feel.

- **Hierarchy:** Use bold weights sparingly for headlines to maintain the "light" Nordic feel. 
- **Japanese Typesetting:** For Japanese text, ensure a `line-height` of at least `1.6` for body copy to accommodate the visual density of Kanji. Avoid justified alignment; use left-aligned text to preserve the organic rhythm of the layout.

## Layout & Spacing
The layout follows a **Fluid Grid** model with generous margins. The philosophy is "less is more"—elements should have significant space between them to prevent a cluttered "utility" appearance.

- **Desktop:** 12-column grid with 64px outer margins.
- **Mobile:** 4-column grid with 20px outer margins.
- **Vertical Rhythm:** Use multiples of 8px. Use 80px or 120px gaps between major sections to emphasize the minimalist intent. Content should be centered with a maximum readable width of 1200px.

## Elevation & Depth
This design system avoids heavy shadows in favor of **Tonal Layering** and **Subtle Outlines**.

- **Surface Tiers:** Depth is created by placing elements of a slightly lighter or darker shade of the base `#E6E5E4` on top of each other.
- **Outlines:** Use `#25271F` at 10-15% opacity for containers. This "ghost border" approach provides structure without adding visual weight.
- **Shadows:** If elevation is required (e.g., a modal), use a single, very soft, highly diffused shadow: `0 10px 30px rgba(37, 39, 31, 0.05)`.

## Shapes
The shape language is defined by **generous, soft curves**. This removes any sense of "sharpness" or "aggression" from the UI.

- **Buttons & Cards:** Utilize `rounded-2xl` (1.5rem / 24px) to create a friendly, pebble-like appearance.
- **Small Elements:** For checkboxes or small tags, scale down to `rounded-lg` (1rem / 16px).
- **Icons:** Use icons with rounded caps and joins to match the typography and corner radii.

## Components
- **Buttons:** Primary buttons use a solid `#769CBF` fill with white text. Secondary buttons use a `#25271F` outline at 20% opacity. All buttons must have a height of at least 48px to feel substantial.
- **Cards:** Cards should have no shadow; instead, use a 1px border of `#25271F` at 10% opacity. Background should be 5% lighter or darker than the base.
- **Inputs:** Text fields should be filled with a slightly lighter tint of the background, with a bottom-only border or a very subtle all-around stroke. Focus states use a 2px `#769CBF` stroke.
- **Lists:** Use generous vertical padding (16px+) between list items. Use a thin horizontal divider in `#25271F` at 5% opacity.
- **Chips/Labels:** Use a muted version of the accent color (`#BCCCDC`) with `#25271F` text for tags, ensuring they have the same `rounded-2xl` corners.