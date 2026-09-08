# Mommy-chan artwork

Generated with the built-in image generation tool for this project.

| Asset | Use |
| --- | --- |
| `src/assets/mascot/idle.png` | Neutral/ready expression; transparent master for native icons and favicon |
| `src/assets/mascot/thinking.png` | Thinking, loading, and waiting for approval |
| `src/assets/mascot/working.png` | Executing tools or editing files |
| `src/assets/mascot/happy.png` | Successful completion and completed assistant-message avatars |
| `src/assets/mascot/pouty.png` | Failed turn or connection error |

The four expression variants use a solid blush background and a circular UI crop. Small avatars remain still. The companion follows live state and respects reduced-motion preferences. Missing or failed image loads fall back to idle, then the SVG.

Native PNG/ICNS/ICO files in `src-tauri/icons/` and `public/favicon.png` were generated from the transparent idle portrait with the Tauri icon CLI. Framed-icon and simulated-transparency previews were discarded; none are used by the app.

## Original portrait prompt

Use case: stylized-concept
Asset type: original anime companion portrait for the MommyCodex desktop coding app, reused as small app avatar and a large companion illustration.
Primary request: a beautifully drawn friendly adult anime woman with soft pastel pink long flowing twin tails, rose ribbon bows, violet eyes with crisp layered iris highlights, a warm closed-mouth smile, a little rosy blush. White modest blouse with a small rose ribbon at collar and a lavender cardigan, relaxed shoulders, facing viewer. Sophisticated clean Japanese anime game portrait illustration; precise fine mauve linework, beautifully shaded glossy hair with strand details, controlled cel shading, delicate face. Warm, reassuring, quietly playful.
Composition: single centered head-and-shoulders bust, square 1024 by 1024 canvas, entire hair silhouette and shoulders fit with generous 8 percent clear margin on all sides, hair flowing just below shoulders with a clean finished lower silhouette, face takes much of center and remains readable as a 32px app icon. Symmetrical balance, slight natural head tilt. No hands.
Background: genuinely transparent alpha background; no background scene, no circle or badge, no white box, no checkerboard drawn into the image.
Color palette: blush pink hair, darker dusty rose shadows, violet eyes, cream white blouse, muted lavender cardigan.
Constraints: exactly one character, adult proportions, high quality anime illustration not a simplistic chibi or geometric drawing, no text, no watermark, no sparkles floating outside silhouette, no props, no headphones, no animal ears.

## Expression prompts

### thinking

Use case: identity-preserve.
Edit target: the attached transparent Mommy-chan portrait.
Create the thinking expression variant for this same anime desktop companion.
Change ONLY her facial expression and the very subtle head angle: Thoughtful expression: violet eyes glance slightly upward to her left, eyebrows gently lifted, lips slightly parted in a tiny thoughtful 'hmm'. A subtle inquisitive head tilt, caring and reflective.
Keep this exact same adult woman, same facial identity and adult proportions, pink twin tails, rose ribbons, violet irises, blouse, lavender cardigan, art style, fine linework, lighting, colors, image size, bust framing and silhouette. No hands, no additional props or icons, no text. Do not make her look younger.
Preserve the input image's REAL TRANSPARENT BACKGROUND and alpha channel. This is a transparent PNG character cutout, not a framed avatar tile. No opaque background, no checkerboard pattern, no canvas texture. Only the original portrait with the requested expression change.

### working

Use case: identity-preserve.
Edit target: the attached transparent Mommy-chan portrait.
Create the working expression variant for this same anime desktop companion.
Change ONLY her facial expression and the very subtle head angle: Focused expression: violet eyes look slightly downward as if concentrating on code, eyebrows subtly lowered in concentration, lips in a small confident determined smile. Calm capable attentive adult expression.
Keep this exact same adult woman, same facial identity and adult proportions, pink twin tails, rose ribbons, violet irises, blouse, lavender cardigan, art style, fine linework, lighting, colors, image size, bust framing and silhouette. No hands, no additional props or icons, no text. Do not make her look younger.
Preserve the input image's REAL TRANSPARENT BACKGROUND and alpha channel. This is a transparent PNG character cutout, not a framed avatar tile. No opaque background, no checkerboard pattern, no canvas texture. Only the original portrait with the requested expression change.

### happy

Use case: identity-preserve.
Edit target: the attached transparent Mommy-chan portrait.
Create the happy expression variant for this same anime desktop companion.
Change ONLY her facial expression and the very subtle head angle: Proud happy expression: both eyes closed in joyful curved smiles, warm bright open-mouth smile, cheeks softly blushing. Her whole face conveys delighted pride and gentle warmth.
Keep this exact same adult woman, same facial identity and adult proportions, pink twin tails, rose ribbons, violet irises, blouse, lavender cardigan, art style, fine linework, lighting, colors, image size, bust framing and silhouette. No hands, no additional props or icons, no text. Do not make her look younger.
Preserve the input image's REAL TRANSPARENT BACKGROUND and alpha channel. This is a transparent PNG character cutout, not a framed avatar tile. No opaque background, no checkerboard pattern, no canvas texture. Only the original portrait with the requested expression change.

### pouty

Use case: identity-preserve.
Edit target: the attached transparent Mommy-chan portrait.
Create the pouty expression variant for this same anime desktop companion.
Change ONLY her facial expression and the very subtle head angle: Mildly pouty concerned expression: inner eyebrows raised gently, violet eyes open looking at viewer, lips a small closed downturned pout, cheeks very slightly puffed. Cute and reassuring, only mildly disappointed, no tears or distress.
Keep this exact same adult woman, same facial identity and adult proportions, pink twin tails, rose ribbons, violet irises, blouse, lavender cardigan, art style, fine linework, lighting, colors, image size, bust framing and silhouette. No hands, no additional props or icons, no text. Do not make her look younger.
Preserve the input image's REAL TRANSPARENT BACKGROUND and alpha channel. This is a transparent PNG character cutout, not a framed avatar tile. No opaque background, no checkerboard pattern, no canvas texture. Only the original portrait with the requested expression change.

## Background finishing prompt

Applied separately to each expression with the built-in image tool:

Edit only the background of this anime portrait. Replace EVERY gray-and-white checkerboard region with one absolutely flat solid pale blush color #fdf8fc, including the holes between hair strands. Do not preserve or create transparency. This is an OPAQUE image with a solid cream-pink background. No checkerboard anywhere. Preserve the exact character, expression, face, hair, clothes, framing, dimensions and colors of the portrait unchanged. Do not add shadows or gradients or textures to the plain background.
