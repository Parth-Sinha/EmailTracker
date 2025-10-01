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
// The connection string is now securely loaded from the .env file
const MONGO_URI = process.env.MONGO_URI;

// A check to ensure the connection string is loaded
if (!MONGO_URI) {
  console.error('FATAL ERROR: MONGO_URI is not defined in the .env file.');
  process.exit(1); // Exit the application if the database connection string is missing
}

mongoose.connect(MONGO_URI)
  .then(() => console.log('MongoDB Atlas connected successfully!'))
  .catch(err => console.error('MongoDB connection error:', err));

// --- Mongoose Schema (No changes below this line) ---
const emailSchema = new mongoose.Schema({
  trackingId: { type: String, required: true, unique: true },
  userId: { type: String, required: true }, // In a real app, this would be a User ID from your auth system
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

// 1. Endpoint to GENERATE a tracking pixel for a new email
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

    // Respond with the HTML for the tracking pixel
    const pixelHtml = `<img src="https://email-tracker-brown.vercel.app/track/${trackingId}.png" width="1" height="1" border="0" alt="">`;
    res.json({ pixelHtml });

  } catch (error) {
    console.error('Error generating tracker:', error);
    res.status(500).send('Server Error');
  }
});

// 2. Endpoint to LOG an email open event (the tracking pixel itself)
app.get('/track/:trackingId.png', async (req, res) => {
  try {
    const { trackingId } = req.params;
    const ipAddress = req.ip;
    const userAgent = req.headers['user-agent'];
    console.log('Received tracking pixel request:', { trackingId, ipAddress, userAgent });

    console.log(`[!] Email opened! | ID: ${trackingId}`);

    // Find the email and add the "open" event to its log
    await Email.updateOne(
      { trackingId },
      { $push: { opens: { ipAddress, userAgent } } }
    );
  
  } catch (error) {
      console.error('Error logging open event:', error);
  } finally {
    // IMPORTANT: Always respond with a 1x1 transparent pixel
    const pixel = Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64');
    res.writeHead(200, {
      'Content-Type': 'image/gif',
      'Content-Length': pixel.length,
    });
    res.end(pixel);
  }
});


export default app;
