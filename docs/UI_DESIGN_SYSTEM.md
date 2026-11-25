# BiletFlow UI design system

BiletFlow uses the same indigo palette, ticket mark and icon shapes across the web and Expo app. The interface prioritizes event discovery, admission status and the next action in each workflow.

The baseline review showed that the web header wrapped on phones, catalogue cards gave every event the same visual treatment, and wallet cards put admission, history and secondary actions on one level. The redesigned screens put search, selection and ticket validity first. The organizer and admin sidebars keep management sections accessible while forms and data tables occupy the main content area.

| Role | Color |
| --- | --- |
| Canvas | `#F7F7FB` |
| Surface | `#FFFFFF` |
| Body text | `#15152A` |
| Secondary text | `#56566E` |
| Primary action and focus | `#5139CD` |
| Selected and secondary action surface | `#ECE8FF` |
| Selected and secondary action text | `#3E26A8` |
| Hero and ticket header | `#1B1641` |
| Destructive actions | `#9C263A` |

Web uses self-hosted Inter Variable with Latin and Cyrillic subsets and system fallbacks. The Expo app uses the operating system font and supports system text scaling. The small, body, title and heading sizes on mobile are 14, 16, 20 and 28 dp. Both platforms use a 4/8/16/24/32 spacing scale for common groups and controls, with 10 px/dp controls and 18 px/dp cards. Web controls have a 44 px minimum target and native buttons have a 48 dp minimum. The default canvas is light.

## Components

- Use primary actions for the next step, secondary actions for navigation and refresh, and the danger style for confirmed destructive actions. Keep the existing review and confirmation steps.
- Use labelled inputs. Keep errors near the responsible field and announce asynchronously returned errors and confirmations. The web has an accent focus ring, a skip link and Escape handling for the compact menu and ticket dialog.
- Use the shared card, metric, status, notice and table styles in organizer, admin and support. Express status in text as well as color. Give tables and charts their own scroll area so compact screens can keep the page in view.
- Use compact ticket summaries for browsing. Expand a ticket to show the original, unmodified server QR on white, with PDF and support actions available. Checked-in, cancelled, refunded and event-blocked tickets show a status instead of an admission QR.
- Resolve uploaded event image paths through the API origin. When artwork is unavailable, use the category illustration. The catalogue uses the real event feed and web card prices come from public ticket types as cards approach the viewport.
- Use the existing Almaty event time zone and KZT for money. The website exposes English, Russian and Kazakh. New attendee interface strings use the existing translation dictionary. Some existing web workflow copy and native screens are English.

## Layout and implementation

The website uses the wide catalogue grid when space permits and reflows cards and event details to one column. Organizer and admin have sticky desktop navigation, which reflows above the content at 900 px. The global navigation collapses at 860 px. Event ticket choice and checkout summary stack at 760 px. Native uses the existing role tabs and safe-area handling, with scrollable content, native confirmations and a full-size camera preview.

- Web foundation and layout are in `web/src/design.css`, `web/src/attendee.css` and `web/src/workspace.css`.
- Web primitives are in `web/src/components/Surface.tsx`, `Icon.tsx` and `EventCover.tsx`.
- Mobile tokens are in `mobile/src/theme.ts` and `mobile/src/theme/forms.ts`. Native icons in `mobile/assets/icons` use the same paths as the web icons. React Native scales and tints the raster assets.

## Visual review

Local Chrome screenshots are under `mobile/.expo/ui-qa/before` and `mobile/.expo/ui-qa/after`. The capture report in each folder records viewport width, page width and locale. The Android snapshots from `BiletFlow_API35` are in the parent folder. The screenshot and test data folders are ignored by Git.

## Artwork

The web catalogue opens with a text-only banner. The Android catalogue uses editorial festival artwork from `mobile/assets/catalogue-cover.jpg`. Event pages use their own uploaded image or the category fallback. The Inter license is at `web/public/fonts/OFL.txt`.
