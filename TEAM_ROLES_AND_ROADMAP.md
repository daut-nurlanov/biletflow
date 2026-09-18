# BiletFlow — Team Roles & Weeks 6–12 Roadmap

Team of 5. Scope update (Week 5): the mobile app is no longer scanner-only — it now needs full parity with the website for **Attendees** and **Organizers**, plus the original Event Admin scanner. The backend (database + API) does not change because of this — both web and mobile call the exact same endpoints, described in `DATA_MODELS_AND_APIS.md`.

Core principle for the schedule below: **build each feature on web first, prove the API works, then port it to mobile.** This is what makes doubled frontend scope survivable instead of doubling risk — mobile is never debugging a brand-new feature and a new platform at the same time.

---

## Role Division

| Person | Owns | Why |
|---|---|---|
| **A — Backend & Architecture** | Database, API, auth, Docker/deployment | Everyone else is blocked on this person early, so they get the head start |
| **B — Web Frontend** | Attendee + Organizer website | Most groundwork already exists here (wireframes, mockups) |
| **C — Mobile Lead (Attendee + Event Admin)** | Attendee mobile screens, the scanner app | Highest-value mobile work — biggest audience, plus the part that was always mobile-scoped |
| **D — Mobile #2 (Organizer)** | Organizer mobile screens, shared RN component library | Pairs with C so mobile isn't a one-person bottleneck |
| **E — Integration, QA & Admin Portal** | Platform Admin web portal, cross-platform testing, release coordination | The glue role — catches what falls between the other four |

**Note for Week 6:** C and D should pair on the shared mobile component library before splitting into their separate screen work — a consistent design system now saves real time later.

---

## Weeks 6–12 Task Board

### Week 6 — Foundations
| Role | Task | In plain terms |
|---|---|---|
| A | DB schema, core API, Docker setup | Build the actual database tables and the "waiter" endpoints everyone else will call; get it running in Docker so it's not just on one laptop |
| B | Wire web UI to the real API | Make the login/event pages actually talk to A's database instead of fake data |
| C | Stand up React Native, connect to the live API | Get a blank mobile app running and prove it can fetch real data from A's server |
| D | Shared component library with C; organizer screen skeletons | Agree on reusable buttons/cards so mobile screens look consistent, then rough out empty organizer screens |
| E | Project board, CI setup, API contract tests, admin portal skeleton | Set up the task tracker, automated checks, and start the internal staff-only site |

### Week 7 — Core flow, web-first
| Role | Task | In plain terms |
|---|---|---|
| A | Seat-hold logic, ticket/order endpoints, QR generation | Make sure two people can't buy the same seat, and that buying a ticket creates a real, scannable QR code |
| B | Full web core flow: create event → browse → buy → get QR | The whole "organizer posts an event, attendee buys a ticket" journey, working for real, on the website |
| C | Mobile: browse events, "my tickets" | Attendee can open the app and see events and their own tickets — no buying yet, just viewing |
| D | Mobile organizer: events list, dashboard | Organizer can open the app and see their events and basic numbers — no editing yet, just viewing |
| E | Test Week 7's web flow, admin moderation basics | Click through everything B built and find what's broken; start the "suspend an event" tool |

### Week 8 — Checkout, refunds, support
| Role | Task | In plain terms |
|---|---|---|
| A | Refund + support-case endpoints | Build the server logic for cancelling an order and for a support chat message being saved |
| B | Web refunds, orders, support chat | Organizer can refund someone, attendee can see order history and message support |
| C | Mobile: attendee checkout | The hardest mobile screen — actually letting someone pay and get a ticket from their phone |
| D | Mobile organizer: ticket sales view, activation checklist | Organizer can see how many tickets sold, and start the "turn on paid sales" steps, from their phone |
| E | QA the checkout flow everywhere, admin disputes screen | Try to break checkout on both web and mobile; build the internal "handle a payment dispute" page |

### Week 9 — Scanner app, organizer mobile depth
| Role | Task | In plain terms |
|---|---|---|
| A | Check-in/verify endpoints, staff-invite flow | Build the "is this QR code valid?" check the scanner will call, and the email-invite system for staff |
| B | Assigned seating (bonus) or catch-up | Add the seat-map feature if on schedule, otherwise help fix anything still broken from earlier weeks |
| C | Event Admin scanner app | Build the actual door-staff tool: login, pick an event, scan a code, see valid/invalid |
| D | Mobile organizer: finish activation checklist, staff management | Let organizers invite staff and finish turning on paid sales, from the phone |
| E | Full regression pass, prepare demo data | Retest literally everything built so far; make sure there's realistic sample data ready for a demo |

### Week 10 — Integration & stabilization (no new features)
| Role | Task | In plain terms |
|---|---|---|
| A | Support integration bugs, lock down seat-hold correctness, finalize Docker setup | Fix backend bugs found by others; make sure one-command startup actually works for anyone |
| B | Fix integration bugs only | No new features — just fix what breaks when everything's connected together |
| C | Fix integration bugs; help decide mobile cuts if behind | Same — fix, don't add; flag if organizer-mobile features need to be dropped |
| D | Same as C | Fix bugs; if time's tight, this is where deep analytics/campaign builder get cut from mobile first |
| E | Full 3-way integration pass, own the master bug list | Be the person making sure web + mobile + backend all actually work together, and tracking what's still broken |

### Week 11 — Polish and lock scope
| Role | Task | In plain terms |
|---|---|---|
| A | Deployment polish | Make sure `docker-compose up` genuinely works from a clean laptop |
| B | UI polish only | Fix visual glitches, no new features |
| C | UI polish only | Same, on mobile |
| D | UI polish only | Same, on mobile |
| E | Lock final scope, write down what's shipping vs. cut | Get everyone to agree, in writing, on the final feature list before the deadline |

### Week 12 — Rehearse, document, submit
| Role | Task | In plain terms |
|---|---|---|
| A | Final rehearsal, README | One last full run-through of setup; write the "how to run this" instructions |
| B | Rehearse the web demo | Practice the actual click-through you'll show |
| C | Rehearse the mobile demo | Same, on a real phone |
| D | Rehearse the mobile demo | Same, organizer side |
| E | Coordinate the rehearsal, compile submission docs | Run the group rehearsal, gather everything that needs to be turned in |

---

*Related docs: `BiletFlow_SRS_Initial_Draft` (requirements), `DATA_MODELS_AND_APIS.md` (schema + endpoints this roadmap builds toward).*
