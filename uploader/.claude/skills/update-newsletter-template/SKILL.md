---
name: update-newsletter-template
description: Invoke this skill whenever the user asks to update the newsletter template from a design image. Asks for the image path, verifies it is an image file, reads the image visually, and rewrites both HtmlEmailTemplate.txt and TextEmailTemplate.txt with subject, body, and engagement question appropriate to the new design.
---

# Update Newsletter Template from Design Image

Rewrites the Uploader's outbound newsletter templates based on a new cross-stitch design image.

## Step 1 — Ask for the image path

If the user has not already provided an image path, ask:

> "What is the full path to the design image?"

Do not proceed until you have a path.

## Step 2 — Verify it is an image

Check the file extension. Accepted extensions: `.jpg`, `.jpeg`, `.png`, `.gif`, `.bmp`, `.webp`, `.tiff`.

- If the extension is not in that list, tell the user and ask for a correct path. Do not proceed.
- If the file does not exist (Read returns an error), tell the user and ask for a correct path.

## Step 3 — Read the image

Use the Read tool on the image path. Claude Code is multimodal and will render the image for visual inspection. Identify:

- The design subject (what is depicted)
- Colors and visual style (simple/complex, palette)
- Mood or occasion (holiday, season, romantic, whimsical, etc.)
- Whether it is quick-to-stitch or a larger project

## Step 4 — Load the template rules

Invoke the `email-template-usage` skill to load the section-header requirements and HTML rules before writing any content. Do not skip this step.

## Step 5 — Write the content

Draft newsletter copy that fits the design. Guidelines:

- **Subject**: Short, curiosity-driving, includes an emoji that matches the design theme. Examples: `New free pattern: Wedding Rings 💍`, `A little spring stitch for you 🌸`.
- **BeforeImage / BeforeBody**: 2–3 short paragraphs. Open with a seasonal or emotional hook relevant to the design. Name the pattern on its own line. Describe the design in 1–2 plain sentences (colors, complexity, occasion). End with a short "who this is for" sentence.
- **AfterImage / AfterBody**: Personal tone. One practical tip or use-case (e.g. "works as a card insert", "quick weekend project"). Close with a 2-bullet engagement question asking the reader something related to the design theme. End with "Just hit Reply and tell me."
- **Closing / Signature**: Always `Ann` / `cross-stitch.com` — do not change.

Tone rules:
- Conversational, warm, first-person ("I designed this…", "I love…").
- No HTML tags outside `[ImageWithLink]` / `[Unsubscribe]` sections.
- Use emojis for visual punctuation (👉, 😊) — not decoration overload.
- No bold markdown (`**text**`) — it renders literally in email clients.

## Step 6 — Write both files

Update both files simultaneously:

- `D:\ann\Git\cross-stitch-platform\uploader\Uploader\Templates\HtmlEmailTemplate.txt`
- `D:\ann\Git\cross-stitch-platform\uploader\Uploader\Templates\TextEmailTemplate.txt`

The HTML template uses sections: `[Subject]` `[Greeting]` `[BeforeImage]` `[ImageWithLink]` `[AfterImage]` `[Unsubscribe]` `[Closing]` `[Signature]`

The text template uses sections: `[Subject]` `[Greeting]` `[BeforeBody]` `[AfterBody]` `[Unsubscribe]` `[Closing]` `[Signature]`

`[ImageWithLink]` in the HTML template must always contain:

```html
<p>
	<a href="<pattern_url>">
		<img src="<image_url>" alt="[descriptive alt text for the design]" style="max-width:150px; max-height:150px; width:auto; height:auto; border:0;"/>
	</a>
</p>
<p>
	👉 <a href="<pattern_url>">Download the free pattern</a>
</p>
```

`[BeforeBody]` in the text template mirrors `[BeforeImage]` plus appends:

```
You can download it here:
👉 <pattern_url>
```

`[Unsubscribe]` is always:

HTML: `If you prefer not to receive these emails, you can unsubscribe here:<br/>\n<unsubscribe_url>`
Text: `If you prefer not to receive these emails, you can unsubscribe here:\n<unsubscribe_url>`

## Step 7 — Remind the user

After writing, remind the user to click **"Reload Email Template"** in the Uploader before sending a test.
