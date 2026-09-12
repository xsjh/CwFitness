# CwFitness One-page Welcome Experience

## Status

Ready for implementation after user confirmation.

## Intent

Create a public, Chinese-language welcome experience for CwFitness. It should use the long-scroll narrative pacing and section hierarchy of the Outpace Framer reference, adapted to the real CwFitness product rather than its coaching business model.

## Audience and conversion

- Audience: people who want a structured, private way to plan, record, and review their own training.
- Primary conversion: free registration / sign-in.
- Secondary conversion: navigate to the product-method section on the same page.
- Authenticated users continue straight into the workout workspace.

## Information architecture

The page follows the reference's complete one-page storytelling rhythm:

1. Sticky navigation and a large hero with one primary CTA.
2. A product-purpose introduction that frames CwFitness as a calm training system.
3. Alternating feature sections covering planning, completing a Workout Session, and reviewing Plan Progress.
4. A methodology / product-principles section in place of coaching credentials.
5. A dark fitness-image gallery / showcase.
6. A horizontally moving principles carousel in place of fabricated testimonials.
7. Three "Planning / Training / Progress" cards in place of commercial pricing tiers; no prices, discounts, or invented entitlements.
8. FAQ and a final conversion section.

## Content integrity

- Use existing product language: Workout Plan, Workout Day, Workout Session, and Plan Progress.
- Do not claim active-member counts, coaching credentials, measurable results, testimonials, or payment plans without source data.
- Use three dark fitness-themed placeholder images for the initial product visual locations. They are not product screenshots and must be clearly decorative.

## Visual language

- Deep graphite-green base, desaturated fitness photography, and a restrained warm yellow-green accent.
- System typography with large, tightly tracked display type and comfortable body leading.
- Apple-inspired translucent hierarchy: substantial sections use a heavier material; controls and chips use lighter material. Do not stack light glass on light glass.
- Use the supplied liquid-glass edge treatment for key glass surfaces. It combines a low-opacity background, 4px backdrop blur, inset highlight, and a masked vertical gradient edge.

## Motion and accessibility

- Scroll uses native browser behavior; no scroll hijacking, forced full-page panels, or synthetic scroll inertia.
- Sections reveal as they enter the viewport through transform/opacity motion, with occasional restrained depth/parallax and a horizontally translating principles strip.
- Interactive motion is interruptible and uses compositor-friendly properties only.
- Pressable elements have immediate, subtle press feedback.
- `prefers-reduced-motion` replaces spatial motion with short opacity transitions.
- `prefers-reduced-transparency` and `prefers-contrast: more` keep text and controls legible.

## Acceptance checks

- The public root route presents the one-page experience and routes its CTA into the existing authentication flow.
- Desktop and mobile layouts preserve narrative order, clear CTA hierarchy, keyboard focus, and responsive typography.
- The page contains no invented commercial or social-proof claims.
- The visual system applies liquid glass sparingly and maintains contrast over image content.
