# Artist Image Design Options

Options considered for making the artist photo more prominent in the `ArtistDialog`.

## Option A: Full-width header image (hero banner) ✅ implemented

The image spans the full width of the dialog at the top. The artist name and country overlay it via a bottom-to-top gradient (dark → transparent). The close button floats in the top-right corner of the image. Genre badge and description follow below.

Feels like a music app (Spotify-like). Very visual, makes the photo the first thing the eye lands on. Minimal structural changes required.

## Option B: Large image on the side (magazine layout)

Split the dialog into two columns: a large image on the left (~40% width, full height of the content area), with name, genre, and description on the right. Works best with portrait-oriented photos. Feels editorial.

## Option C: Oversized circle/avatar above the name

Center the image as a large rounded circle above the artist name, centered at the top of the dialog. Clean profile-card style, familiar from social media and contacts apps.

## Option D: Background blur + frosted glass overlay

Use the artist image both as a large foreground photo and as a blurred, dimmed background that fills the entire dialog. The content sits on top of a frosted glass card. Creates depth and atmosphere. More complex but very immersive.

## Option E: Horizontal image strip

A wide, short image strip (e.g. `h-40`, full width, `object-cover`) placed below a plain header bar that holds the name and close button. Simpler variation of Option A — keeps the name clearly separated from the image.
