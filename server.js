// server.js
'use strict';

const express = require('express');
const path = require('path');
const fs = require('fs');

const app = express();

// ---- Config ----
const PUBLIC_DIR = path.join(__dirname, 'public');
const UPLOAD_DIR = path.join(PUBLIC_DIR, 'assets/uploads');
const BACKGROUNDS_DIR = path.join(PUBLIC_DIR, 'assets/backgrounds');

// Feature flag: uploads are OFF by default (free plan)
const ENABLE_UPLOADS = process.env.ENABLE_UPLOADS === 'true';

// ---- Middleware ----
app.disable('x-powered-by');
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Static files with light caching; no-cache for HTML
app.use(
  express.static(PUBLIC_DIR, {
    extensions: ['html'],
    maxAge: '1h',
    setHeaders: (res, filePath) => {
      if (filePath.endsWith('.html')) {
        res.setHeader('Cache-Control', 'no-store');
      }
    },
  })
);

// ---- Health ----
app.get('/api/health', (_req, res) => {
  res.json({ ok: true, uploadsEnabled: ENABLE_UPLOADS });
});

// ---- Backgrounds list ----
app.get('/api/backgrounds', (_req, res) => {
  const dir = BACKGROUNDS_DIR;
  let files = [];
  try {
    if (fs.existsSync(dir)) {
      files = fs
        .readdirSync(dir)
        .filter((f) => /\.(jpe?g|png|gif|webp)$/i.test(f))
        .map((f) => `/assets/backgrounds/${f}`);
    }
  } catch (e) {
    console.error('Could not list backgrounds:', e);
  }
  res.json(files);
});

// ---- Uploads (feature-flagged) ----
if (ENABLE_UPLOADS) {
  // Lazy-require only when enabled (avoids issues if sharp isn't needed)
  const multer = require('multer');
  const sharp = require('sharp');

  // Ensure uploads dir exists only when enabled
  try {
    fs.mkdirSync(UPLOAD_DIR, { recursive: true });
  } catch (e) {
    console.error('Failed to create upload dir:', e);
  }

  const storage = multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
    filename: (_req, file, cb) => {
      const safe =
        Date.now() +
        '-' +
        file.originalname.replace(/\s+/g, '_').replace(/[^\w\-.]/g, '');
      cb(null, safe);
    },
  });

  const fileFilter = (_req, file, cb) => {
    if (/^image\/(png|jpe?g|webp)$/i.test(file.mimetype)) cb(null, true);
    else cb(new Error('Only PNG/JPEG/WebP allowed'));
  };

  const upload = multer({ storage, fileFilter, limits: { fileSize: 5 * 1024 * 1024 } });

  // Example: POST /api/upload (field name: "avatar")
  app.post('/api/upload', upload.single('avatar'), async (req, res) => {
    try {
      const inPath = req.file.path;
      const outName = req.file.filename.replace(/\.(png|jpe?g|jpg|webp)$/i, '') + '.webp';
      const outPath = path.join(UPLOAD_DIR, outName);

      // Normalize: resize to max 512px and convert to WebP
      await sharp(inPath).resize({ width: 512, height: 512, fit: 'inside' }).webp().toFile(outPath);

      // Optionally delete original
      try { fs.unlinkSync(inPath); } catch {}

      const url = `/assets/uploads/${outName}`;
      res.json({ ok: true, url });
    } catch (err) {
      console.error('Upload failed:', err);
      res.status(500).json({ ok: false, message: 'Upload failed' });
    }
  });
} else {
  // Uploads disabled: return friendly response
  app.post('/api/upload', (_req, res) => {
    res
      .status(503)
      .json({ ok: false, message: 'Uploads are disabled on the free plan.' });
  });
}

// ---- SPA fallback (serve index.html) ----
app.get('*', (req, res, next) => {
  // Don’t hijack API routes
  if (req.path.startsWith('/api/')) return next();
  res.sendFile(path.join(PUBLIC_DIR, 'index.html'));
});

// ---- Start server ----
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Duck Race server running on http://localhost:${PORT}`);
});
