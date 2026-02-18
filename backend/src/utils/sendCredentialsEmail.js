const sendEmail = require("./sendEmail");

const sendCredentialsEmail = async ({ name, email, password, role }) => {
  const baseUrl = process.env.FRONTEND_URL || "http://localhost:3000";
  const loginUrl = `${baseUrl.replace(/\/$/, "")}/auth`;
  const roleLabel = String(role || "user").toUpperCase();

  const html = `
    <h3>Hello ${name},</h3>
    <p>Your <b>${roleLabel}</b> account has been created on <b>VisionAttend</b>.</p>
    <p><b>Login URL:</b> ${loginUrl}</p>
    <p><b>Email:</b> ${email}</p>
    <p><b>Password:</b> ${password}</p>
    <p>Please keep your credentials secure and change password after first login.</p>
    <br/>
    <p>Regards,<br/>VisionAttend Team</p>
  `;

  return sendEmail({
    to: email,
    subject: `VisionAttend - ${roleLabel} Account Created`,
    html
  });
};

module.exports = sendCredentialsEmail;

