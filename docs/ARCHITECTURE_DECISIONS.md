# Architecture decisions and deviations

## Why this stack
- **FastAPI + PostgreSQL (Docker Compose).** One command starts the database, the API and the web app. PostgreSQL gives real transactions, which the checkout needs (ticket stock, promo use counts and refunds must change together or not at all).
- **React + Vite + TypeScript (web), one Expo app (mobile).** The mobile app is role-based: attendee, organizer and door staff share one codebase and one login.
- **Pull requests with peer review** were used for team work on `main`.

## Answers to the open decisions in SRS section 12
| Question | Decision |
|---|---|
| Organizer activation fee | 5000 KZT, stored in `platform_settings` (`activation_fee`), changeable by the platform admin |
| Processing fee | 3% (`processing_fee_rate`), paid by the organizer, not added to the buyer's price |
| Accounts required to buy | Yes, a buyer signs in before checkout |
| Support attachments | Not supported; text messages only |
| Disputes and chargebacks | Out of scope, as the SRS excludes them |
| Payments | Simulated. No real money moves; the payment reference is generated |
| Email | Stored as in-app notifications. Real SMTP email is optional (`SMTP_HOST`, see docs/EMAIL_SETUP.md) |

## Deviations from the SRS, stated honestly
- **Plain CSS instead of Tailwind** on the web. It is easier to keep consistent for a small team and does not change behaviour.
- **Event pictures are stored in the database** (`event_images`, max 2 MB) instead of object storage such as S3. Fine for the demo; production would use object storage.
- **No Figma file.** The design lives in the code.
- **Seat picker** (choosing a seat on a map) is not part of the delivered attendee flow by team decision. Seat maps and holds exist in the backend only.
- **Accessibility** was checked with automated axe-core scans (0 violations on 28 web pages). It was not tested with a screen reader.

## Security notes
- The demo runs over plain HTTP on localhost. A real deployment needs TLS (HTTPS) and database encryption at rest.
- Passwords are hashed with bcrypt. Session tokens are HMAC-signed.
- Backup and restore: see docs/BACKUP_RECOVERY.md.
