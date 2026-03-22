const sendEmail = require("./sendEmail");

const sendStudentInviteEmail = async ({
  name,
  email,
  password,
  inviteLink,
  inviteCode,
  year,
  division
}) => {
  if (!email) return false;

  const html = `
    <h3>Hello ${name || "Student"},</h3>
    <p>Your VisionAttend onboarding link is ready.</p>
    <p><b>Class:</b> ${year || "-"} ${division || "-"}</p>
    <p><b>Magic invite link:</b> <a href="${inviteLink}">${inviteLink}</a></p>
    <p><b>Invite code:</b> ${inviteCode}</p>
    ${password ? `<p><b>Temporary password:</b> ${password}</p>` : ""}
    <p>Open the link and complete face registration to activate your account.</p>
  `;

  return sendEmail({
    to: email,
    subject: "VisionAttend student invite",
    html
  });
};

module.exports = sendStudentInviteEmail;
