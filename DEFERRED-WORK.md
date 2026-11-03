# Deferred work — UI/UX revamp

Every item **the plan** asked for is done, and so is every screen and overlay
in **the canvas** — the canvas set is wider, because the plan applied explicit
decisions and did not schedule everything the design contains.

**Nothing is left open.** Two items remain recorded rather than pending: dark
mode is dropped for want of a design, and `TabStrip` vs `FilterChips` is a note
with no work implied. The persona switcher was approved by the owner on
2026-09-08 and reviewed; the review found and closed two real holes.

Status: **DONE** · **OPEN** (with what unblocks it) · **DROPPED** (with why)

Three earlier revisions of this file were not complete:

1. The first listed four plan *requirements* as if they were optional
   trade-offs, and omitted four others entirely.
2. The second was complete against the plan but said nothing about the canvas
   items the plan itself never scheduled — so "is the UI integration finished?"
   could not be answered from it. That is the
   [Canvas coverage](#canvas-coverage) section below.
3. The third recorded three items as blocked on decisions nobody needed to
   make. `sheetOpen` was declined on a trade-off that does not apply to the
   form the canvas actually draws; D-new was filed as "upstream" when Astryx
   exposes the slot that fixes it; and D7's "needs an architecture decision"
   was true of prerendering only, not of per-route metadata. All three are
   closed below. Investigating D2 rather than working around it turned out to
   matter most: the root cause was not about buttons.

Every set is recorded, with what was actually wrong.

---

## Canvas coverage

Every screen and overlay in `design/DOC Portal.dc.html`, and where it stands.

| Canvas block | Status |
|---|---|
| `isLanding` | done (Phase 3) |
| `isLogin` | done, with deviations — see below |
| `isApp` (shell) | done (Phase 4) |
| `isInbox` | done (Phase 4) |
| `isClubDash` · `isClubMembers` · `isClubTasks` · `isClubBudget` · `isClubPlan` | done |
| `isClaimsOverview` · `isClaimsNew` (wizard) · `isClaimsReview` (drawer) | done (Phase 6) |
| `isFacultyDash` · `isFacultyCal` | done |
| `isPipeline` | done |
| `paletteOpen` | pre-existing `CommandBar`, restyled via tokens |
| `trayOpen` | done — rebuilt on `Dialog` (Phase 4) |
| `drawer` | done — `Drawer` (Phase 6) |
| `toast` | done — one `ToastViewport` mounted (Phase 2) |
| loading / `.om-sk` | done — `PageSkeleton`, 21 screens |
| `confirm` | **done now** — was missing from the plan AND this doc |
| `sheetOpen` | **done now** — `EventsTab`, the form the canvas draws |

### `confirm` — DONE (and it hid a real defect)

The plan listed this overlay in its Context paragraph and then never scheduled
it in any phase, so it was never built and never recorded here.

Finding it mattered. `ClubHierarchyChart` deleted a club hierarchy level from a
**single click** of a hover-revealed icon — permanently removing a position
from the club's structure with nothing in between — and its failure path was
`console.error(e)`. The server refuses a level that still has members assigned,
so the *common* failure showed the user nothing at all: the level simply did
not disappear, with no explanation anywhere they would look.

`ConfirmDialog` now guards it. Built on Astryx `Dialog` with
`purpose="required"`, so Escape and backdrop clicks do not dismiss — on a
destructive action, "I clicked outside it" must not be indistinguishable from
"I decided not to". Cancel is first in the DOM so it takes focus, meaning a
stray Enter cancels rather than confirms. Failures render inside the dialog,
which stays open so the user can act on the reason or back out.

Verified in a browser against the real server: confirming a delete on a
position that has a member keeps the dialog open and shows *"Reassign members
off this position before deleting it"*.

It is deliberately **not** wired to Approve / Reject / Send back. Those already
require a typed reason or move a workflow one reversible step, and putting a
dialog in front of every item in a queue of twenty is how people learn to click
through dialogs without reading them. A confirmation used everywhere confirms
nothing. `ConfirmDialog`'s own docblock records this.

13 tests across `ConfirmDialog` and `Drawer`. Adding them needed a
`HTMLDialogElement.showModal` stub in `src/test/setup.ts` — jsdom implements
`<dialog>` as an element but none of its methods, which is why `Drawer` and
`NotificationTray` had no tests before either.

### `sheetOpen` — DONE

The canvas puts create forms in a slide-in sheet ("Add to the workspace", with
Title / Date / Venue / Budget / Description). `EventsTab` — the one the canvas
actually draws — is now that sheet, built on the existing `Drawer` with
`purpose="form"` so a stray backdrop click cannot discard typing.

**Why the earlier refusal was wrong.** It was declined on a genuine trade-off:
an inline panel keeps the list you are adding to visible while you type, and a
sheet covers it. That argument is real, but it does not describe this form.
You do not read the existing events in order to propose a new one, so the list
is not reference material. Meanwhile the inline panel had costs the trade-off
never weighed: five fields including a textarea pushed the whole event grid
down by roughly a screen, putting the submit button below the fold on a
laptop; and its only dismissal was the same button that opened it — no
Escape, no focus trap, no focus restore, because it was not a dialog at all.

Adopting it surfaced a field that had been missing the whole time.
`EventCreate.description` exists on the API and the event card has always
rendered it, but no form had ever offered the field — so the only way an event
could have a description was a direct API call, and a coordinator approving a
proposal saw a title, a date, a venue and an amount with no statement of what
the event actually is. The canvas's sheet includes it. So does this, and a
blank one posts `null` rather than `""`.

The submit button sits in the drawer's pinned footer, outside the `<form>`,
and reaches it through `form="club-event-proposal-form"` — so the button and
Enter do the same thing. That wiring is invisible when it breaks (the button
still renders, still clicks, and silently does nothing), which is why
`EventsTab.test.tsx` pins it. Five tests.

**The other five create forms stay inline.** This was the form the canvas
drew, and the reasoning above is about this form's shape, not a general rule.
Moving the rest is a per-form judgement, not a batch migration.

### `isLogin` — done, with three deliberate deviations

- The canvas heads it *"DOC Unified Digital ERP" / "Welcome back."*; ours keeps
  the existing *"DOC Digital Identity" / "Sign in with your university
  account."* Published copy, kept under the same rule as the landing page.
- The canvas adds a *"Today, across the department"* statistics panel beside
  the form. Not built: it would put an unauthenticated read of department
  counts on the sign-in page, which is a product decision rather than a styling
  one.
- The canvas offers *"Or continue as a demo persona"* buttons on the login
  form. Deliberately excluded — the persona switcher is dev-only and lives
  behind a server flag (D9). Putting it on the login page would make
  impersonation the first thing anyone sees.

### Screens the canvas never designed

The canvas covers 13 of the app's 30 tab screens. The other 17 have no design
of their own:

- **clubs:** analytics, announcements, documents, events, recruitment,
  reimbursements, reports, settings, sponsorships, structure
- **faculty:** directory, documents, meetings, notes, reminders, tasks
- **claims:** my_claims

They are **on** the new system — warm tokens, `Card`, `PageSkeleton`,
`SectionHeader`, the shared form fields — so they are consistent with the
designed screens and contain no raw palette colours. But nobody drew them, so
"does this screen look right?" has no reference to check against. Worth knowing
before someone reports one as off-design.

### Deliberate deviations from the canvas's own values

- **Spacing stays on a 4px base**, not the canvas's 4.4px. The plan allowed
  this explicitly ("Fallback: keep 4px"): `--spacing-1: 4.4px` is a 10% shift
  on every spacing utility in the app at once, and fractional pixels seam
  hairline borders in dense tables. 24px vs 26.4px is not a visible
  difference; a seam in the claims table is. Reasoning is in
  `docPortalTheme.ts`.
- **`StatsBand` is not its own file.** The plan's file list named it; the
  canvas puts the statistics *inside* the hero, so they live in
  `HeroSection.tsx` and carry the `.stats-section` GSAP trigger there.
- **Astryx's `blue` categorical hue is left at its cool default.** There is no
  blue in this palette, and a token named `blue` that renders beige is a trap.
  Nothing uses it.

---

## Closed — these were plan requirements, not options

### D1 · Migrate the card shells to `<Card>` — DONE

**Was framed as** "maintainability debt, not a visual one… not blocking".
The plan (Phase 2) required migrating the 27 card sites outright.

All of them now route through `<Card>`; `npm run check:style` reports **0**
un-migrated shells and fails the build if one reappears.

The earlier blocker was real but solvable: a regex codemod rewrote `</section>`
and `</article>` tags it had not opened. The fix was a depth-counting matcher
that walks forward from each opening tag to find *its* close
(`/tmp/cardmig.py` at the time), plus two `Card` capabilities the migration
needed:

- `as="form"`, because several create forms *are* card-shelled panels — without
  it they would need a `Card` wrapping a `form` and an extra nesting level for
  nothing. `CardProps` extends `FormHTMLAttributes` so `onSubmit` and
  `noValidate` pass through.
- `padding="none"`, for `DataTable`, which supplies its own cell padding.

`PageSkeleton`'s placeholders use `Card` too, so a skeleton is shaped by the
same component as the thing it stands in for and the layout cannot shift when
data lands.

### D5 · Inbox `ActionCard` → `ListRow` — DONE

**Was framed as** "low value… folding it into `ListRow` would mean growing
`ListRow` by four props used by exactly one caller". The plan (Phase 4)
required the collapse.

That assessment was wrong. Every part of `ActionCard` was already a `ListRow`
slot: the icon is `leading`, the kind label and urgency chip are `eyebrow`, the
title is `href` (a real link), the subtitle and due date are `meta`, and
Approve is `action`. `ListRow` gained exactly **one** prop — `as="li"`, so the
`<ul>` keeps real list semantics — and `ActionCard` became `ActionRow`.

### D8 · Dead `href="#"` footer links — DONE

**Was framed as** needing "the actual policy pages/URLs, which is a content
decision". The plan (Phase 3) said "route them **or render as plain text**" —
the second option needs nothing from anyone.

`FOOTER.links` is now `FOOTER.notices`, each `{ label, href: null }`.
`ContactFooter` renders a `<span>` while `href` is null and an `<a>` the moment
one is filled in. The wording is preserved, and a test asserts both are text so
`href="#"` cannot come back.

### D13 · `DataTable` row navigation — DONE as `rowHref`

**Was framed as** "not implemented on purpose", on the grounds that a clickable
`<tr>` is inaccessible. That reasoning is right about `onRowClick` and was used
to decline `rowHref` too — but `rowHref` is the accessible option, and the note
itself said so ("a link in the first cell is the usual answer").

`DataTable` now takes `rowHref?: (row) => string` and renders a real `<Link>`
inside the column marked `isRowLink`, with `group-hover` on the row so the
larger target still works for a mouse. `onRowClick` is deliberately still
absent.

---

## Closed — plan requirements the earlier doc omitted entirely

### Heading `letter-spacing: -0.008em` — DONE

Plan, "Design source of truth": *Headings: "Source Serif 4", weight 600,
`letter-spacing: -0.008em`*. The family and weight landed in Phase 1; the
letter-spacing did not.

It is now an `@layer base` rule on `h1`–`h6` in `src/index.css` — not in the
theme, because `defineTheme`'s `typography` config has no letter-spacing key
and the generated `doc-portal.css` is rewritten on every build. Layered so a
deliberate `tracking-*` utility still wins.

Verified in the browser: a bare heading computes `-0.008em`, and the landing
`h1`'s `tracking-tight` still resolves to `-0.025em`.

### Pin `@astryxdesign/cli` — DONE

Plan, Phase 1: *"Pin the CLI."* All three Astryx packages are now exact
`0.1.4` rather than `^0.1.4`. The reason is in the plan's own risk register: a
pre-1.0 CLI can drop an unsupported `components` key with no error and no
styling, so a silent minor bump could quietly un-style every button.

### `DataTable` shell on `<Card>` — DONE

Plan, Phase 2: *"Move its shell onto `Card` so the table frame stops being a
fourth spelling of the card shell."* It was still writing the border,
background and radius by hand.

### Pipeline board and faculty calendar restyles — DONE

Plan, Phase 6. **This was missing from the deferred doc altogether** — not
deferred, just not noticed.

`PipelineBoard` was already on the token layer via the Phase 2 codemod and
already had its SLA-breach chips; it gained `Card`, `PageShell`, `PageHeader`
and a shaped skeleton.

`CalendarTab` needed real work. It grouped events by **type** — all classes,
then all meetings, then all club events, then all tasks — which answers "show
me my meetings" but not the question a calendar is for. "What is on Tuesday?"
meant reading four lists and reassembling them mentally. It now groups by
**day**, as the canvas's `isFacultyCal` specifies, with the type preserved as a
chip on each event so nothing is lost. Events with an unreadable `start` are
collected under a "No date" group rather than dropped.

### Skeletons everywhere via `PageSkeleton` — DONE

Plan, Phase 4: *"Skeletons everywhere via `PageSkeleton`; the canvas specifies
this."* Three files used it; 28 still showed a centred spinner.

Nineteen loading states are now shaped to their content — `table` where the
screen renders a `DataTable`, `stats` where it renders charts, `list`
otherwise, `detail` for the settings page.

`PageLoader` deliberately remains in six places, all of which gate a screen
whose shape is not yet known: the route `Suspense` fallback, `RequireAuth`'s
session restore, `AuthenticatedLayout`, `ModuleLauncher`, `ClubsDashboard`'s
club list and workspace bootstrap, and `EventAttendanceSheet`. A spinner is the
right answer when you genuinely cannot say what is coming.

---

## Closed — small items from the earlier doc

### D3 · `ClaimStatusStepper` colour drift — DONE (structurally)

The stepper still renders a `Token` inside a `Popover`, because that is the
only way to show *where* in a four-stage workflow a claim sits — `StatusChip`
cannot express that, so the component stays.

What is fixed is the **drift**. Its hand-written `TOKEN_COLOR` map is gone;
`STATUS_HUES` now lives in `src/components/ui/status.ts` beside
`STATUS_CLASSES`, and the stepper derives its hue via `toSemanticStatus`. Both
renderings of "what colour is this status" are in one file, so a new status
picks up the right colour in both automatically. Three tests assert the two
maps stay in step, that no hue outside the palette is used, and that gold stays
reserved for `in_review`.

### D4 · `parseClubBootstrap` counters — DONE

`counters.budget_spent` and `counters.open_tasks` are now validated. They were
dereferenced by `DashboardTab` but absent from the schema, so a backend that
stopped sending either would crash the tab rather than raise the contract
warning that file exists to raise.

The plan's *"Leave `contracts.ts` alone"* is about not repurposing response
validation for form validation. This is the opposite: a real gap in the
response contract.

### D11 · `AboutSection` image paths — DONE

Now `@/assets/images/…` via the repo-root alias, instead of climbing four
directory levels.

### D12 · Landing sections took five query props each — DONE

`AsyncContent` and the three sections take one `query` prop (a structural
`SectionQuery<T>`), down from five. The queries deliberately stay in
`Home.tsx`: its second GSAP effect is keyed on
`[courses.data?.length, clubs.data?.length]`, so the orchestrator has to be the
thing that sees them change. A section calling its own hook would hide that and
silently break the card reveals.

### D14 · `EventAttendanceSheet` validation — DONE (nothing to fix)

Reviewed. There is no validation guard to retire: every member row defaults to
`present`, so no field can be empty. Its two toasts are a success outcome and a
failure outcome, which is what toasts are for. It has no text input, so
Enter-to-submit does not apply. Correct as it stands.

### D15 · `useZodForm` type assertion — DONE

The cast is gone. `useZodForm` is now generic over the **schema**
(`S extends z.ZodType<FieldValues, FieldValues>`) rather than over the
field-values type, so the resolver's own inference lines up with `useForm`'s
and no assertion is needed.

### D7 · Landing page meta — DONE (per-route), prerendering deliberately not

**Was framed as** blocked on "an architecture decision — prerender, SSG, or a
meta library."

That conflated two things. Prerendering is an architecture decision. *Having
per-route metadata at all* is not, and it was the part actually missing.

**Done:** `src/lib/meta.ts` exports `useDocumentMeta`. Each route states its
own title, description, canonical path and social title, and anything it does
not state falls back to the value `index.html` authored — so a route's
metadata is a complete statement rather than a diff on whatever ran before it.

The immediate win is not SEO. It is that **every ERP screen shared one browser
tab title**: four open tabs were four identical entries in the tab strip and
in history, and the back button gave no clue where it was about to go. Titles
now read `Club Budget · Clubs — DOC Portal`, derived from the same
`lib/navigation.ts` and `tabs.ts` vocabulary the nav renders from, so a
renamed tab renames its title and an untitled one degrades to the module name
rather than going stale.

`SITE_ORIGIN` is overridable via `VITE_SITE_ORIGIN`, which fixes a real
hazard in the previous hardcoded canonical: a staging deploy was declaring the
production domain as its canonical URL, asking search engines to fold the two
together.

Landing copy — including the description — moved into `content.ts` under the
same contract test as the rest of the published strings, because a description
IS the page's copy as seen by someone who has not opened it yet. The last time
the hero was rewritten, the description was not, and the snippet promised
wording the page no longer contained. That is now a failing test.

Seven tests. Two of them found real bugs while being written: `upsert` can
only remove tags it created (deleting an author's tag is not its business), so
writing `null` for a description left `index.html`'s element holding the
*previous route's* value — a leak that restore-on-unmount happened to paper
over, and which therefore depended on React effect ordering to stay hidden.

**Deliberately NOT done: prerendering.** Tags are written after hydration, so
a crawler that runs no JavaScript still sees only `index.html` — which is why
those static tags stay, and stay accurate for `/`. That remains an
architecture decision, but it is now a *build* concern rather than a design
one: the app already knows the right metadata for every route, in one place,
so a prerender step has something to render instead of needing this invented
first. With exactly one public route, the static tags are not currently wrong.

### Second representative form screen — DONE

Plan, Verification: *"Form phases additionally need behaviour tests on
`useZodForm` / `applyServerFieldErrors` plus **two representative screens**…
a mocked 422 with `loc: ['body','amount']` sets the error on `amount`."*

Only one screen was covered (`LoginPage`, which is deliberately built on native
inputs and so does not exercise the shared field components at all).

`ReimbursementsTab.test.tsx` is the second — ten tests over the ordinary
Astryx-backed path, including the exact 422 the plan names. `renderRoute` now
also returns the api spies per verb, because `requested` mixes reads and writes:
a screen that fetches `/reimbursements` on mount is indistinguishable from one
that posted to it, so "did this form submit?" has to be counted from the verb.

### `SwitchField` removed — DONE

It had zero consumers: only a comment naming it. That is the same dead code
`ComingSoon` and `FlagGate` were deleted for in Phase 2, so consistency said
remove it.

The plan expected the form layer to absorb `NotificationSettings`'s file-local
`Toggle`, and it did — but via Astryx `Switch` directly rather than an
rhf-bound field, because those preferences save the moment they are flipped
rather than on a submit. A form with no submit button would imply unsaved state
where there is none. `fields.tsx` records why no `SwitchField` exists and when
to add one.

### Astryx discards our input `id`s — DONE

Found during the accessibility pass: Astryx's inputs ignore any `id` passed to
them and generate their own, wiring the label's `htmlFor` to it. The
`id`/`inputID` props were therefore removed from the field wrappers — a prop
that silently does nothing is worse than its absence. Label association is
unaffected.

---

## Closed — the items the last revision left open

### D2 · Astryx layout styles never applied — DONE (root-caused)

**Was framed as** a Button padding quirk with a correct workaround, needing
"an investigation into how `dist/astryx.css`'s `@layer astryx-base` interacts
with this app's layer order" before the workaround could be removed.

That investigation was the whole item, and the finding is much larger than
buttons. **Nothing Astryx ships in `astryx-base` had ever applied in this
app** — not padding, not margin, not borders, not radii.

**Root cause.** Cascade layers are ordered by first appearance unless declared
explicitly, and nothing declared them. `main.tsx` imported `reset.css` and
`astryx.css` above `index.css`, which produced:

```
reset, astryx-base, properties, theme, base, components, utilities, astryx-theme
       ↑ Astryx's box model                  ↑ Tailwind preflight
```

Tailwind's preflight opens `@layer base` with
`*, ::before, ::after, ::backdrop { margin: 0; padding: 0; border: 0 solid }`.
A later layer beats an earlier one regardless of specificity, so StyleX's
`:not(#\#):not(#\#)` armour — which wins any specificity fight — counted for
nothing across the layer boundary.

Measured on `/app` before the fix: **147 of 153** Astryx-rendered elements
computed `padding: 0`, with `border-width: 0` and `border-radius: 0`
alongside. Side-nav items, cards, inputs and menus were all flat. Buttons were
merely the *visible* case, because `defineTheme`'s `components.button` block
lands in `astryx-theme` — the one layer ordered after preflight — so the
workaround worked and hid how wide the problem was.

**Fix.** `src/index.css` now opens with the layer order
`@astryxdesign/core/tailwind-theme.css` documents in its own usage block:

```css
@layer reset, theme, base, astryx-base, astryx-theme, components, utilities;
```

and `@import`s Astryx's CSS itself. `main.tsx` imports no CSS but
`index.css` — an import from JS lands wherever the bundler puts it, which is
what caused this. `astryx-base` after `base` so preflight cannot flatten
components; `components`/`utilities` last so a Tailwind class on an Astryx
component still overrides it, which every `className` pass-through in
`src/components/ui` depends on.

The workaround is gone: `paddingBlock: '0px'` is off `components.button` and
buttons take their block padding from Astryx's own size variants again
(measured `8px 14px` at `sm`). The `paddingInline` override stays, on its own
merits — a 999px pill needs more inline padding than Astryx's stock 12px or
the corner curve clips the label.

**This is now a CI invariant**, because it was invisible for the life of the
project: no error, no warning, no missing class, just flat components.
`npm run check:style` fails if the `@layer` statement is deleted, if
`astryx-base` is ordered before `base`, or if any `.ts`/`.tsx` file imports
Astryx CSS. All three failure modes were verified to actually fail.

**Consequence to expect:** components render slightly larger than before,
because they now have the padding they were always supposed to have. Every
route was checked in a browser, plus mobile 375 and `colorScheme: 'dark'`.

### D-new · `CommandPalette` input has no accessible name — DONE

**Was framed as** blocked on "an upstream fix, or `astryx swizzle
CommandPalette` to eject the source."

Neither was needed. `CommandPaletteProps` has an `input` slot
(`@default <CommandPaletteInput />`), `CommandPaletteInputProps` extends
`BaseProps`, which explicitly keeps `aria-*`, and the component spreads those
props onto the real `<input>`. Filling the slot is the supported path:

```tsx
input={
  <CommandPaletteInput
    aria-label="Search clubs, people, meetings and tasks, or run a command"
    placeholder="Search or jump to…"
  />
}
```

Everything else about the default input is unchanged — context wiring,
autofocus, the search icon, `useCombobox` keyboard handling. Verified in a
browser: the palette opens, autofocuses, and the `role="combobox"` now
reports that name.

The general lesson is worth keeping: "the library exposes no way to do this"
was asserted from the component's top-level props without reading the slot's
own prop type.

### Dialogs had no accessible name — DONE (found while testing the sheet)

Astryx's strategy is to focus `DialogHeader`'s `h2` when a dialog opens, so
the title is announced at that moment. But the `<dialog>` itself carries
`role="dialog" aria-modal="true"` and no name, so anyone arriving at it
afterwards — rotor, landmark navigation, or tabbing back to the container —
is told "dialog" and nothing else.

Found because a test querying `getByRole('dialog', { name: … })` could not
find the drawer. `Drawer` now sets `aria-label={title}`; `ConfirmDialog` uses
`aria-labelledby` pointing at its own `h2`, so the name cannot drift from the
heading. Neither disturbs the focus behaviour.

### D9 · Persona switcher — DONE, reviewed and approved

Built as approved: dev-only, server-gated, off by default.

- `ENABLE_DEMO_PERSONAS: bool = False` plus `DEMO_PERSONA_EMAILS`, an
  allow-list of four seeded fixtures. Explicitly false in both `.env.example`
  files.
- `POST /auth/demo-persona` issues a real token pair via
  `session_service.issue`, so the session is refreshable and revocable like any
  other. Returns **404** — not 403 — when the flag is off *or* when the address
  is not allow-listed, so it cannot be used to enumerate personas.
  Rate-limited on the same budget as `/login`.
- `GET /auth/demo-persona` lists the available personas and 404s when disabled.
  It exists because the POST's deliberate ambiguity makes it useless for
  answering "is this feature on?" — and it means the client keeps no copy of the
  allow-list.
- `DemoPersonaMenu.tsx` is gated on `import.meta.env.DEV` **and** a non-empty
  response from that GET.
- It is a **separate control** beside the account menu, which keeps "Your inbox"
  and "Notification settings" — the canvas replaced those, which would have
  removed the only route to the notification preferences screen.

**Approved by the repository owner on 2026-09-08.** The review below was then
carried out against the running system rather than by reading the code, on the
grounds that approval settles whether to ship the feature and says nothing
about whether the gates actually hold.

#### Two real findings, both closed

Both defeated the *same* stated protection — "a production deployment does not
even advertise that the route exists" — and both were invisible from the code
that claims it.

**1. The 404 was distinguishable from a real 404.** The endpoint answered
`{"detail": "Not found"}`; FastAPI's built-in 404 is
`{"detail": "Not Found"}`. One byte of capitalisation told anyone probing the
route the difference between "exists but switched off" and "was never
deployed" — precisely the distinction the 404 exists to hide. Now byte-identical,
with a test that compares both endpoints against a genuinely absent route.

**2. `/openapi.json` published the route regardless of the flag.** This app
serves `openapi_url` unconditionally, in every environment, and the persona
routes were left at the default `include_in_schema=True`. So the full path,
`DemoPersonaRequest` (the exact body shape to send) and `DemoPersonaOut` (real
names and addresses) were public whether or not the feature was on. Masking a
response while publishing its schema is not masking. Both routes are now
`include_in_schema=settings.ENABLE_DEMO_PERSONAS`.

Verified with the flag off: no persona path in the schema, no persona models in
`components.schemas`, and both verbs byte-identical to an absent route.

#### What the review verified empirically, with the flag ON

- The allow-list holds: `POST` for `admin@christuniversity.in` — a real,
  seeded, `super_admin` account — returns 404.
- The issued session is a genuine one: `/auth/me` resolves to the persona,
  `/auth/refresh` returns 200, and after `/auth/logout` the refresh token is
  401. Not a side-channel token.
- **Impersonation is a downgrade, never a union.** Switching from the super
  admin to the student president left `permissions` without its `*` entry, and
  the side nav lost Pipeline and Faculty workspace. Permissions are re-resolved
  server-side for the target, not merged with the caller's.
- Rate limiting bites: `5/minute`, then 429.
- The production bundle contains no trace — no `demo-persona`, no
  `DemoPersona`, no persona address. The single `Persona` substring in `dist/`
  is the string `"Personal Notes"`, a faculty tab label.

4 new tests (18 in `test_demo_personas.py`, 220 backend total). The schema
tests re-import the module under a forced flag rather than reading the ambient
one — `include_in_schema` is evaluated at import, so a naive test would assert
whatever the developer's local `.env` said and go green for the wrong reason.
They carry a positive control, so deleting the routes cannot make them pass.
Confirmed identical results with the local flag set both ways.

#### Residual risk, accepted and unchanged

`POST /auth/demo-persona` takes **no authentication**. That is inherent — its
purpose is to sign in without a credential — so with the flag on, anyone who
can reach the API can mint a token for any of the four fixtures, one of which
(`hod.commerce@`) is a high-privilege role. The flag is the only thing standing
between that and a real user, which is why it defaults false in code, is false
in both `.env.example` files, and why the route is now absent from the schema
when off.

**This does not change: never enable it in production.** The approval covers a
laptop.

## Recorded, not pending

Neither of these is waiting on implementation work. One is a dropped decision,
the other a note.

### D6 · No dark mode — DROPPED (needs a design, not an implementation)

The mechanism exists and is half-built: `defineTheme` accepts `[light, dark]`
token tuples, the generated `doc-portal.css` already emits
`[data-astryx-media="dark"]` blocks, and 281 tokens are `light-dark()`.

What is missing is a *design*. The canvas has no dark artboard, and the Organic
system is a warm single-direction palette whose ramps run cream → brown;
inventing a dark counterpart is a design decision, not an implementation one.
The plan does not ask for it.

**Consequence to respect:** `:root { color-scheme: light }` in `src/index.css`
must stay **unlayered**. It is the only thing stopping all 281 `light-dark()`
tokens from resolving dark on a dark-OS machine, and the bug is invisible on a
light-mode laptop. `npm run check:style` asserts it, and every phase was checked
under `colorScheme: 'dark'` in the browser.

### D10 · `TabStrip` vs `FilterChips` — OPEN as a note, no work implied

`TabStrip` routes (each item is a URL; Back moves between them). `FilterChips`
filters the current view client-side and is a `radiogroup`. Both render a row of
pills and look nearly identical.

**Why it is recorded:** a future change is likely to "unify" them and thereby
make the Back button undo a filter. If they are ever merged, the
routing/filtering split has to survive the merge. The distinction is documented
in both files.

## `ConfirmDialog` is available and mostly unused

Only `ClubHierarchyChart` uses it, because it is the only single-click
irreversible action in the app. If a delete or a purge is added later, it goes
behind this — and the docblock explains why approvals deliberately do not.

Two more `api.delete`-shaped things to watch for: there is currently exactly one
`api.delete` call in the whole frontend. A second one arriving without a
confirmation is the regression this component exists to prevent.

---

## A note on the ratchets

`npm run check:style` now reports **0** un-migrated card shells and **0** raw
palette utilities, down from 27 and 667.

The last six were never real. They were in *prose* — comments in `Card.tsx`,
`index.css` and `ramps.css` that quote the old class names on purpose, to
record what was migrated away from and why. The earlier note argued the regex
counting them was "the right trade", because a stricter matcher would be
easier to slip a real usage past. That was backwards: a baseline of 6 meant
the ratchet could not distinguish "someone wrote a raw utility" from "someone
edited a comment", which is exactly the discrimination it exists to make.

The checker now strips comments before counting. It does so with a small
scanner rather than a regex pair, because the naive
`s.replace(/\/\/.*$/gm, '')` eats everything after the `//` in a URL — so a
real `bg-slate-100` later on that line would silently stop being counted, a
strictly worse failure than the one being fixed. Tracking string state costs
thirty lines and cannot do that. Verified against a probe file containing
both comment-quoted and genuine utilities.

There is now a **third** invariant: the cascade layer order (see D2). It has
the same character as the `color-scheme: light` guard — a one-line deletion
that produces no error, no warning and no obviously broken page, and which
nobody would catch in review.

## Outside the codebase

### Committing `design/`

The plan says *"Move the export to `design/` and commit it."* It has been
moved and is now **staged** (`git add design/` — 16 files, 672 KB). It is not
committed: this session made no commits, because none were asked for.

### The local persona flag

`backend/.env` (gitignored) has `ENABLE_DEMO_PERSONAS=true`. That is now
deliberate rather than left over: the owner approved the switcher on
2026-09-08, and a laptop is the environment the approval covers.

Turn it off with `ENABLE_DEMO_PERSONAS=false` and restart — the schema
visibility is decided at import, so a restart is required for the route to
disappear from `/api/v1/openapi.json`.

Nothing that ships changed. The code default is `False`, both `.env.example`
files say `false` explicitly, and `.env` is gitignored.
