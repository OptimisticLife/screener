# Dark Theme Refinement — Apple-Inspired Financial UI

Refine the CURRENT application's dark theme based on the attached screenshot.

IMPORTANT:
Do NOT redesign the application from scratch.
Do NOT change the information architecture, table structure, column structure, navigation behavior, data, or business logic.

The current application is a stock/market screener. Preserve its professional financial-terminal character and information density.

The goal is:

    Current Financial Screener
              +
    Apple's dark-mode visual principles
              =
    Premium, clean, restrained financial UI

Use Apple's Human Interface Guidelines as the visual philosophy, but adapt them to a dense financial/data application.

---

1. PRIMARY PROBLEM TO FIX

---

The current UI relies too heavily on near-pure black surfaces.

Currently the interface visually feels like:

    #000000
    #000000
    #000000
    #000000

with thin grid lines separating everything.

This makes the entire screen feel flat and slightly harsh.

Introduce subtle SURFACE HIERARCHY.

The user should be able to distinguish:

    Application background
        ↓
    Navigation surface
        ↓
    Content surface
        ↓
    Table header
        ↓
    Table rows
        ↓
    Selected / hovered row
        ↓
    Popovers / menus / dialogs

without relying on thick borders or heavy shadows.

---

2. DARK COLOR FOUNDATION

---

Create centralized semantic dark-theme tokens.

Use these as starting points, NOT as immutable values:

    --dark-background: #000000;
    --dark-surface: #1C1C1E;
    --dark-surface-secondary: #1C1C1E;
    --dark-surface-tertiary: #2C2C2E;
    --dark-elevated: #2C2C2E;

    --dark-text-primary: rgba(255,255,255,0.92);
    --dark-text-secondary: rgba(255,255,255,0.60);
    --dark-text-tertiary: rgba(255,255,255,0.38);

    --dark-separator: rgba(255,255,255,0.10);
    --dark-separator-strong: rgba(255,255,255,0.16);

    --dark-accent: #007AFF;

Do NOT blindly apply these colors everywhere.

The important thing is semantic hierarchy.

---

3. PAGE BACKGROUND

---

Keep the main application background very dark.

However, do not make every child component #000000.

Recommended hierarchy:

    Main application
        → deepest/darkest

    Navigation
        → slightly elevated

    Content area
        → subtle surface difference

    Table
        → mostly integrated into content

    Dropdown / Popover / Modal
        → clearly elevated

The differences should be subtle.

The user should feel the hierarchy rather than immediately notice different colored rectangles.

---

4. NAVIGATION BAR

---

Refine the top navigation.

Current navigation is visually very dark and heavy.

Keep the existing structure.

Improve it using:

- slightly elevated background
- stronger primary text
- quieter inactive items
- subtle active-state treatment
- restrained blue accent
- subtle bottom hairline

Active navigation should be obvious but not loud.

Avoid large glowing blue backgrounds.

Avoid excessive pills.

Use Apple's principle:

    selected = subtle surface + accent

rather than:

    selected = giant bright colored container

---

5. TABLE — DO NOT MAKE IT LOOK LIKE A GRID

---

The table is the most important part of this application.

Preserve the dense financial-table layout.

However, reduce the feeling of a spreadsheet/grid.

Current:

    |     | SYMBOL | PRICE | CHG | VOL | CAP |
    |-----|--------|-------|-----|-----|-----|
    |     | RELIANCE ...                         |
    |-----|-------------------------------------|

The vertical grid lines are currently too visually prominent.

Make vertical separators much more subtle.

Use stronger visual separation only where it improves readability.

Prefer:

    spacing
    + typography
    + alignment
    + subtle hairlines

over:

    many visible borders

---

6. TABLE ROW HAIRLINES

---

Keep row separators.

They are useful for a financial screener.

But make them extremely subtle.

Use the semantic separator token.

Example:

    border-bottom: 0.5px solid var(--dark-separator);

where browser rendering supports it.

Do NOT use bright gray borders.

Do NOT use:

    #333
    #444
    #555

as generic borders.

The separator should almost disappear when the user is not consciously looking for it.

However:

IMPORTANT:
Do NOT remove all hairlines.

Every row should remain visually scannable.

---

7. VERTICAL COLUMN SEPARATORS

---

Audit all vertical separators.

Do not remove them completely because this is a financial data table.

Instead:

- make them significantly quieter than horizontal row separators
- keep them only where they help column tracking
- avoid creating a visible grid
- avoid equal visual weight between every line

The eye should primarily follow:

    SYMBOL → PRICE → CHG → VOL → MKT CAP → PERIOD RETURNS

rather than seeing a grid of boxes.

---

8. TABLE HEADER

---

Improve the table header hierarchy.

Header text should be:

- smaller
- muted
- slightly tracked
- clearly distinct from row values

Active/sorted column should use the accent color.

For example:

    MKT CAP ↓

can remain blue.

But avoid making the entire column blue.

Only the active sorting indicator/header needs strong accent emphasis.

---

9. STOCK SYMBOLS

---

Primary stock symbols should remain strong.

Example:

    RELIANCE
    BHARTIARTL
    HDFCBANK

Use primary text.

Company names underneath should use secondary/tertiary text.

The hierarchy should be:

    SYMBOL
    Company name

not:

    SYMBOL
    Company name

both at equal brightness.

This distinction is important.

---

10. NUMBERS

---

Financial values need excellent readability.

Preserve tabular alignment.

Use consistent numeric typography.

Positive values:

    restrained green

Negative values:

    restrained red

Do NOT make every percentage excessively bright.

Color should communicate financial meaning, but typography should still carry most of the hierarchy.

Avoid neon green/red.

---

11. GREEN / RED COLORS

---

The current red/green treatment is visually strong.

Tone it down slightly while preserving immediate financial meaning.

Positive:

    clean system-like green

Negative:

    clean system-like red

Do not use glowing colors.

Do not add backgrounds behind every positive/negative number.

The numbers themselves can carry the semantic color.

Use stronger emphasis only where the value is particularly important.

---

12. HOVER STATE

---

Add/refine row hover behavior.

A hovered row should receive a VERY subtle surface change.

Example concept:

    normal row
        → transparent / base surface

    hover
        → slightly elevated surface

Do NOT use:

    bright blue row
    bright gray row
    thick outline

The hover state should feel like the row gently comes forward.

---

13. SELECTED STATE

---

If rows can be selected, use:

    subtle elevated surface
    +
    restrained accent indicator

Avoid thick blue borders around the entire row.

---

14. SEARCH COLUMN

---

The search/icon column at the left should feel integrated.

Keep the search icon subtle.

On hover/focus:

    slightly brighter icon
    subtle accent/focus treatment

Do not introduce a large button background unless interaction requires it.

---

15. STAR / BOOKMARK ICONS

---

Keep icons visually quiet.

Inactive:

    tertiary gray

Hover:

    secondary gray

Active:

    accent or appropriate semantic color

Do not use unnecessarily thick icon strokes.

Keep icon sizing consistent across the entire application.

---

16. TYPOGRAPHY

---

Move typography closer to Apple's system typography philosophy.

Prefer:

    -apple-system,
    BlinkMacSystemFont,
    "SF Pro Text",
    "SF Pro Display",
    system-ui,
    sans-serif

where appropriate.

Create a clear hierarchy:

    Page title
    Section title
    Column heading
    Primary value
    Secondary value
    Metadata

Avoid excessive font weights.

Do not make every heading bold.

---

17. SPACING

---

Do NOT dramatically increase row height.

This is a financial screener and information density matters.

Instead, make spacing more intentional.

Maintain:

- compact row height
- consistent vertical alignment
- consistent column padding
- clear separation between navigation/content/table header

The UI should feel dense but not cramped.

---

18. SURFACE HIERARCHY

---

Use surfaces strategically.

Example:

    BODY
    #000000

    NAVIGATION
    very slightly elevated

    TABLE HEADER
    subtle surface difference

    HOVERED ROW
    subtle elevation

    POPOVER
    elevated surface

    MODAL
    elevated surface + overlay

Do not turn every table row into a card.

Do not add individual backgrounds to every row.

---

19. BORDERS

---

Reduce unnecessary borders.

Audit every:

    border
    border-bottom
    border-right
    outline

Ask:

    "Does this line actually help the user understand the data?"

If yes:
keep it subtle.

If no:
remove it.

Never compensate for removing borders by adding shadows everywhere.

---

20. SHADOWS

---

Use almost no shadows for normal table content.

Only elevated UI should potentially have a subtle shadow.

For example:

    dropdown
    popover
    modal

The table itself should NOT look like a collection of floating cards.

---

21. DARK THEME TEXT HIERARCHY

---

Do not use pure #FFFFFF for everything.

Use semantic levels:

    Primary
        ~90-95%

    Secondary
        ~60%

    Tertiary
        ~40%

    Disabled
        ~25-30%

Adjust based on actual readability.

Examples:

SYMBOL:
primary

Company name:
secondary/tertiary

Column header:
secondary

Timestamp:
secondary

Inactive navigation:
secondary

Very low-priority metadata:
tertiary

---

22. ACCENT BLUE

---

The existing blue accent is useful.

Keep it.

But make it a SYSTEM ACCENT rather than a decorative color.

Use it primarily for:

- active navigation
- active sort
- links
- focus
- selected controls
- important interactive elements

Do not add blue everywhere.

---

23. DO NOT COPY IOS LITERALLY

---

This is critical.

This is a financial web application.

Do NOT turn it into:

    iOS Settings
    iPhone UI
    giant rounded cards
    oversized mobile controls
    excessive glass effects

Instead use Apple's underlying design principles:

    clarity
    hierarchy
    restraint
    typography
    spacing
    subtle surfaces
    precise alignment
    semantic colors
    subtle hairlines

while retaining professional financial-data density.

---

24. LIQUID GLASS

---

Do NOT apply Liquid Glass to the entire application.

If appropriate, reserve glass/translucency for:

- floating controls
- popovers
- contextual navigation
- floating toolbars

The stock table itself should remain highly readable and relatively opaque.

---

25. RESPONSIVENESS

---

Do not sacrifice the table's information density merely to imitate Apple's spacious interfaces.

On smaller screens:

- prioritize important columns
- allow horizontal scrolling where appropriate
- preserve readable numbers
- maintain consistent spacing

Do not simply shrink everything until it becomes unreadable.

---

26. IMPLEMENTATION REQUIREMENTS

---

Before changing styles:

1. Inspect the existing theme architecture.
2. Identify existing CSS variables/design tokens.
3. Reuse the existing design system if one exists.
4. Consolidate duplicate colors.
5. Create semantic dark-theme tokens.
6. Update shared components rather than individual pages.
7. Avoid changing application/business logic.

Do not introduce unnecessary dependencies.

Do not rewrite functional components purely for styling.

---

27. FINAL VISUAL AUDIT

---

After implementation, inspect EVERY visible part of the screenshot/application.

Specifically audit:

[ ] Navigation background
[ ] Active navigation
[ ] Inactive navigation
[ ] Navigation hairline
[ ] Page background
[ ] Section title
[ ] Table header
[ ] Table header hairline
[ ] Horizontal row hairlines
[ ] Vertical column separators
[ ] Search icon
[ ] Star icons
[ ] Stock symbols
[ ] Company names
[ ] Price values
[ ] Positive values
[ ] Negative values
[ ] Market cap
[ ] Period returns
[ ] Hover state
[ ] Selected state
[ ] Scrollbar
[ ] Dropdowns
[ ] Popovers
[ ] Modals
[ ] Tooltips
[ ] Loading states
[ ] Empty states

Look specifically for:

- random dark grays
- inconsistent separators
- overly bright borders
- missing hairlines
- excessive vertical lines
- excessive shadows
- excessive pure-white text
- inconsistent icon colors
- inconsistent font weights
- inconsistent surface levels
- accidental light-theme colors
- overly bright red/green
- unnecessary rounded containers

---

28. SUCCESS CRITERIA

---

The final UI should feel like:

    Bloomberg/Trading terminal
                 +
    Apple's visual discipline

NOT:

    Generic dark dashboard
    Material dark theme
    Gaming dashboard
    Pure black spreadsheet
    iOS Settings clone

The user should notice:

    better depth
    better hierarchy
    calmer colors
    cleaner separators
    better typography
    improved readability
    more polished interactions

without immediately noticing that the application was completely redesigned.

MOST IMPORTANT:

Preserve the existing functionality and information density.

Refine the visual system rather than replacing the product.

Every tiny detail matters:
hairlines, separator opacity, column alignment, icon weight, text hierarchy, hover states, surface differences, and spacing.

Do not stop after changing the main background color.

Perform the complete component-level dark-theme audit before finishing.
