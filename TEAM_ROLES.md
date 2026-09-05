# BiletFlow — Initial Setup & Task Sign-Up

Hey team! 

To make sure we show up to our next sync (Tuesday/Wednesday) with real progress, we need to map out our initial technical ideas, project folders, and rough designs. 

Below are 5 work areas that need attention before our next meeting. **Please grab a row in the table below, put your name down, and list what you’ll be working on.** If you have additional ideas or want to adjust something, feel free to edit the table directly!

---

## Task Sign-Up Table

| Work Area | Core Focus | Team Member | What I'm Delivering for Tue/Wed |
| :--- | :--- | :--- | :--- |
| **1. Repo & Tech Setup** | Folders, Docker, Tech choice | | *e.g., Setting up base folders, docker-compose, and proposing Node/Python backend.* |
| **2. Database & Data Flow** | Data models, API endpoints | | *e.g., Drafting fields for User, Event, Ticket, and listing API endpoints.* |
| **3. Web App Wireframes** | UI/UX sketches, React setup | | *e.g., Sketching Figma wireframes for Event Browsing & Seat Selection.* |
| **4. Admin, PDF & Analytics** | PDF tickets, promo engine | | *e.g., Outlining layout for A4 PDF tickets and promo campaign data requirements.* |
| **5. Mobile App & Support** | React Native, QR scanner | | *e.g., Setting up Expo project folder and sketching valid/invalid check-in screens.* |

---

## Detailed Task Breakdown

### Area 1: Repo & Infrastructure Setup
* Create the base backend directory structure in our repository.
* Set up a basic `docker-compose.yml` so everyone can run a database locally with one command.
* Compare and propose our main backend stack (Node.js, Python, Go, or Java) and database (PostgreSQL or MongoDB).

### Area 2: Database & Data Flow
* Draft the initial fields needed for key entities: `User`, `Event`, `TicketType`, `Order`, `Ticket`, and `SeatHold`.
* List the main API routes we'll need for creating events, reserving seats, and checking out.

### Area 3: Web App Wireframes
* Sketch quick wireframes (in Figma or on paper) for the main attendee screens:
  * Event discovery page
  * Seat map & ticket selection
  * Checkout page
* Set up the base React folder structure.

### Area 4: Admin Portal, PDF Tickets & Analytics
* Define what information goes on the printable A4 PDF ticket (QR code, seat details, venue).
* Outline how promo codes and Campaign QR links work behind the scenes.
* Sketch basic layout ideas for the organizer sales dashboard.

### Area 5: Mobile App & Support Scanner
* Set up the base React Native / Expo folder structure.
* Design/sketch the mobile ticket scanner screens (Green for Valid / Red for Invalid).
* Outline how the support chat messaging flow will work.

---

## Quick Agenda for Tuesday/Wednesday Sync
1. Review everyone's initial deliverables/sketches.
2. Formally lock in our backend language and database.
3. Assign long-term module ownership based on what everyone enjoyed working on.
