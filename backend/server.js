//BiletFlow backend, this is where things get real. no more fake array of
//events sitting in memory, this file actually reaches into the same
//PostgreSQL database you've been typing SQL into by hand all night.

const express = require('express');
const { Pool } = require('pg');
const crypto = require('crypto');
const app = express();
const PORT = 3000;

//this lets Express actually read JSON that gets sent to it in a POST
//request. without this line, req.body would just be empty no matter what
//gets sent. easy to forget, annoying to debug if you do.
app.use(express.json());

//think of this as the phone number for your database. every time we want
//to ask it something, we're calling this number. same login info you used
//way back when you first spun up the Docker container, nothing new here,
//just reusing what already works.
const pool = new Pool({
  host: 'localhost',
  port: 5432,
  user: 'postgres',
  password: 'devpassword',
  database: 'biletflow',
});

//GET /api/events, the one you already tested. just lists everything.
app.get('/api/events', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM events ORDER BY start_time');
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Database query failed' });
  }
});

//GET /api/events/:id, this one's new. the :id part is a placeholder,
//whatever someone actually puts in the URL (like a real event's UUID)
//shows up as req.params.id. we grab the event itself, AND every ticket
//type that belongs to it, then hand both back together in one response.
app.get('/api/events/:id', async (req, res) => {
  try {
    const eventResult = await pool.query('SELECT * FROM events WHERE id = $1', [req.params.id]);

    if (eventResult.rows.length === 0) {
      //nothing matched that id, so just say so honestly instead of
      //pretending there's an event when there isn't
      return res.status(404).json({ error: 'Event not found' });
    }

    const ticketTypesResult = await pool.query(
      'SELECT * FROM ticket_types WHERE event_id = $1',
      [req.params.id]
    );

    const event = eventResult.rows[0];
    event.ticket_types = ticketTypesResult.rows;

    res.json(event);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Database query failed' });
  }
});

//POST /api/events, this is the one that actually WRITES to the database
//instead of just reading from it. someone sends us a JSON body with the
//new event's details, and we insert a real row.
app.post('/api/events', async (req, res) => {
  const { organizer_id, title, venue_name, start_time, capacity } = req.body;

  //quick sanity check before we even touch the database. same idea as
  //the "required" column in your data model doc, if these are missing
  //there's no point running the insert at all
  if (!organizer_id || !title || !venue_name || !start_time) {
    return res.status(400).json({ error: 'organizer_id, title, venue_name, and start_time are required' });
  }

  try {
    const result = await pool.query(
      `INSERT INTO events (organizer_id, title, venue_name, start_time, capacity)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [organizer_id, title, venue_name, start_time, capacity || 100]
    );

    //201 means "created", it's the polite HTTP way of saying
    //"got it, made the thing you asked for"
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error(err);
    //if organizer_id doesn't match a real user, Postgres will reject it
    //thanks to the foreign key, same protection you saw by hand earlier
    res.status(500).json({ error: 'Could not create event', detail: err.detail });
  }
});
//POST /api/orders/checkout, the big one. this is the endpoint that does
//everything at once: checks there's actually a ticket left, makes the
//order, makes the ticket, and takes one away from the inventory count.
//the tricky part is making sure ALL of that either fully happens or fully
//doesn't, we can't have a ticket get created but the inventory count not
//go down, that'd be a bug that slowly breaks everything over time
app.post('/api/orders/checkout', async (req, res) => {
  const { attendee_id, event_id, ticket_type_id, attendee_name, seat_id } = req.body;

  if (!attendee_id || !event_id || !ticket_type_id || !attendee_name) {
    return res.status(400).json({ error: 'attendee_id, event_id, ticket_type_id, and attendee_name are required' });
  }

  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const ttResult = await client.query(
      'SELECT * FROM ticket_types WHERE id = $1 FOR UPDATE',
      [ticket_type_id]
    );

    if (ttResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Ticket type not found' });
    }

    const ticketType = ttResult.rows[0];

    if (ticketType.quantity_available <= 0) {
      await client.query('ROLLBACK');
      return res.status(409).json({ error: 'Sold out' });
    }

    if (seat_id) {
      const seatCheck = await client.query(
        `SELECT id FROM tickets WHERE seat_id = $1 AND status IN ('valid','checked_in') FOR UPDATE`,
        [seat_id]
      );
      if (seatCheck.rows.length > 0) {
        await client.query('ROLLBACK');
        return res.status(409).json({ error: 'That seat is already taken' });
      }
    }

    const orderResult = await client.query(
      `INSERT INTO orders (attendee_id, event_id, total_amount, status, payment_reference)
       VALUES ($1, $2, $3, 'paid', $4)
       RETURNING *`,
      [attendee_id, event_id, ticketType.price, 'SANDBOX-' + crypto.randomUUID().slice(0, 8)]
    );
    const order = orderResult.rows[0];

    const ticketResult = await client.query(
      `INSERT INTO tickets (order_id, event_id, ticket_type_id, seat_id, attendee_name, qr_code_hash, status)
       VALUES ($1, $2, $3, $4, $5, $6, 'valid')
       RETURNING *`,
      [order.id, event_id, ticket_type_id, seat_id || null, attendee_name, crypto.randomUUID()]
    );
    const ticket = ticketResult.rows[0];

    await client.query(
      'UPDATE ticket_types SET quantity_available = quantity_available - 1 WHERE id = $1',
      [ticket_type_id]
    );

    await client.query('COMMIT');

    res.status(201).json({ order, ticket });

  } catch (err) {
    await client.query('ROLLBACK');
    console.error(err);
    res.status(500).json({ error: 'Checkout failed', detail: err.detail || err.message });
  } finally {
    client.release();
  }
});
//GET /api/tickets/:id, lets us check one specific ticket by its id, and
//pull in who it belongs to and which event it's for, kind of like what
//that scanner app would do when it checks a QR code at the door
app.get('/api/tickets/:id', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT tickets.*, events.title AS event_title, ticket_types.name AS ticket_type_name
       FROM tickets
       JOIN events ON tickets.event_id = events.id
       JOIN ticket_types ON tickets.ticket_type_id = ticket_types.id
       WHERE tickets.id = $1`,
      [req.params.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Ticket not found' });
    }

    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Database query failed' });
  }
});

//and... go. fire it up and it'll just sit here listening for requests
app.listen(PORT, () => {
  console.log(`BiletFlow API running at http://localhost:${PORT}`);
});

