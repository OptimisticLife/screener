# Apple Design System — App-Wide UI Implementation

Redesign and implement the entire application using **Apple's current Human Interface Guidelines (HIG) and Apple Design Resources as the primary design reference**.

The goal is not to make the app merely "look Apple-like". The goal is to establish a **consistent, production-quality Apple-inspired design system across the entire application**, with careful attention to small details, including hairline separators, spacing, typography, component states, iconography, surfaces, hierarchy, and interaction behavior.

## 1. Primary Design References

Use Apple's official design resources as the source of truth:

- Apple Human Interface Guidelines:
  https://developer.apple.com/design/human-interface-guidelines/
- Apple Design Resources:
  https://developer.apple.com/design/resources/
- SF Symbols:
  https://developer.apple.com/sf-symbols/

Do not blindly copy individual screenshots. Extract the underlying design principles and apply them consistently throughout the application.

If the platform is web/React, adapt Apple's principles appropriately rather than pretending the app is a native iOS application.

---

# 2. Establish a Central Design System First

Before modifying individual screens, inspect the existing application and create a centralized design system.

Create reusable design tokens for:

### Colors

Define semantic colors rather than hardcoding colors throughout components.

Examples:

- background
- secondary background
- elevated surface
- primary text
- secondary text
- tertiary text
- separator
- opaque separator
- accent
- destructive
- success
- warning
- disabled
- focus

Support light and dark themes if the existing architecture allows it.

Never scatter arbitrary hex values throughout the application.

---

# 3. Typography

Use Apple's typography philosophy and hierarchy.

Prefer the platform system font where appropriate.

For web:

```css
font-family:
  -apple-system, BlinkMacSystemFont, "SF Pro Display", "SF Pro Text", system-ui,
  sans-serif;
```

Create semantic typography tokens such as:

- Large Title
- Title
- Title 2
- Title 3
- Headline
- Body
- Callout
- Subheadline
- Footnote
- Caption
- Caption 2

Pay attention to:

- font size
- font weight
- line height
- letter spacing
- truncation
- wrapping
- hierarchy

Do not use unnecessarily bold typography.

Apple's visual hierarchy should come primarily from **scale, weight, spacing and color**, not excessive decoration.

---

# 4. Spacing & Layout

Create a consistent spacing system.

Do not randomly choose margins and paddings on individual components.

Use a spacing scale and apply it consistently.

Prioritize:

- generous whitespace
- clean alignment
- predictable content margins
- consistent vertical rhythm
- clear grouping
- visual breathing room

Avoid cramped interfaces.

Avoid unnecessary cards inside cards.

Avoid excessive containers and borders.

---

# 5. Hairline Separators — IMPORTANT

Pay special attention to **hairline separators**.

Do NOT omit subtle separators simply because they are visually small.

Every place where Apple-style UI would establish separation should be evaluated.

Examples:

- list rows
- grouped settings
- navigation sections
- menus
- dropdowns
- table-like content
- cards where appropriate
- modal sections
- sidebars
- toolbars
- headers
- footers
- form groups

Use a dedicated semantic token:

```text
separator
```

and, where necessary:

```text
opaqueSeparator
```

For web interfaces, use the thinnest visually appropriate separator.

Consider device pixel ratio and rendering behavior.

For example, where appropriate:

```css
border-bottom: 0.5px solid var(--separator);
```

Do not blindly apply borders to everything.

Apple-style interfaces distinguish between:

- content that needs grouping
- content that needs separation
- content that needs elevation
- content that needs no visual boundary

**Inspect every component and decide intentionally whether a hairline, spacing, background change, or no separator is appropriate.**

Never overlook small UI details because they appear insignificant.

---

# 6. Components

Build or refactor reusable components instead of styling each screen independently.

At minimum, establish consistent implementations for:

- Button
- IconButton
- TextField
- SearchField
- TextArea
- Select
- Dropdown
- Checkbox
- Radio
- Toggle
- Slider
- Tabs
- Segmented Control
- Navigation
- Sidebar
- Toolbar
- Card
- List
- ListItem
- Avatar
- Badge
- Tooltip
- Popover
- Menu
- Modal
- Dialog
- Bottom Sheet
- Toast
- Alert
- Empty State
- Loading State
- Skeleton
- Progress Indicator
- Table
- Form
- Date/Time controls where applicable

Every component must have consistent:

- spacing
- typography
- radius
- borders
- hairlines
- icons
- hover state
- active state
- pressed state
- focus state
- disabled state
- loading state
- error state
- success state

Do not create one-off versions of the same component for different screens.

---

# 7. Corner Radius

Use a restrained and consistent radius system.

Create semantic radius tokens such as:

```text
small
medium
large
extraLarge
pill
```

Do not randomly mix 4px, 7px, 11px, 13px, 16px, 20px, etc.

The radius should communicate hierarchy.

Avoid excessive "everything is a pill" styling.

---

# 8. Shadows & Elevation

Apple generally uses subtle elevation rather than heavy Material-style shadows.

Avoid:

- large dark shadows
- excessive glow
- multiple stacked shadows
- overly dramatic floating cards

Use elevation only when it communicates hierarchy.

Prefer:

```text
surface
border/hairline
subtle shadow
```

in that order of preference.

---

# 9. Icons

Use a consistent icon system.

Prefer **SF Symbols-inspired iconography** where actual SF Symbols cannot be used.

Icons should have:

- consistent stroke/weight
- consistent optical size
- consistent alignment
- appropriate spacing from labels

Do not mix unrelated icon libraries without a clear reason.

Do not use emojis as UI icons.

Do not use icons merely for decoration.

Every icon should communicate meaning or interaction.

---

# 10. Buttons

Buttons should have clear hierarchy.

Establish semantic variants such as:

```text
Primary
Secondary
Tertiary
Destructive
Icon
Text
```

Avoid making every action a large filled button.

Primary actions should stand out.

Secondary actions should remain visually quieter.

Destructive actions should be clearly distinguishable without becoming visually aggressive.

---

# 11. Forms

Forms should feel calm and structured.

Use:

- clear labels
- appropriate spacing
- subtle separators where useful
- clear focus states
- inline validation
- helpful error messages
- disabled states
- loading states

Do not rely solely on color to communicate errors.

Avoid unnecessarily heavy input borders.

---

# 12. Lists & Settings-Style Interfaces

Lists are especially important.

Use Apple's approach to:

- row height
- leading/trailing alignment
- labels
- secondary information
- accessory controls
- disclosure indicators
- section headers
- section spacing
- separators

For list rows, ensure:

```text
leading content
    ↓
primary content
    ↓
secondary content
    ↓
trailing accessory
```

is consistently aligned.

Hairline separators should normally align appropriately with the content hierarchy rather than being placed randomly across the entire screen.

---

# 13. Surfaces & Materials

Use layered surfaces rather than excessive cards.

Establish semantic surface levels such as:

```text
background
secondaryBackground
surface
elevatedSurface
overlay
```

Use translucent/material-like effects only where they genuinely improve hierarchy.

Do not add blur or glass effects everywhere.

If implementing Apple's newer Liquid Glass-inspired aesthetic, use it selectively for:

- navigation
- floating controls
- toolbars
- overlays
- prominent contextual controls

Do not turn the entire application into glass.

---

# 14. Navigation

Navigation should be simple and predictable.

Maintain consistent:

- navigation hierarchy
- active states
- selected states
- back behavior
- tabs
- sidebars
- headers
- toolbar actions

Do not create different navigation patterns for different parts of the app without a strong UX reason.

---

# 15. Motion & Interaction

Animations should feel:

- subtle
- fast
- smooth
- purposeful

Use motion to communicate:

- entering/exiting
- hierarchy
- state changes
- expansion/collapse
- selection
- feedback

Avoid:

- excessive bouncing
- unnecessary animations
- slow transitions
- decorative motion

Respect reduced-motion preferences.

---

# 16. Accessibility

Follow Apple's accessibility philosophy.

Ensure:

- sufficient contrast
- keyboard accessibility
- visible focus
- semantic HTML where applicable
- accessible labels
- appropriate touch/click targets
- screen-reader support
- reduced motion support
- meaningful error messages

Do not sacrifice accessibility for visual similarity.

---

# 17. Responsive Design

The design system must work across:

- desktop
- tablet
- mobile

Do not simply scale the desktop UI down.

Adapt:

- navigation
- spacing
- content width
- component density
- layout
- controls
- typography

based on screen size.

---

# 18. Visual Consistency Audit

After implementation, inspect **every screen and every reusable component**.

Look specifically for:

- missing separators
- inconsistent hairlines
- inconsistent spacing
- inconsistent font sizes
- inconsistent font weights
- inconsistent icon sizes
- inconsistent radii
- random colors
- excessive borders
- excessive shadows
- inconsistent button heights
- inconsistent input heights
- inconsistent alignment
- duplicated components
- one-off styling
- missing hover/focus/active/disabled states
- poor dark-mode behavior
- unnecessary visual noise

Fix these systematically.

---

# 19. Do Not Overdesign

Apple's design language is NOT:

- lots of gradients
- giant shadows
- excessive rounded cards
- huge typography everywhere
- excessive glass effects
- colorful UI everywhere
- unnecessary animations
- decorative icons
- borders around every component

The desired result is:

**Calm + clean + precise + spacious + functional + premium.**

Every visual element should have a purpose.

---

# 20. Engineering Requirements

Keep the implementation maintainable.

Do not:

- duplicate styles unnecessarily
- hardcode values repeatedly
- create screen-specific versions of common components
- introduce unnecessary dependencies
- rewrite working business logic just for visual changes
- break existing functionality

Separate:

```text
Design Tokens
↓
Primitive Components
↓
Composite Components
↓
Page/Screen Components
```

Existing functionality must continue to work.

---

# 21. Final Quality Gate

Before considering the implementation complete, perform a final **Apple Design System audit** across the entire application.

Ask for every screen:

1. Is the typography hierarchy consistent?
2. Is spacing consistent?
3. Are colors semantic?
4. Are separators/hairlines present where appropriate?
5. Are hairlines subtle enough?
6. Are component states complete?
7. Are icons consistent?
8. Are controls aligned?
9. Are borders being overused?
10. Are shadows being overused?
11. Are surfaces properly layered?
12. Is the interface visually calm?
13. Does the hierarchy feel obvious?
14. Does the UI work in dark mode?
15. Does it work responsively?
16. Is keyboard/accessibility behavior correct?
17. Are there any one-off components that should use the shared design system?
18. Are there any tiny visual inconsistencies that break the overall system?

**Do not stop at the major components. Inspect the small details.**

The final result should feel like a **single coherent design system**, not a collection of individually styled screens.

## Most Important Principle

> **Do not merely make the application look like Apple. Build the application with the same level of attention to hierarchy, consistency, spacing, typography, subtle separators, interaction states, accessibility, and visual restraint that makes Apple's interfaces feel polished.**
