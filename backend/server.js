// --- NEW: Load environment variables from .env file ---
import 'dotenv/config';
import express from 'express';
import mongoose from 'mongoose';
import { v4 as uuidv4 } from 'uuid';
import cors from 'cors';

const app = express();
app.use(express.json());
app.use(cors());

// --- UPDATED: Database Connection ---
const MONGO_URI = process.env.MONGO_URI;

if (!MONGO_URI) {
  console.error('FATAL ERROR: MONGO_URI is not defined in the .env file.');
  process.exit(1);
}

mongoose.connect(MONGO_URI)
  .then(() => console.log('MongoDB Atlas connected successfully!'))
  .catch(err => console.error('MongoDB connection error:', err));

// --- Mongoose Schema (No changes below this line) ---
const emailSchema = new mongoose.Schema({
  trackingId: { type: String, required: true, unique: true },
  userId: { type: String, required: true },
  recipient: String,
  subject: String,
  createdAt: { type: Date, default: Date.now },
  opens: [{
    timestamp: { type: Date, default: Date.now },
    ipAddress: String,
    userAgent: String,
  }],
});

const Email = mongoose.model('Email', emailSchema);


// --- API Routes ---
app.post('/api/v1/track', async (req, res) => {
  try {
    const { userId, recipient, subject } = req.body;
    console.log('Received tracking request:', { userId, recipient, subject });
    if (!userId) {
      return res.status(400).send('Missing userId');
    }
    const trackingId = uuidv4();

    const newEmail = new Email({
      trackingId,
      userId,
      recipient,
      subject,
    });
    await newEmail.save();

    console.log(`[+] Tracking enabled for email to ${recipient} | ID: ${trackingId}`);

    // --- THIS IS THE UPDATED PART ---
    // Dynamically create the base URL. Use the VERCEL_URL if it exists (on Vercel),
    // otherwise, fall back to localhost for local development.
    const baseUrl = process.env.VERCEL_URL
      ? `https://${process.env.VERCEL_URL}`
      : 'http://localhost:3000';

    const pixelHtml = `<img src="${baseUrl}/track/${trackingId}.png" width="1" height="1" border="0" alt="">`;
    res.json({ pixelHtml });

  } catch (error) {
    console.error('Error generating tracker:', error);
    res.status(500).send('Server Error');
  }
});

app.get('/track/:trackingId.png', async (req, res) => {
  try {
    const { trackingId } = req.params;
    const ipAddress = req.ip;
    const userAgent = req.headers['user-agent'];
    console.log('Received tracking pixel request:', { trackingId, ipAddress, userAgent });

    console.log(`[!] Email opened! | ID: ${trackingId}`);

    await Email.updateOne(
      { trackingId },
      { $push: { opens: { ipAddress, userAgent } } }
    );
  
  } catch (error) {
      console.error('Error logging open event:', error);
  } finally {
    const pixel = Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64');
    res.writeHead(200, {
      'Content-Type': 'image/gif',
      'Content-Length': pixel.length,
    });
    res.end(pixel);
  }
});

// Export the app for Vercel to use
export default app;

