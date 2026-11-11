---
name: hatch-svg-pet
description: Design a static SVG companion for dsh-pet-manager from a user's character description.
---

Create one complete SVG from the user's character description. Use a transparent background and `viewBox="0 0 128 128"`. Keep the complete character inside the canvas and reserve a little space below its feet.

Allowed elements: `svg`, `g`, `path`, `circle`, `ellipse`, `rect`, `line`, `polyline`, `polygon`, `title`, `desc`.
Use static geometric attributes, colors, opacity, transforms, fill and stroke. Do not use scripts, event handlers, style attributes, CSS, external resources, images, use, foreignObject, filters, gradients, animation or url(). Include `xmlns="http://www.w3.org/2000/svg"`.

The manager handles idle, running, waiting, completed and failed animation through its own renderer. Do not generate frames or bake animation into the SVG.

Return the full SVG in a code block and a short name and description. The user can paste it into DSH Settings → 迷你界面和伙伴 → 创建伙伴 → SVG 编辑. Do not claim the pet was imported unless an actual import was observed.
