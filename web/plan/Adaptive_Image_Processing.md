# Smart Image Type Detection

## Background

The editor currently performs very well on photographs.

However, one of the first real users tested a completely different type of input:

- decorative quote
- black & white artwork
- stylized fonts
- line art
- small illustration

This highlighted an important observation.

Not every input image should be processed using the same algorithm.

The editor should gradually become intelligent enough to recognize what kind of image it is processing.

---

# Long-Term Vision

Instead of having a single conversion pipeline, I'd like the editor to identify the image type first and then choose an appropriate workflow.

For example:

- Photograph
- Illustration
- Logo
- Line Art
- Quote / Typography
- Coloring page
- Sketch

Different image types have different goals.

---

# Why This Matters

A photograph should preserve color transitions.

A logo should preserve clean edges.

A quote should preserve readability.

A line drawing should preserve thin lines.

Trying to optimize all of these with one algorithm is unlikely to produce the best results.

---

# Quote / Typography Mode

The attached user example illustrates a typical problem.

It combines:

- decorative text
- line art
- small illustration
- black & white graphics

A photo conversion algorithm is not the right tool for this type of image.

Instead, the editor should eventually recognize that the primary goal is readability rather than photographic accuracy.

---

# Possible Future Pipeline

This is **not** intended as an implementation specification.

Please treat it as product direction.

Possible processing steps might include:

1. Detect image type.

2. Detect whether the image contains significant text.

3. Estimate whether the text can remain readable at the requested stitch size.

4. If not:

   - recommend a larger pattern size;
   - or suggest a typography-oriented conversion mode.

5. Apply processing appropriate for line art rather than photographs.

---

# Intelligent Guidance

One thing I would particularly like to avoid is silent failure.

Instead of producing a poor result, I'd rather the editor explain why.

Examples:

"This image contains very small decorative text."

"At the selected size some letters may become unreadable."

"Consider increasing the pattern size."

"This image appears to be line art rather than a photograph."

Good guidance creates trust.

---

# This Is Not About AI

The goal is not to add another AI feature.

The goal is to make the editor feel intelligent.

Users should gradually feel that the editor understands what they are trying to create.

---

# Future Possibilities

This direction may eventually lead to specialized modes such as:

- Photo Mode
- Line Art Mode
- Quote / Typography Mode
- Logo Mode
- Watercolor Mode

Those decisions can be made later.

For now I'd simply like the editor architecture to make this evolution possible.

---

# Please Use Your Own Judgment

You know the existing architecture much better than I do.

Please think about the cleanest long-term design.

If there is a better architectural approach than the one described here, I would much rather use that.

The important idea is not a specific implementation.

The important idea is that different kinds of images deserve different conversion strategies.