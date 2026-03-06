const sendEmail = require("./sendEmail");

const sendPasswordResetEmail = async ({ name, email, resetToken }) => {
  const baseUrl = process.env.FRONTEND_URL || "http://localhost:3000";
  const safeBase = String(baseUrl).replace(/\/+$/, "");
  const resetUrl = `${safeBase}/auth?mode=reset&token=${encodeURIComponent(resetToken)}`;

  const html = `
    <h3>Hello ${name || "User"},</h3>
    <p>We received a password reset request for your <b>VisionAttend</b> account.</p>
    <p>Click this secure link to reset your password:</p>
    <p><a href="${resetUrl}">${resetUrl}</a></p>
    <p>This link expires in ${Number(process.env.RESET_TOKEN_EXP_MINUTES || 20)} minutes.</p>
    <p>If you did not request this, you can ignore this email.</p>
    <br/>
    <p>Regards,<br/>VisionAttend Team</p>
  `;

  return sendEmail({
    to: email,
    subject: "VisionAttend - Reset Your Password",
    html
  });
};

module.exports = sendPasswordResetEmail;

