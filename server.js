const express = require('express');
const path = require('path');
const paymentsRouter = require('./routes/payments');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

// API routes
app.use('/api', paymentsRouter);

// Serve the frontend
// Explicit no-cache: forces every browser to revalidate (via ETag) before
// reusing a cached copy of index.html / style.css / app.js, instead of
// relying on default caching heuristics that some browsers skip during
// back/forward navigation or tab restore (bfcache).
app.use(express.static(path.join(__dirname, 'public'), {
  etag: true,
  lastModified: true,
  setHeaders: (res) => {
    res.setHeader('Cache-Control', 'no-cache');
  }
}));

// Fallback to index.html for any non-API route (simple single-page setup)
app.get('*', (req, res) => {
  res.setHeader('Cache-Control', 'no-cache');
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Nexus-style IPS simulator running on port ${PORT}`);
});
