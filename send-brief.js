const nodemailer = require('nodemailer');
const fs = require('fs');

const briefPath = 'C:\\Users\\Lenouvo\\.openclaw\\workspace`\\pre-market-brief-2026-05-08.md';
const briefMd = fs.readFileSync(briefPath, 'utf8');

// Convert markdown bold to HTML for nicer email
const briefHtml = briefMd
  .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
  .replace(/\n/g, '<br>\n')
  .replace(/---/g, '<hr>');

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.GMAIL_USER || '',
    pass: process.env.GMAIL_APP_PASSWORD || ''
  }
});

if (!process.env.GMAIL_USER || !process.env.GMAIL_APP_PASSWORD) {
  console.error('ERROR: GMAIL_USER and GMAIL_APP_PASSWORD environment variables not set.');
  console.error('To send the email, run:');
  console.error('  $env:GMAIL_USER="your@gmail.com"; $env:GMAIL_APP_PASSWORD="xxxx xxxx xxxx xxxx"; node send-brief.js');
  process.exit(1);
}

transporter.sendMail({
  from: process.env.GMAIL_USER,
  to: 'shravan.sangi@gmail.com',
  subject: 'Pre-Market Brief - May 8, 2026 | Action Items',
  text: briefMd,
  html: `<html><body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">${briefHtml}</body></html>`
}).then(info => {
  console.log('Email sent:', info.response);
}).catch(err => {
  console.error('Send failed:', err.message);
  process.exit(1);
});