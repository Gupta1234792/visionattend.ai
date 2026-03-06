const nodemailer = require("nodemailer");

const buildTransporter = () => {
  const emailUser = String(process.env.EMAIL_USER || "").trim();
  const emailPass = String(process.env.EMAIL_PASS || "").trim().replace(/\s+/g, "");

  if (!emailUser || !emailPass) {
    return null;
  }

  const smtpHost = String(process.env.EMAIL_HOST || "").trim();
  const smtpPort = Number(process.env.EMAIL_PORT || 0);

  if (smtpHost) {
    return nodemailer.createTransport({
      host: smtpHost,
      port: smtpPort || 587,
      secure: String(process.env.EMAIL_SECURE || "false") === "true",
      auth: {
        user: emailUser,
        pass: emailPass
      }
    });
  }

  return nodemailer.createTransport({
    service: process.env.EMAIL_SERVICE,
    auth: {
      user: emailUser,
      pass: emailPass
    }
  });
};

const sendEmail = async ({ to, subject, html }) => {
  try {
    const transporter = buildTransporter();
    if (!transporter) {
      console.error("Email send error: missing EMAIL_USER/EMAIL_PASS configuration");
      return false;
    }

    await transporter.sendMail({
      from: `"VisionAttend" <${process.env.EMAIL_USER}>`,
      to,
      subject,
      html
    });

    console.log("Email sent to:", to);
    return true;
  } catch (error) {
    console.error("Email send error:", error?.message || error);
    return false;
  }
};

module.exports = sendEmail;
