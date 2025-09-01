exports.handler = async function(event, context) {
  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_PRIVATE_KEY;

  let report = "--- Environment Variable Report ---\n\n";
  
  if (projectId) {
    report += `✅ FIREBASE_PROJECT_ID is SET.\n   Value: ${projectId}\n\n`;
  } else {
    report += `❌ FIREBASE_PROJECT_ID is MISSING or incorrect.\n\n`;
  }

  if (clientEmail) {
    report += `✅ FIREBASE_CLIENT_EMAIL is SET.\n   Value: ${clientEmail}\n\n`;
  } else {
    report += `❌ FIREBASE_CLIENT_EMAIL is MISSING or incorrect.\n\n`;
  }

  if (privateKey && privateKey.includes("-----BEGIN PRIVATE KEY-----")) {
    report += `✅ FIREBASE_PRIVATE_KEY is SET and looks correct.\n\n`;
  } else {
    report += `❌ FIREBASE_PRIVATE_KEY is MISSING or has an invalid format.\n\n`;
  }

  report += "--- End of Report ---";

  return {
    statusCode: 200,
    headers: { 'Content-Type': 'text/plain' },
    body: report,
  };
};
