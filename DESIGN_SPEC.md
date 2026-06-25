# Project Tracker — Design Specification

> This file is the single source of truth for the visual design and UI patterns used in the app.
> It is derived directly from the working HTML prototype (`tracker/Project Tracker.html`).
> When in doubt, match the prototype exactly.

---

## 1. Design Philosophy

- **Dense but breathable** — data-heavy app with a tool-like feel. Rows are compact, whitespace is intentional, not decorative.
- **System-first** — UI chrome (sidebar, topbar, table headers) recedes so data is the focus.
- **Monospace for data** — all IDs, codes, dates, and numbers use `IBM Plex Mono`. Everything else uses `IBM Plex Sans`.
- **Role-aware** — PM fields are always visually distinct (amber tint). Coordinator-only UI is neutral. Never mix the two silently.
- **Feedback is instant** — every action (lock, save, export, delete) triggers a toast. Nothing happens silently.

---

## 2. Typography

| Token | Value |
|---|---|
| `--font-sans` | `"IBM Plex Sans", system-ui, sans-serif` |
| `--font-mono` | `"IBM Plex Mono", ui-monospace, monospace` |

**Load via Google Fonts:**
```
https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@400;500;600;700&family=IBM+Plex+Mono:wght@400;500;600&display=swap
```

### Usage rules
- Body text: `IBM Plex Sans` 14px, weight 400
- Labels, meta, secondary text: 11.5–12.5px, weight 500–600
- Page titles (`<h1>`): 22px, weight 700, `letter-spacing: -0.01em`
- Section headers: 13.5px, weight 600
- Uppercase labels: 10.5–11.5px, weight 700, `letter-spacing: 0.04–0.05em`
- Task IDs, site codes, invoice numbers: `IBM Plex Mono` 11.5–13px
- Financial figures, quantities, dates: `IBM Plex Mono`, `font-variant-numeric: tabular-nums`
- Apply `-webkit-font-smoothing: antialiased` on `body`

### Utility classes (Tailwind equivalents)
- `.mono` → `font-family: var(--font-mono); font-feature-settings: "tnum" 1`
- `.num`  → `font-family: var(--font-mono); font-variant-numeric: tabular-nums`

---

## 3. Color Tokens

All colors are defined as CSS custom properties on `:root`.

### Backgrounds & surfaces
```css
--bg:        #f5f6f8   /* page background */
--surface:   #ffffff   /* cards, inputs, modals */
--surface-2: #fafbfc   /* table headers, subtle offset surfaces */
--sidebar:   #0e1726   /* sidebar dark background */
--sidebar-2: #16213a   /* sidebar hover / secondary */
```

### Text
```css
--ink:   #0f172a   /* primary text */
--ink-2: #475569   /* secondary / label text */
--ink-3: #94a3b8   /* placeholder / disabled / meta */
```

### Borders
```css
--line:   #e6e8ec   /* card borders, input borders */
--line-2: #eef0f3   /* table row dividers, very subtle separators */
```

### Accent (Blue — primary interactive color)
```css
--accent:     #2563eb
--accent-ink: #1d4ed8   /* hover / pressed */
--accent-bg:  #eff5ff   /* selected row background, focus ring fill */
```

### Semantic colors
```css
/* Status: Done */
--green:    #16a34a
--green-bg: #e8f6ed

/* Status: Assigned / links / info */
--blue:     #2563eb
--blue-bg:  #e7effd

/* Status: Cancelled / errors */
--red:      #dc2626
--red-bg:   #fdeaea

/* Warnings / PM fields / missing data */
--amber:    #b45309
--amber-bg: #fdf3e3

/* Inactive / locked / neutral */
--slate:    #64748b
--slate-bg: #eef1f5
```

### Additional semantic colors (used for coordinator avatars, charts)
- Eslam Morsy (EM): `#2563eb`
- Ahmed Helal (AH): `#7c3aed`
- Mostafa Zaki (MS): `#0d9488`
- Khaled Rashad (KH, inactive): `#64748b`
- Vendor Huawei: `#e11d48`
- Vendor Ericsson: `#0e7490`
- Purple accent (reports/value): `#7c3aed`

---

## 4. Shape & Elevation

```css
--radius:    10px   /* cards, modals, dropdowns */
--radius-sm: 7px    /* buttons, inputs, badges */

--shadow-sm: 0 1px 2px rgba(15,23,42,.06), 0 1px 1px rgba(15,23,42,.04);
--shadow:    0 4px 14px rgba(15,23,42,.08), 0 1px 3px rgba(15,23,42,.06);
--shadow-lg: 0 18px 50px rgba(15,23,42,.18), 0 4px 12px rgba(15,23,42,.10);
```

- Cards: `background: var(--surface); border: 1px solid var(--line); border-radius: var(--radius)`
- Modals and dropdowns use `--shadow-lg`
- Buttons use `--shadow-sm` only on `.primary`

---

## 5. Scrollbars (custom, all browsers)

```css
::-webkit-scrollbar { width: 11px; height: 11px; }
::-webkit-scrollbar-thumb {
  background: #cdd3db;
  border-radius: 8px;
  border: 3px solid transparent;
  background-clip: content-box;
}
::-webkit-scrollbar-thumb:hover { background: #b4bcc7; background-clip: content-box; }
::-webkit-scrollbar-track { background: transparent; }
```

---

## 6. Core UI Components

### 6.1 Buttons

**Base `.btn`**
```css
display: inline-flex; align-items: center; gap: 7px;
height: 34px; padding: 0 14px;
border-radius: var(--radius-sm); border: 1px solid var(--line);
background: var(--surface); color: var(--ink);
font-size: 13px; font-weight: 600; font-family: inherit;
transition: all .12s ease; white-space: nowrap;
```
- Hover: `border-color: #d2d7de; background: var(--surface-2)`
- Icons inside buttons: size 14–16px, gap 7px

**Variants:**
- `.btn.primary` → `background: var(--accent); border-color: var(--accent); color: #fff; box-shadow: var(--shadow-sm)` — hover: `background: var(--accent-ink)`
- `.btn.ghost` → `border-color: transparent; background: transparent` — hover: `background: #eef1f5`
- `.btn.sm` → `height: 28px; padding: 0 10px; font-size: 12px`
- `.btn:disabled` → `opacity: 0.5; cursor: not-allowed`

**Icon-only `.icon-btn`**
```css
display: inline-flex; align-items: center; justify-content: center;
width: 34px; height: 34px;
border-radius: var(--radius-sm); border: 1px solid var(--line);
background: var(--surface); color: var(--ink-2);
transition: all .12s ease;
```
- Hover: `background: var(--surface-2); color: var(--ink); border-color: #d2d7de`

---

### 6.2 Inputs & Selects

**Base `.input` / `.select`**
```css
height: 34px; width: 100%; padding: 0 10px;
border-radius: var(--radius-sm); border: 1px solid var(--line);
background: var(--surface); color: var(--ink);
font-family: inherit; font-size: 13px;
outline: none; transition: border-color .12s, box-shadow .12s;
```
- Focus: `border-color: var(--accent); box-shadow: 0 0 0 3px var(--accent-bg)`
- Placeholder: `color: var(--ink-3)`

**Field label wrapper `.field`** (use as `<label className="field">`)
```css
display: flex; flex-direction: column; gap: 5px;
```
- Label text `.lbl`: `font-size: 11.5px; font-weight: 600; color: var(--ink-2); letter-spacing: .01em`
- Required marker `.req`: `color: var(--red); margin-left: 2px`

---

### 6.3 Segmented Control `.seg`

```css
display: inline-flex; background: #eef1f5; border-radius: 8px; padding: 3px; gap: 2px;
```
- Segment button: `border: none; background: transparent; padding: 5px 11px; border-radius: 6px; font-size: 12.5px; font-weight: 600; color: var(--ink-2); transition: all .12s`
- Active `.on`: `background: var(--surface); color: var(--ink); box-shadow: var(--shadow-sm)`

Used for: layout toggles (Overview/Command, Table/Compact/Grouped), view switches.

---

### 6.4 Badge `.badge`

```css
display: inline-flex; align-items: center; gap: 6px;
padding: 2px 9px; border-radius: 999px;
font-size: 12px; font-weight: 600; line-height: 18px; white-space: nowrap;
```

**Status badge** (includes colored dot):
- Done: `color: var(--green); background: var(--green-bg)` + dot `background: var(--green)`
- Assigned: `color: var(--blue); background: var(--blue-bg)` + dot `background: var(--blue)`
- Cancelled: `color: var(--red); background: var(--red-bg)` + dot `background: var(--red)`

Dot: `width: 6px; height: 6px; border-radius: 50%`

**Acceptance badge**: `color: var(--amber); background: var(--amber-bg)`

**Coordinator chip** (avatar + name):
- Avatar: `width: 22px; height: 22px; border-radius: 6px; background: coord.accent; color: #fff; font-size: 10.5px; font-weight: 700`
- Mini variant: `width: 20px; height: 20px`

---

### 6.5 Keyboard shortcut `.kbd`

```css
font-family: var(--font-mono); font-size: 11px;
padding: 1px 6px; border-radius: 5px;
background: #eef1f5; border: 1px solid var(--line); color: var(--ink-2);
```

---

### 6.6 Card `.card`

```css
background: var(--surface); border: 1px solid var(--line); border-radius: var(--radius);
```

No shadow by default — elevation is communicated via border. Add `box-shadow: var(--shadow-lg)` for floating cards (modals, notification dropdowns).

---

### 6.7 Modal

- Backdrop: `position: fixed; inset: 0; z-index: 80; background: rgba(15,23,42,.38); backdrop-filter: blur(2px)`
- Container: `.card` with `max-width: 100%; max-height: 90vh; overflow: auto; box-shadow: var(--shadow-lg)`
- Default width: 560px
- Close on: Escape key, backdrop click
- Entrance animation: `.scale-in`

---

### 6.8 Drawer (right-side panel)

- Slides in from the right: `transform: translateX(0)` ↔ `translateX(100%)`
- Transition: `0.26s cubic-bezier(.3,.9,.3,1)`
- Default width: 540px; max-width 94vw
- Backdrop: `rgba(15,23,42,.34)`, opacity transition `0.22s`
- z-index: 70
- Structure: header (fixed) → scrollable body (flex: 1; overflow: auto) → footer (fixed)

---

### 6.9 Toast Notifications

Position: `fixed; top: 18px; right: 18px; z-index: 200`
Stack direction: column, gap 9px

Single toast:
```css
display: flex; align-items: center; gap: 10px;
padding: 11px 15px; border-radius: var(--radius); /* .card */
border-left: 3px solid [type-color];
min-width: 240px; max-width: 360px;
box-shadow: var(--shadow-lg);
```

Types:
- `success` → `var(--green)` + check icon
- `error` → `var(--red)` + close icon
- `warning` → `var(--amber)` + warn icon
- `info` → `var(--blue)` + check icon

Auto-dismiss after 3.2s. Entrance animation: `.scale-in`.

---

### 6.10 Animations

```css
/* Page fade-in — use on page-level containers */
.fade-in { animation: fadeIn .22s ease both; }
@keyframes fadeIn {
  from { opacity: 0; transform: translateY(4px); }
  to   { opacity: 1; transform: none; }
}

/* Component pop-in — use on dropdowns, modals, toasts */
.scale-in { animation: scaleIn .16s cubic-bezier(.2,.8,.2,1) both; }
@keyframes scaleIn {
  from { opacity: 0; transform: scale(.97); }
  to   { opacity: 1; transform: none; }
}
```

Sidebar collapse transition: `width .22s cubic-bezier(.3,.9,.3,1)`
Drawer slide transition: `transform .26s cubic-bezier(.3,.9,.3,1)`
All other transitions: `all .12s ease` (buttons, inputs)

---

## 7. Icon System

All icons are inline SVG strokes. Size defaults to 18px, strokeWidth 1.7, strokeLinecap "round", strokeLinejoin "round".

| Name | Path |
|---|---|
| `dashboard` | `M3 13h8V3H3v10Zm0 8h8v-6H3v6Zm10 0h8V11h-8v10Zm0-18v6h8V3h-8Z` |
| `tasks` | `M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01` |
| `add` | `M12 5v14M5 12h14` |
| `import` | `M12 3v12m0 0 4-4m-4 4-4-4M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2` |
| `reports` | `M3 3v18h18M8 16V9m5 7V5m5 11v-4` |
| `settings` | gear with 6 spokes (see `ui.jsx` source for full path) |
| `search` | `M21 21l-4.3-4.3M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16Z` |
| `lock` | `M5 11h14v10H5V11Zm2 0V7a5 5 0 0 1 10 0v4` |
| `unlock` | `M5 11h14v10H5V11Zm2 0V7a5 5 0 0 1 9.5-2` |
| `bell` | `M18 8a6 6 0 1 0-12 0c0 7-3 9-3 9h18s-3-2-3-9M13.7 21a2 2 0 0 1-3.4 0` |
| `download` | `M12 3v12m0 0 4-4m-4 4-4-4M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2` |
| `edit` | `M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5Z` |
| `trash` | `M3 6h18M8 6V4h8v2m-9 0v14a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2V6` |
| `warn` | `M12 9v4m0 4h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z` |
| `check` | `M20 6 9 17l-5-5` |
| `close` | `M18 6 6 18M6 6l12 12` |
| `chevDown` | `M6 9l6 6 6-6` |
| `chevRight` | `M9 6l6 6-6 6` |
| `chevLeft` | `M15 6l-6 6 6 6` |
| `filter` | `M3 4h18l-7 8v7l-4-2v-5L3 4Z` |
| `rows` | `M3 5h18M3 12h18M3 19h18` |
| `grid` | `M3 3h8v8H3V3Zm10 0h8v8h-8V3ZM3 13h8v8H3v-8Zm10 0h8v8h-8v-8Z` |
| `layers` | `M12 2 2 7l10 5 10-5-10-5Zm10 12-10 5L2 14` |
| `calendar` | `M3 6a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6Zm0 4h18M8 2v4M16 2v4` |
| `tag` | `M3 3h7l11 11-7 7L3 10V3Zm4 4h.01` |
| `logout` | `M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4m7 14 5-5-5-5m5 5H9` |
| `arrowRight` | `M5 12h14m0 0-6-6m6 6-6 6` |
| `refresh` | `M3 12a9 9 0 0 1 15-6.7L21 8M21 3v5h-5M21 12a9 9 0 0 1-15 6.7L3 16m0 5v-5h5` |
| `user` | `M20 21a8 8 0 1 0-16 0M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z` |
| `users` | (two-person group, see `ui.jsx`) |
| `database` | `M12 8c4.4 0 8-1.3 8-3s-3.6-3-8-3-8 1.3-8 3 3.6 3 8 3Zm8 1c0 1.7-3.6 3-8 3s-8-1.3-8-3m16 5c0 1.7-3.6 3-8 3s-8-1.3-8-3M4 5v12M20 5v12` |
| `calc` | `M5 3h14v18H5V3Zm3 4h8M8 11h2m3 0h2M8 15h2m3 0h2M8 19h2` |
| `copy` | `M9 9h10v10H9V9Zm-4 6H3V3h12v2` |

Usage in JSX/HTML:
```jsx
<svg width={size} height={size} viewBox="0 0 24 24"
  fill="none" stroke="currentColor"
  strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round">
  <path d={ICON_PATHS[name]} />
</svg>
```

---

## 8. App Shell Layout

### Overall structure
```
┌─────────────────────────────────────────────────┐
│  Sidebar (230px collapsed: 56px)  │  Main area   │
│                                   │  ┌──────────┐│
│  Brand mark                       │  │ Topbar   ││
│  Nav items                        │  │ 52px     ││
│  Coordinator status strips        │  ├──────────┤│
│  User footer                      │  │ Page     ││
│                                   │  │ content  ││
│                                   │  │          ││
└─────────────────────────────────────────────────┘
```

Root layout: `display: flex; height: 100vh; overflow: hidden`

---

### 8.1 Sidebar

**Expanded width:** 230px — **Collapsed width:** 56px  
**Background:** `var(--sidebar)` (`#0e1726`)  
**Text:** `#cdd5e1`  
**Transition:** `width .22s cubic-bezier(.3,.9,.3,1)` on the sidebar element  
**Overflow:** `hidden` (text simply clips during transition)

**Brand mark (top)**
- Padding: `20px 18px 18px` (collapsed: `18px 11px`)
- Logo icon: 34×34px, `border-radius: 9px; background: var(--accent)`; layered icon in white
- App name: `font-weight: 700; font-size: 14.5px; color: #fff; letter-spacing: -0.01em`
- Subtitle: `font-size: 10.5px; color: #7c8aa0; letter-spacing: .02em` → "Telecom Infrastructure"

**Nav items**
- Padding: `8px 12px` (collapsed: `8px 8px`)
- Each item: `width: 100%; display: flex; align-items: center; gap: 12px; padding: 9px 12px; border-radius: 8px; font-size: 13.5px; margin-bottom: 2px`
- Active: `background: rgba(37,99,235,.18); color: #fff; font-weight: 600`
- Active left-edge indicator: `position: absolute; left: 0; width: 3px; height: 20px; background: var(--accent); border-radius: 0 2px 2px 0`
- Inactive: `color: #aeb9c9; font-weight: 500`
- Inactive hover: `background: rgba(255,255,255,.06)`
- Badge (task count or notification): `min-width: 18px; height: 18px; border-radius: 9px; color: #fff; font-size: 10.5px; font-weight: 700`
  - Import badge: `background: var(--accent)`
  - Task count badge: `background: #f59e0b`

**Nav items list:**
1. Dashboard (icon: `dashboard`)
2. All Tasks (icon: `tasks`) — badge: count of Assigned tasks
3. Add Tasks (icon: `add`)
4. Import (icon: `import`) — badge: pending import count
5. Reports (icon: `reports`)
6. Settings (icon: `settings`)

**Coordinator status strip (visible when expanded)**
- Border-top: `1px solid rgba(255,255,255,.07)`
- Padding: `12px 16px`
- Section label: `font-size: 10.5px; font-weight: 700; letter-spacing: .05em; color: #576880; text-transform: uppercase; margin-bottom: 9px`
- Per coordinator row: avatar (22×22px, `border-radius: 6px`) + first name + done/total count + mini progress bar
- Progress bar: `width: 34px; height: 5px; border-radius: 3px; background: #1e2d42` (track) — fill: coordinator accent color
- Inactive coordinators: `opacity: 0.45`

**User footer (bottom)**
- Border-top: `1px solid rgba(255,255,255,.07)`
- Padding: `13px 16px` (collapsed: `12px 8px`)
- Avatar: 30×30px, `border-radius: 8px; background: #2e4266; color: #9db8da`
- Name: `font-size: 12.5px; font-weight: 600; color: #d0daea`
- Role: `font-size: 10.5px; color: #576880`
- Logout icon button: `color: #576880`

---

### 8.2 Topbar

**Height:** 52px  
**Background:** `var(--surface)`  
**Border-bottom:** `1px solid var(--line)`  
**Padding:** `0 20px`  
**Layout:** `display: flex; align-items: center; gap: 14px`

Contents (left → right):
1. **Sidebar toggle** — `.icon-btn`, icon: `rows`, size 17
2. **Breadcrumb** — `flex: 1`
   - "PM Console" in `var(--ink-3)`, 13px
   - `›` chevron icon, size 14
   - Current page name in `var(--ink)`, 13px, weight 600
3. **Search input** — width 240px, height 34px, left padding 32px (for icon), placeholder "Quick search…"
   - Magnifier icon at `left: 10px; top: 10px`
   - `⌘K` kbd badge at right: 8px
   - Focusing navigates to Tasks page
4. **Notifications bell** — `.icon-btn`, size 18
   - Unread dot: `position: absolute; top: 7px; right: 7px; width: 7px; height: 7px; border-radius: 4px; background: #ef4444; border: 2px solid #fff`
   - Notification dropdown: `.card.scale-in`, `position: absolute; top: 42px; right: 0; width: 310px; z-index: 40`
   - Each notification: 30×30px icon container (`border-radius: 8px; background: color+'18'`) + label + subtitle
5. **Export button** — `.btn.sm`, icon: `download`, size 14

---

## 9. Page Specifications

### 9.1 Dashboard

**Layout:** full-width content area, `padding: 26px`, `max-width: 1320px; margin: 0 auto`  
**Entrance:** `.fade-in` on the root div

**Page header**
- Title: `h1` 22px, weight 700, letter-spacing -0.01em
- Subtitle: `color: var(--ink-2); font-size: 13px` — last updated timestamp
- Layout toggle (right): "LAYOUT" label + `.seg` with Overview/Command options

**Two layout modes:**

*Overview layout (default):*
```
Row 1: [KPI] [KPI] [KPI] [KPI]         → 4-column grid, gap 16px
Row 2: [Status donut] [Monthly trend]   → 1fr + 1.25fr, gap 16px
Row 3: [By Coord] [By Region] [Vendor]  → 3-column, gap 16px
Row 4: [LMP/Ctr bar] [Data Quality]     → 1.4fr + 1fr, gap 16px
```

*Command layout:*
```
Left col (300px): 4 KPIs stacked
Right col (1fr):
  Row 1: [Status] [Vendor]         → 2-col
  Row 2: [Trend]                   → full width
  Row 3: [By Coord] [By Region]    → 2-col
  Row 4: [LMP/Ctr] [Data Quality]  → 1.4fr + 1fr
```

**KPI card**
```
Padding: 16px 18px; display: flex; flex-direction: column; gap: 10px
Header row: label (12px, weight 600, ink-2) + icon container (30×30px, border-radius 8px, color+'14' bg)
Value: 27px, weight 700, IBM Plex Mono, line-height 1
Footer: trend arrow (▲▼ + %) in green/red + description text, 11.5px
```

**Chart card wrapper**
```
Padding: 18px; gap 16px
Header: title (13.5px, weight 600) + optional action (right)
```

**Donut chart** (pure CSS SVG)
- Default size: 150px; thickness: 22px
- Track: `stroke: #eef0f3`
- Segments drawn with `stroke-dasharray` + `stroke-dashoffset`
- Rotated `-90deg` at SVG level (starts at 12 o'clock)
- Center label: 25px, weight 700; center sub: 11px, `var(--ink-3)`

**Bar row** (horizontal bar chart row)
- Grid: `92px 1fr 64px`, gap 12px
- Label: 12.5px, ink-2, truncated
- Bar track: `background: #eef0f3; height: 9px; border-radius: 6px`
- Bar fill: `transition: width .5s cubic-bezier(.3,.9,.3,1)`
- Value label: Mono, 12.5px, weight 600, right-aligned

**Mini line chart** (SVG area chart)
- Uses `preserveAspectRatio="none"` — stretches to container width
- Area fill: linear gradient from `color + 0.18 opacity` to transparent
- Line: `strokeWidth 2`, rounded caps
- Data points: filled circles, radius 2.4

**Data Quality card**
- Clickable rows linking to filtered task list
- Each row: label + amber badge with count + chevron right
- Border-bottom between rows: `var(--line-2)`

---

### 9.2 All Tasks

**Layout:** full-height flex column, `position: relative` (for floating bulk bar)

**Page header** (`padding: 20px 26px 0`)
- Title + subtitle (task count + total EGP value)
- Right: layout toggle `.seg` (rows/grid/layers icons) + Export button + Add Tasks `.btn.primary`

**Filters bar** (below header)
- Search input: `flex: 0 0 280px`; left magnifier icon
- Filter selects: Status, Region, Coordinator, Vendor — `width: auto; min-width: 110px`
- Quick filter select: Locked only / Missing price / Done no acceptance
- Spacer (`flex: 1`)
- PM fields toggle button: active state → `background: var(--amber-bg); border-color: #f3d9a8; color: var(--amber)`

**Table area** (`padding: 16px 26px 26px`)
- Card wrapper: `flex: 1; overflow: hidden; display: flex; flex-direction: column`

**Three view layouts:**

#### Table view (comfortable)
- Row height: 46px
- TH: `font-size: 11.5px; font-weight: 600; letter-spacing: .01em; padding: 11px 12px`
- TH background: `#fafbfc` (coordinator cols) / `var(--amber-bg)` (PM cols)
- PM column header text: `var(--amber)`
- TD: `padding: 0 12px`
- Row hover: `background: #f7f9fc`
- Selected row: `background: var(--accent-bg)`
- Locked row: `background: #fbfbfc`

#### Compact view
- Row height: 34px; font-size: 12.5px
- TH/TD padding reduced: `8px 10px` / `0 10px`

#### Grouped by site view
- Cards per physical site, sorted by task count descending
- Site header row: `background: #fafbfc; padding: 11px 16px; border-bottom: 1px solid var(--line)`
  - `layers` icon + site code (Mono, weight 600) + task count badge + done/open counts + total value
- Task rows: grid `26px 150px 1fr 110px 96px 100px 110px`, gap 12px

**Table columns (coordinator columns):**

| Column | Key | Width | Notes |
|---|---|---|---|
| ID # | `id` | 168px | Mono 11.5px + coordinator accent left-bar (4px wide, 16–20px tall) |
| Physical Site | `physicalSite` | 110px | Mono |
| Region | `region` | 78px | |
| TX/RF | `txrf` | 64px | |
| Vendor | `vendor` | 90px | |
| Task Name | `taskName` | 150px | |
| Line Item | `lineItemCode` | 96px | Mono, system-critical |
| Contractor | `contractor` | 120px | + warn icon if missing price |
| Act Qty | `actualQty` | 72px | Mono, right-aligned |
| Total (EGP) | `newTotalPrice` | 112px | Mono, right-aligned; `—` in amber if null |
| Status | `status` | 104px | StatusBadge |
| Done Date | `doneDate` | 100px | Mono ink-2; `—` in ink-3 if empty |

**PM columns** (amber header background, `#fffdf8` cell background when unselected):

| Column | Key | Width |
|---|---|---|
| Acceptance | `acceptance` | 110px |
| PO Status | `poStatus` | 120px |
| VF Invoice # | `vfInvoice` | 120px |
| LMP Portion | `lmpPortion` | 110px |
| Ctr Portion | `contractorPortion` | 110px |

**Row checkbox** (custom)
- Size: 17×17px; border-radius: 5px
- Unchecked: `border: 1.5px solid #cbd2db; background: #fff`
- Checked: `border-color + background: var(--accent)` + white check icon

**Lock icon on rows**
- Size: 13px; color: `var(--slate)`
- Shown in first cell alongside checkbox

**System-critical column indicator**
- Lock icon (size 10, opacity 0.55) after column label in TH

**Empty state**
- Centered, `padding: 70px 20px`
- Search icon 30px at 40% opacity
- Heading 13px weight 600 ink-2 + description 13px ink-3

**Bulk action bar** (floating, appears when rows selected)
- `position: absolute; bottom: 18px; left: 50%; transform: translateX(-50%)`
- `background: var(--ink); color: #fff; border-radius: 12px; padding: 9px 12px 9px 16px`
- Selected count label (weight 600, 13px) + divider + action buttons + close
- Action buttons: `background: rgba(255,255,255,.08); border-radius: 7px; font-size: 12.5px`
  - Danger (Delete): text color `#fca5a5`
  - Hover: `rgba(255,255,255,.16)`
- Entrance: `.scale-in`

**Task detail drawer** (right-side, 540px wide)

Header:
- Coordinator accent bar: `width: 5px; align-self: stretch; border-radius: 3px`
- Task ID: Mono 13px weight 600
- Locked badge: `background: var(--slate-bg); color: var(--slate)` + lock icon
- Task name: 18px weight 700
- Site / region / vendor: 12.5px ink-2

Lock banner (when locked):
- `background: #f4f5f7; border: 1px solid var(--line); border-radius: 9px; padding: 10px 13px`

Section headers inside drawer:
- `font-size: 11.5px; font-weight: 700; letter-spacing: .04em; text-transform: uppercase`
- Coordinator sections: `color: var(--ink-3)`
- PM sections: `color: var(--amber)` + small "PM" badge

Detail row pattern:
- `display: flex; justify-content: space-between; gap: 12px; padding: 8px 0; border-bottom: 1px solid var(--line-2)`
- Label: 12.5px ink-2; Value: 13px weight 500

Footer:
- `padding: 14px 22px; border-top: 1px solid var(--line); display: flex; gap: 10px`
- Edit task button (flex: 1) + Lock/Unlock button

---

### 9.3 Add Tasks (Bulk Entry)

**Layout:** scrollable single-column form, `padding: 26px`, max-width ~900px centered

**Two-section form:**

**Section 1 — Site Header** (top-of-form fields shared by all line items)
- Displayed as a card with labeled field groups
- Rows of field groups using CSS Grid (`repeat(5, 1fr)` then `repeat(4, 1fr)`, gap 12px)
- Required fields marked with red asterisk on the label

Fields: Job Code, TX/RF, Vendor, Physical Site ID, Logical Site ID, Site Option, Facing, Region, Sub Region, Distance, Contractor, Engineer Name, VF Task Owner, General Stream

Template row (below fields):
- `[Apply Template ▾]` select + `[Apply]` button
- `[Fill same status for all ▾]` + `[Fill same date for all 📅]`

**Section 2 — Line Items Table**

Columns: `#` (row number) · Line Item · Abs Qty · Act Qty · Status · Done Date · Comments · `[×]` delete

- Last row always blank for new input
- `[+ Add row]` button below table
- Per-row cells that differ from site header: subtle amber left border

**Price preview bar** (below table):
```
"Done: 2 items = 41,480 EGP  |  Assigned: 1 item  |  Total rows: 3"
font-size: 12.5px; color: var(--ink-2)
```

**Footer:**
- `[Cancel]` ghost button + `[Save all N tasks]` primary button

---

### 9.4 Import

**Layout:** `padding: 26px`, max-width ~860px

**File drop zone:**
- `border: 2px dashed var(--line); border-radius: var(--radius); padding: 48px; text-align: center`
- Icon + "Drop coordinator JSON file here" + "or browse" link
- Active drag: `border-color: var(--accent); background: var(--accent-bg)`
- Accepts `.json` only

**Import summary card** (after file loaded):
- Coordinator name + export timestamp
- 3 count chips: "X new tasks" (green bg), "Y changes" (amber bg), "Z unchanged" (slate bg)

**Review sections:**

*New tasks section:*
- Table with columns: ID, Site, Task, Line Item, Status, Total
- All checked by default; per-row checkbox

*Changes section:*
- Grouped by task ID
- Each change: `[field name]` + old value → new value (with `→` arrow)
- Locked task changes: amber warning strip — "Task is locked — changes ignored"

**Bulk controls:** "Accept All" / "Discard All" buttons at top

**Confirm button:** `.btn.primary` — "Apply accepted changes"

---

### 9.5 Reports

**Layout:** `padding: 26px`

**Top KPI row:** 4-column grid (same as Dashboard KPI cards)

**Global filters bar** (below KPIs):
- Date range (from/to), Coordinator, Region, Vendor, Status filters
- `[Apply Filters]` primary + `[Reset]` ghost buttons

**Chart sections** (same ChartCard wrapper as Dashboard):
- Tasks by Status: Donut
- Monthly Completion Trend: Mini line chart
- Tasks by Coordinator: Bar rows (count + value)
- Tasks by Region: Bar rows
- Vendor Split: Donut (Huawei `#e11d48` / Ericsson `#0e7490`)
- LMP vs Contractor Portion: stacked horizontal bar
- Financial section (PM only): invoiced vs pending, monthly trend

Each chart has a "View data ▾" toggle expanding a table beneath it.

**Excel export button:** top-right, `.btn`, icon: `download`

---

### 9.6 Settings

**Layout:** left sidebar (settings nav) + right content panel, `height: 100%`

Settings nav sidebar (inner, not the app sidebar):
- List of section names; active section highlighted `var(--accent-bg)` + `var(--accent)` text
- Section groups with uppercase labels

**Section: Price Catalog**
- List of uploaded catalogs: year, valid_from, item count, status chip
- Active catalog: `background: var(--green-bg)` chip
- Upload form: Year input + date + CSV file upload
- Preview table before confirming: code / name / category / price
- Diff indicators: NEW (green), REMOVED (red), CHANGED (amber) with old→new price

**Section: Contractor Portions**
- One card per contractor
- Current LMP% / Ctr% + effective date
- Expand to see version history
- "Update Portion" modal: LMP% + Ctr% (auto: 100 - LMP) + Effective From

**Section: Dropdown Lists Manager**
- 8 lists shown as expandable sections
- Values displayed as removable chips
- `[+ Add value]` input per list
- Distance list: special table editor with band name + multiplier number input

**Section: Audit Log**
- Full-width table: Timestamp / Task ID / Site / User / Action / Field / Old / New / Source
- Lock/unlock rows highlighted amber
- Filters: date range, user, action type

**Section: User Accounts**
- MASTER TEAM table + COORDINATORS table
- Inactive coordinators: grey row + "(inactive)" label

**Section: Deleted Tasks**
- Table with Task ID / Site / Coordinator / Deleted at / Days remaining
- "Recover" button (disabled past 10 days)
- Days remaining shown as: "8 days", "1 day", "Expired" (red)

---

## 10. Data Display Patterns

### Money formatting
- `n.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 })`
- Always suffixed with "EGP" in context labels
- Null/missing value: `—` in `var(--amber)` color

### Date formatting
- Always display as `DD/MM/YYYY`
- Empty dates: `—` in `var(--ink-3)`
- Dates in cells: `IBM Plex Mono`, `color: var(--ink-2)`

### IDs
- Format: `PREFIX-YYMMDDHHMMSS-seq` (e.g. `EM-260609143022-47`)
- Always render in `IBM Plex Mono`, font-size 11.5–13px
- In table: preceded by 4px-wide coordinator accent color bar

### Missing / null values
- Financial nulls: `—` in amber (`var(--amber)`)
- Non-financial optional fields: `—` in `var(--ink-3)`
- Missing price warning: `warn` icon (12px, amber) after contractor name in table

### Calculated / auto fields
- Show calculator icon + "Auto-calculated" label
- Override state: pencil icon (✏) with tooltip "Manually set. Click to recalculate."

### Locked tasks
- Row: slightly off-white `#fbfbfc` background
- Lock icon (13px, `var(--slate)`) in first cell
- Drawer: shows lock banner explaining reason

### PM fields visual treatment
- Table TH: `background: var(--amber-bg); color: var(--amber)`
- Table TD (unselected): `background: #fffdf8`
- Section headers in drawer/form: amber color + "PM" badge

---

## 11. Charts — Pure SVG/CSS Implementations

The prototype does **not** use Recharts or any chart library. Build with Recharts in the real app; the prototype charts (Donut, BarRow, MiniLine) are thin CSS/SVG stubs showing layout and color intent only.

**Color mapping for recharts:**
- Done: `var(--green)` / `#16a34a`
- Assigned: `var(--blue)` / `#2563eb`
- Cancelled: `var(--red)` / `#dc2626`
- LMP Portion: `var(--accent)` / `#2563eb`
- Contractor Portion: `#a78bfa`
- Trend line: `var(--accent)`
- Area fill: accent at 18% opacity → 0%
- Grid lines: `#eef0f3`
- Axis text: `var(--ink-3)`, 11px

Tooltip style: match `.card` (white bg, 1px border, `var(--shadow-lg)`, `border-radius: var(--radius-sm)`)

---

## 12. Responsive & Performance Notes

- Target: desktop-only (1200px+ minimum). No mobile layout required.
- Task table targets 10,000+ rows → use `react-window` for virtual scrolling.
- Debounce search: 300ms.
- Sticky table header (`position: sticky; top: 0; z-index: 2`).
- Sticky first column (Task ID) on horizontal scroll for wide PM table.
- All DB queries via Dexie indexed fields — never full table scans for filtered views.

---

## 13. Tailwind CSS Mapping

The prototype uses inline styles. When translating to Tailwind, use these equivalents:

| Prototype token | Tailwind class |
|---|---|
| `var(--bg)` | `bg-slate-100` (custom: `#f5f6f8`) |
| `var(--surface)` | `bg-white` |
| `var(--sidebar)` | custom `bg-[#0e1726]` |
| `var(--accent)` | `text-blue-600 bg-blue-600` |
| `var(--green)` | `text-green-700` |
| `var(--amber)` | `text-amber-800` |
| `var(--red)` | `text-red-600` |
| `var(--line)` | `border-slate-200` |
| `var(--radius)` | `rounded-[10px]` |
| `var(--radius-sm)` | `rounded-[7px]` |
| `var(--shadow-lg)` | `shadow-2xl` (custom values preferred) |

> Recommendation: define all CSS tokens in `index.css` under `:root` and use them directly, even in Tailwind projects. This avoids mapping drift and keeps the source of truth in one place.

---

## 14. Key Interaction Patterns

| Interaction | Behavior |
|---|---|
| Click table row | Open Task Detail Drawer |
| Click cell (PM table) | Edit in-place; Tab → next cell; Enter → save; Escape → cancel |
| Checkbox select | Show/hide Bulk Action Bar |
| Right-click row | "Select all tasks for this site" |
| Lock task | Immediate row update + toast "Task locked" |
| Set acceptance status | Auto-lock fires + toast "Task locked automatically" |
| Sidebar toggle | Collapse/expand with width transition |
| Import file drop | Parse → show diff summary → review screen |
| Export button | Download file + show success toast with filename |
| Delete task | Confirmation dialog → soft delete → toast with "10-day recovery" message |

---

*End of design specification. For business logic and build phases, see `CLAUDE.md` and `BUILD_GUIDE.md`.*
