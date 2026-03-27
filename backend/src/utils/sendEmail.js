const nodemailer = require("nodemailer");

const EMAIL_TIMEOUT_MS = Math.max(3000, Number(process.env.EMAIL_TIMEOUT_MS || 10000));

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
      connectionTimeout: EMAIL_TIMEOUT_MS,
      greetingTimeout: EMAIL_TIMEOUT_MS,
      socketTimeout: EMAIL_TIMEOUT_MS,
      requireTLS: String(process.env.EMAIL_REQUIRE_TLS || "true") === "true",
      auth: {
        user: emailUser,
        pass: emailPass
      }
    });
  }

  return nodemailer.createTransport({
    service: process.env.EMAIL_SERVICE,
    connectionTimeout: EMAIL_TIMEOUT_MS,
    greetingTimeout: EMAIL_TIMEOUT_MS,
    socketTimeout: EMAIL_TIMEOUT_MS,
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

    await Promise.race([
      transporter.sendMail({
        from: process.env.EMAIL_FROM || `"VisionAttend" <${process.env.EMAIL_USER}>`,
        to,
        subject,
        html
      }),
      new Promise((_, reject) => {
        setTimeout(() => reject(new Error("Email send timeout")), EMAIL_TIMEOUT_MS);
      })
    ]);

    console.log("Email sent to:", to);
    return true;
  } catch (error) {
    console.error("Email send error:", {
      message: error?.message || error,
      to,
      subject,
      service: process.env.EMAIL_SERVICE || null,
      host: process.env.EMAIL_HOST || null,
      user: process.env.EMAIL_USER || null,
    });
    return false;
  }
};

module.exports = sendEmail;
