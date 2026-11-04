const express = require('express');
const router = express.Router();
const Database = require('../db/database');

// GET all properties
router.get('/', (req, res) => {
  try {
    const props = Database.getAllProperties().map(p => ({
      ...p,
      amenities: JSON.parse(p.amenities || '[]'),
      rules: JSON.parse(p.rules || '[]'),
      local_tips: JSON.parse(p.local_tips || '[]'),
      faq: JSON.parse(p.faq || '[]')
    }));
    res.json({ success: true, data: props });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET property by ID
router.get('/:id', (req, res) => {
  try {
    const p = Database.getPropertyById(req.params.id);
    if (!p) return res.status(404).json({ success: false, error: 'Imóvel não encontrado' });
    res.json({
      success: true,
      data: {
        ...p,
        amenities: JSON.parse(p.amenities || '[]'),
        rules: JSON.parse(p.rules || '[]'),
        local_tips: JSON.parse(p.local_tips || '[]'),
        faq: JSON.parse(p.faq || '[]')
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST create property
router.post('/', (req, res) => {
  try {
    const body = req.body;
    const id = 'prop-' + Date.now();
    const newProp = {
      id,
      name: body.name || 'Novo Imóvel',
      code: body.code || 'IMO-' + Math.floor(100 + Math.random() * 900),
      address: body.address || '',
      city: body.city || '',
      state: body.state || 'SP',
      type: body.type || 'Apartamento',
      bedrooms: parseInt(body.bedrooms || 1, 10),
      bathrooms: parseInt(body.bathrooms || 1, 10),
      max_guests: parseInt(body.max_guests || 2, 10),
      check_in_time: body.check_in_time || '15:00',
      check_out_time: body.check_out_time || '11:00',
      quiet_hours: body.quiet_hours || '22:00 às 08:00',
      wifi_ssid: body.wifi_ssid || 'Wifi_Hospede',
      wifi_password: body.wifi_password || 'Hospede123',
      door_code: body.door_code || '1234#',
      check_in_type: body.check_in_type || 'Fechadura Digital',
      check_in_instructions: body.check_in_instructions || 'Digite a senha na fechadura.',
      check_out_instructions: body.check_out_instructions || 'Desligue as luzes e puxe a porta.',
      amenities: JSON.stringify(body.amenities || ['Wi-Fi', 'Roupa de cama inclusa', 'Cozinha equipada']),
      rules: JSON.stringify(body.rules || ['Proibido fumar', 'Respeitar horário de silêncio']),
      local_tips: JSON.stringify(body.local_tips || []),
      faq: JSON.stringify(body.faq || []),
      image_url: body.image_url || 'https://images.unsplash.com/photo-1502672260266-1c1ef2d93688?w=800&auto=format&fit=crop&q=80',
      created_at: new Date().toISOString()
    };

    const created = Database.createProperty(newProp);
    res.status(201).json({ success: true, data: created });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// PUT update property
router.put('/:id', (req, res) => {
  try {
    const body = req.body;
    const existing = Database.getPropertyById(req.params.id);
    if (!existing) return res.status(404).json({ success: false, error: 'Imóvel não encontrado' });

    const updatedData = {
      name: body.name ?? existing.name,
      code: body.code ?? existing.code,
      address: body.address ?? existing.address,
      city: body.city ?? existing.city,
      state: body.state ?? existing.state,
      type: body.type ?? existing.type,
      bedrooms: parseInt(body.bedrooms ?? existing.bedrooms, 10),
      bathrooms: parseInt(body.bathrooms ?? existing.bathrooms, 10),
      max_guests: parseInt(body.max_guests ?? existing.max_guests, 10),
      check_in_time: body.check_in_time ?? existing.check_in_time,
      check_out_time: body.check_out_time ?? existing.check_out_time,
      quiet_hours: body.quiet_hours ?? existing.quiet_hours,
      wifi_ssid: body.wifi_ssid ?? existing.wifi_ssid,
      wifi_password: body.wifi_password ?? existing.wifi_password,
      door_code: body.door_code ?? existing.door_code,
      check_in_type: body.check_in_type ?? existing.check_in_type,
      check_in_instructions: body.check_in_instructions ?? existing.check_in_instructions,
      check_out_instructions: body.check_out_instructions ?? existing.check_out_instructions,
      amenities: Array.isArray(body.amenities) ? JSON.stringify(body.amenities) : existing.amenities,
      rules: Array.isArray(body.rules) ? JSON.stringify(body.rules) : existing.rules,
      local_tips: Array.isArray(body.local_tips) ? JSON.stringify(body.local_tips) : existing.local_tips,
      faq: Array.isArray(body.faq) ? JSON.stringify(body.faq) : existing.faq,
      image_url: body.image_url ?? existing.image_url
    };

    const updated = Database.updateProperty(req.params.id, updatedData);
    res.json({ success: true, data: updated });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// DELETE property
router.delete('/:id', (req, res) => {
  try {
    Database.deleteProperty(req.params.id);
    res.json({ success: true, message: 'Imóvel removido com sucesso' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;

