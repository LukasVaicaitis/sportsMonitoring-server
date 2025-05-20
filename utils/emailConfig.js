const nodemailer = require('nodemailer');
require('dotenv').config();

const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: parseInt(process.env.SMTP_PORT, 10),
    secure: false,
    auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
    },
});

transporter.verify(function(error, success) {
  if (error) {
    console.error("Error verifying email transporter config:", error);
  } else {
    console.log("Email transporter is ready to send messages");
  }
});

module.exports = transporter;