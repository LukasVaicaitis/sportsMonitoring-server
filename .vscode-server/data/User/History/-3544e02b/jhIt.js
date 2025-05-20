const transporter = require('./emailConfig');
require('dotenv').config();

const sendEmail = async (options) => {
  const mailOptions = {
    from: `"${process.env.EMAIL_FROM_NAME || 'Your App Name'}" <${process.env.SMTP_USER}>`,
    to: options.to,
    subject: options.subject,
    text: options.text,
    html: options.html,
  };

  try {
    const info = await transporter.sendMail(mailOptions);
    console.log(`Email sent successfully to ${options.to}: ${info.messageId}`);
    return info;
  } catch (error) {
    console.error(`Error sending email to ${options.to}:`, error);
    throw new Error('Failed to send email');
  }
};

module.exports = sendEmail;