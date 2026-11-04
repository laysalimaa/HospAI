const express = require('express');
const router = express.Router();
const Database = require('../db/database');

// GET dashboard analytics
router.get('/', (req, res) => {
  try {
    const stats = Database.getAnalytics();
    
    // Platform breakdown
    const reservations = Database.getAllReservations();
    const platformCount = {};
    for (const r of reservations) {
      platformCount[r.platform] = (platformCount[r.platform] || 0) + 1;
    }

    res.json({
      success: true,
      data: {
        ...stats,
        platformBreakdown: platformCount,
        staysPmsStatus: 'Conectado (Sync Ativo 24/7)',
        academicInfo: {
          institution: 'Centro Universitário de Excelência',
          course: 'Sistemas de Informação',
          discipline: 'Disciplina de Projetos de IA',
          professor: 'Elienaide Machado',
          team: ['Kailla Costa', 'Erick Dos Santos', 'Vinicius De Oliveira', 'Laysa Lima'],
          projectName: 'HospedaAI'
        }
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;

