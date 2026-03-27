const sendEmail = require("./sendEmail");

const sendCredentialsEmail = async ({ name, email, password, role }) => {
  const loginUrl = process.env.FRONTEND_LOGIN_URL || "https://visionattendai-brown.vercel.app/login";
  const roleLabel = String(role || "user").toUpperCase();

  const html = `
    <h3>Hello ${name},</h3>
    <p>Your <b>${roleLabel}</b> account has been created on <b>VisionAttend</b>.</p>
    <p><b>Login URL:</b> <a href="${loginUrl}">${loginUrl}</a></p>
    <p><b>Email:</b> ${email}</p>
    <p><b>Password:</b> ${password}</p>
    <p>Please keep your credentials secure and change password after first login.</p>
    <br/>
    <p>Regards,<br/>VisionAttend Team</p>
  `;

  return sendEmail({
    to: email,
    subject: "Your VisionAttend Account",
    html
  });
};

module.exports = sendCredentialsEmail;
