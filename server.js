const express = require('express');
const path = require('path');
const paymentsRouter = require('./routes/payments');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

// API routes
app.use('/api', paymentsRouter);

// Serve the frontend
app.use(express.static(path.join(__dirname, 'public')));

// Fallback to index.html for any non-API route (simple single-page setup)
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Nexus-style IPS simulator running on port ${PORT}`);
});
