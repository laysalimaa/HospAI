const express = require('express');
const router = express.Router();
const Database = require('../db/database');
const StaysPmsService = require('../services/staysPmsService');

// GET all reservations
router.get('/', (req, res) => {
  try {
    const reservations = Database.getAllReservations();
    res.json({ success: true, data: reservations });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET Stays PMS connected channels
router.get('/channels', (req, res) => {
  try {
    const channels = StaysPmsService.getConnectedChannels();
    res.json({ success: true, data: channels });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST create reservation in Stays PMS
router.post('/', (req, res) => {
  try {
    const body = req.body;
    const now = new Date().toISOString();
    const id = 'res-' + Date.now();
    const staysCode = body.stays_code || 'STY-2026-' + Math.floor(1000 + Math.random() * 9000);

    const newRes = {
      id,
      stays_code: staysCode,
      property_id: body.property_id,
      guest_name: body.guest_name,
      guest_phone: body.guest_phone || '+55 (11) 98888-0000',
      guest_email: body.guest_email || 'hospede@email.com',
      platform: body.platform || 'Airbnb',
      check_in: body.check_in || now.split('T')[0],
      check_out: body.check_out || '2026-11-10',
      num_guests: parseInt(body.num_guests || 2, 10),
      status: body.status || 'confirmed',
      total_price: parseFloat(body.total_price || 1200.00),
      created_at: now
    };

    const created = Database.createReservation(newRes);
    res.status(201).json({ success: true, data: created });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;

