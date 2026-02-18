const nodemailer = require("nodemailer");

const sendEmail = async ({ to, subject, html }) => {
  try {
    const transporter = nodemailer.createTransport({
      service: process.env.EMAIL_SERVICE,
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
      }
    });

    await transporter.sendMail({
      from: `"VisionAttend" <${process.env.EMAIL_USER}>`,
      to,
      subject,
      html
    });

    console.log("Email sent to:", to);
    return true;
  } catch (error) {
    console.error("Email send error:", error);
    return false;
  }
};

module.exports = sendEmail;

