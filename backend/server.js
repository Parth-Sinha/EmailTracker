// --- NEW: Load environment variables from .env file ---
import 'dotenv/config';
import express from 'express';
import mongoose from 'mongoose';
import { v4 as uuidv4 } from 'uuid';
import cors from 'cors';

const app = express();
app.use(express.json());
app.use(cors());

// Log ALL requests for debugging
app.use((req, res, next) => {
  const timestamp = new Date().toISOString();
  console.log(`\n[${timestamp}] ${req.method} ${req.url}`);
  console.log('IP:', req.ip || req.headers['x-forwarded-for']);
  console.log('User-Agent:', req.headers['user-agent']);
  next();
});

// --- UPDATED: Database Connection ---
const MONGO_URI = process.env.MONGO_URI;

if (!MONGO_URI) {
  console.error('FATAL ERROR: MONGO_URI is not defined in the .env file.');
  process.exit(1);
}

mongoose.connect(MONGO_URI)
  .then(() => console.log('MongoDB Atlas connected successfully!'))
  .catch(err => console.error('MongoDB connection error:', err));

// --- Mongoose Schema ---
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
    referer: String,
  }],
});

const Email = mongoose.model('Email', emailSchema);


// --- API Routes ---
app.post('/api/v1/track', async (req, res) => {
  try {
    const { userId, recipient, subject } = req.body;
    console.log('Received tracking request:', { userId, recipient, subject });
    
    if (!userId) {
      return res.status(400).json({ error: 'Missing userId' });
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

    // Dynamically create the base URL
    const baseUrl = process.env.VERCEL_URL
      ? `https://${process.env.VERCEL_URL}`
      : `http://localhost:${process.env.PORT || 3000}`;

    // IMPORTANT: Add cache-busting and anti-proxy measures
    const timestamp = Date.now();
    const pixelUrl = `${baseUrl}/track/${trackingId}.png?t=${timestamp}&r=${Math.random().toString(36).substr(2, 9)}`;
    
    const pixelHtml = `<img src="${pixelUrl}" width="1" height="1" border="0" alt="" style="display:none !important; opacity:0 !important; width:0 !important; height:0 !important;">`;
    
    console.log(`[+] Generated pixel URL: ${pixelUrl}`);
    
    res.json({ 
      pixelHtml,
      trackingId,
      pixelUrl,
      message: 'Tracking pixel generated successfully'
    });

  } catch (error) {
    console.error('Error generating tracker:', error);
    res.status(500).json({ error: 'Server Error', details: error.message });
  }
});

// CRITICAL: This endpoint is what gets called when email is opened
app.get('/track/:trackingId.png', async (req, res) => {
  console.log('\n🎯 ===== TRACKING PIXEL HIT ===== 🎯');
  
  try {
    const { trackingId } = req.params;
    
    // Get all possible IP sources
    const ipAddress = req.headers['x-forwarded-for']?.split(',')[0]?.trim() ||
                     req.headers['x-real-ip'] || 
                     req.ip || 
                     req.connection.remoteAddress ||
                     'unknown';
    
    const userAgent = req.headers['user-agent'] || 'unknown';
    const referer = req.headers['referer'] || req.headers['referrer'] || 'direct';
    
    console.log('📧 Tracking Details:');
    console.log('   ID:', trackingId);
    console.log('   IP:', ipAddress);
    console.log('   User-Agent:', userAgent);
    console.log('   Referer:', referer);
    console.log('   Query:', req.query);
    console.log('   All Headers:', JSON.stringify(req.headers, null, 2));

    // Find and update the email
    const email = await Email.findOne({ trackingId });
    
    if (!email) {
      console.log('❌ ERROR: Email not found in database for tracking ID:', trackingId);
    } else {
      console.log('✅ Email found:', {
        recipient: email.recipient,
        subject: email.subject,
        sentAt: email.createdAt,
        previousOpens: email.opens.length
      });
      
      // Add the open event
      const updateResult = await Email.updateOne(
        { trackingId },
        { 
          $push: { 
            opens: { 
              timestamp: new Date(),
              ipAddress, 
              userAgent,
              referer 
            } 
          } 
        }
      );
      
      console.log('📊 Update Result:', updateResult);
      
      if (updateResult.modifiedCount > 0) {
        console.log('✅ ✅ ✅ EMAIL OPEN LOGGED SUCCESSFULLY! ✅ ✅ ✅');
      } else {
        console.log('⚠️  WARNING: Database update returned 0 modified documents');
      }
    }
  
  } catch (error) {
      console.error('❌ Error logging open event:', error);
      console.error('Stack:', error.stack);
  } finally {
    // ALWAYS return the pixel, even if there's an error
    const pixel = Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64');
    res.writeHead(200, {
      'Content-Type': 'image/gif',
      'Content-Length': pixel.length,
      'Cache-Control': 'no-cache, no-store, must-revalidate, private, max-age=0',
      'Pragma': 'no-cache',
      'Expires': '-1',
      'Access-Control-Allow-Origin': '*',
    });
    res.end(pixel);
    console.log('🎯 ===== END TRACKING PIXEL ===== 🎯\n');
  }
});

// Dashboard endpoint - get all emails for a user
app.get('/api/v1/emails/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const emails = await Email.find({ userId }).sort({ createdAt: -1 });
    
    const emailsWithStats = emails.map(email => ({
      trackingId: email.trackingId,
      recipient: email.recipient,
      subject: email.subject,
      sentAt: email.createdAt,
      openCount: email.opens.length,
      lastOpened: email.opens.length > 0 ? email.opens[email.opens.length - 1].timestamp : null,
      opens: email.opens
    }));
    
    res.json({ 
      emails: emailsWithStats,
      totalEmails: emails.length,
      totalOpens: emails.reduce((sum, e) => sum + e.opens.length, 0)
    });
  } catch (error) {
    console.error('Error fetching emails:', error);
    res.status(500).json({ error: 'Server Error' });
  }
});

// Get specific email details
app.get('/api/v1/email/:trackingId', async (req, res) => {
  try {
    const { trackingId } = req.params;
    const email = await Email.findOne({ trackingId });
    
    if (!email) {
      return res.status(404).json({ error: 'Email not found' });
    }
    
    res.json({ 
      email,
      openCount: email.opens.length,
      firstOpened: email.opens.length > 0 ? email.opens[0].timestamp : null,
      lastOpened: email.opens.length > 0 ? email.opens[email.opens.length - 1].timestamp : null
    });
  } catch (error) {
    console.error('Error fetching email:', error);
    res.status(500).json({ error: 'Server Error' });
  }
});

// Health check
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    mongodb: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected'
  });
});

// Test page with tracking pixel
app.get('/test', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>Email Tracking Test</title>
      <style>
        body { font-family: Arial; padding: 20px; max-width: 800px; margin: 0 auto; }
        .success { color: green; font-weight: bold; }
        .info { background: #e3f2fd; padding: 10px; margin: 10px 0; border-radius: 4px; }
      </style>
    </head>
    <body>
      <h1>📧 Email Tracking Test Page</h1>
      <p>This page simulates an email being opened. Check your server logs!</p>
      
      <div class="info">
        <p><strong>What should happen:</strong></p>
        <ol>
          <li>This page loads a 1x1 tracking pixel</li>
          <li>Your server receives a GET request to /track/test-id.png</li>
          <li>You should see detailed logs in your console/Vercel logs</li>
        </ol>
      </div>
      
      <p class="success">✅ If you see log entries in your terminal/Vercel, tracking works!</p>
      
      <!-- Hidden tracking pixel -->
      <img src="/track/test-tracking-id-12345.png?test=true" width="1" height="1" style="display:none;">
      
      <hr>
      <p><small>Tip: Open your browser's Network tab (F12) to see the image request</small></p>
    </body>
    </html>
  `);
});

// For local development
if (process.env.NODE_ENV !== 'production') {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`\n🚀 Server running on http://localhost:${PORT}`);
    console.log(`📊 Test tracking at: http://localhost:${PORT}/test`);
    console.log(`❤️  Health check: http://localhost:${PORT}/api/health\n`);
  });
}

// Export the app for Vercel to use
export default app;