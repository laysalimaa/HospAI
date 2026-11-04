const express = require('express');
const cors = require('cors');
const path = require('node:path');

const propertiesRoutes = require('./routes/propertiesRoutes');
const reservationsRoutes = require('./routes/reservationsRoutes');
const chatRoutes = require('./routes/chatRoutes');
const analyticsRoutes = require('./routes/analyticsRoutes');
const settingsRoutes = require('./routes/settingsRoutes');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '..', 'public')));

// API Routes
app.use('/api/properties', propertiesRoutes);
app.use('/api/reservations', reservationsRoutes);
app.use('/api/chat', chatRoutes);
app.use('/api/analytics', analyticsRoutes);
app.use('/api/settings', settingsRoutes);

// Fallback to Single Page App
app.use((req, res, next) => {
  if (req.method === 'GET' && !req.path.startsWith('/api/')) {
    return res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
  }
  next();
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Server Error:', err);
  res.status(500).json({ success: false, error: err.message || 'Erro interno do servidor' });
});

app.listen(PORT, () => {
  console.log(`=======================================================`);
  console.log(`🏨 HospedaAI - Agente de IA para Aluguel por Temporada`);
  console.log(`📡 Sistema Conectado ao PMS Stays (Airbnb/Booking/Expedia)`);
  console.log(`🌐 Servidor rodando em: http://localhost:${PORT}`);
  console.log(`🎓 Disciplina de Projetos de IA - Profª Elienaide Machado`);
  console.log(`=======================================================`);
});
