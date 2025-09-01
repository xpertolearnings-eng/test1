// Netlify Function: create-subscription.js
// This function finds an existing user or creates a new one,
// creates a subscription document in Firestore, and sends a welcome email.

const admin = require('firebase-admin');
// NOTE: In a real-world scenario, you would use a transactional email service.
// const nodemailer = require('nodemailer'); 

let db, auth;

try {
    if (!admin.apps.length) {
        admin.initializeApp({
            credential: admin.credential.cert({
                projectId: process.env.FIREBASE_PROJECT_ID,
                clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
                privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
            }),
        });
    }
    db = admin.firestore();
    auth = admin.auth();
} catch (e) {
    console.error("CRITICAL ERROR: Firebase admin initialization FAILED.", e);
}

// --- CONCEPTUAL EMAIL SENDING FUNCTION ---
// In a real application, you would configure this with a service like SendGrid, Mailgun, or AWS SES.
// This function simulates sending a welcome email.
async function sendWelcomeEmail(userData) {
    const { email, name, planId, durationDays } = userData;
    const journalUrl = 'https://journaltesting.netlify.app'; // Your live journal URL

    console.log(`--- SIMULATING WELCOME EMAIL ---`);
    console.log(`TO: ${email}`);
    console.log(`SUBJECT: Welcome to TraderLog!`);
    console.log(`BODY:`);
    console.log(`Hi ${name || 'Trader'},`);
    console.log(`\nWelcome to TraderLog! Your subscription is now active.`);
    console.log(`\nPLAN DETAILS:`);
    console.log(`- Plan: ${planId}`);
    console.log(`- Duration: ${durationDays} days`);
    console.log(`\nYou can log in to your journal here: ${journalUrl}`);
    console.log(`\nHappy trading!`);
    console.log(`---------------------------------`);

    // Example using Nodemailer (requires setup and environment variables for credentials)
    /*
    let transporter = nodemailer.createTransport({
        host: "smtp.example.com",
        port: 587,
        secure: false, // true for 465, false for other ports
        auth: {
            user: process.env.EMAIL_USER,
            pass: process.env.EMAIL_PASS,
        },
    });

    await transporter.sendMail({
        from: '"TraderLog" <no-reply@traderlog.com>',
        to: email,
        subject: "Welcome to TraderLog!",
        html: `<b>Hi ${name || 'Trader'},</b><p>Welcome to TraderLog! Your subscription for the ${planId} plan is now active for ${durationDays} days.</p><p>You can access your journal by clicking here: <a href="${journalUrl}">Login to Journal</a></p>`,
    });
    */
   
    return Promise.resolve(); // Simulate successful email sending
}


exports.handler = async (event) => {
  console.log("--- RUNNING SUBSCRIPTION FUNCTION (v5 with Welcome Email) ---");
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS'
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers, body: '' };
  }

  if (!db || !auth) {
      return { statusCode: 500, headers, body: JSON.stringify({ error: "Server configuration error." }) };
  }
  
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers, body: 'Method Not Allowed' };
  }

  let body;
  try {
    body = JSON.parse(event.body);
  } catch (parseError) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'Invalid request format.' }) };
  }

  try {
    const { planId, email, name, phone, affiliateId } = body;

    if (!planId || !email) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: 'Missing required fields: planId and email.' }) };
    }

    let userRecord;
    let isNewUser = false;
    try {
        userRecord = await auth.getUserByEmail(email);
    } catch (error) {
        if (error.code === 'auth/user-not-found') {
            userRecord = await auth.createUser({ email, displayName: name || '' });
            isNewUser = true;
        } else {
            throw error;
        }
    }
    
    const uid = userRecord.uid;
    const subscriptionRef = db.collection('subscriptions').doc(uid);

    if (planId === 'trial' && !isNewUser) {
        const doc = await subscriptionRef.get();
        if (doc.exists) {
            return {
                statusCode: 403, headers,
                body: JSON.stringify({ error: 'A free trial has already been used for this account.' }),
            };
        }
    }

    const now = new Date();
    let endDate = new Date();
    let durationDays = 0;

    switch (planId) {
      case 'trial': durationDays = 14; break;
      case 'monthly': durationDays = 30; break;
      case 'six-months': durationDays = 180; break;
      case 'yearly': durationDays = 365; break;
      default:
        return { statusCode: 400, headers, body: JSON.stringify({ error: 'Invalid planId provided.' }) };
    }
    
    endDate.setDate(now.getDate() + durationDays);

    const subscriptionData = {
      planId, userId: uid, userEmail: email, userName: name || null,
      userPhone: phone || null, affiliateId: affiliateId || 'direct',
      startDate: admin.firestore.Timestamp.fromDate(now),
      endDate: admin.firestore.Timestamp.fromDate(endDate),
      status: 'active', updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    };

    await subscriptionRef.set(subscriptionData, { merge: true });

    // --- SEND WELCOME EMAIL ---
    await sendWelcomeEmail({ email, name, planId, durationDays });

    return {
      statusCode: 200, headers,
      body: JSON.stringify({ success: true, message: 'Subscription activated successfully.' }),
    };

  } catch (error) {
    console.error('[LOG] CRITICAL: Unhandled exception.', error);
    return {
      statusCode: 500, headers,
      body: JSON.stringify({ error: 'An internal server error occurred.' }),
    };
  }
};
