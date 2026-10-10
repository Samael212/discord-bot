const fs = require("fs");
const path = require("path");
const readline = require("readline");
const crypto = require("crypto");

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

function ask(label, defaultValue = "") {
  const suffix = defaultValue ? ` [${defaultValue}]` : "";

  return new Promise(resolve => {
    rl.question(`${label}${suffix}: `, answer => {
      const value = answer.trim();
      resolve(value || defaultValue);
    });
  });
}

function writeEnv(values) {
  const env = [
    `DISCORD_CLIENT_ID=${values.clientId}`,
    `DISCORD_CLIENT_SECRET=${values.clientSecret}`,
    `DISCORD_REDIRECT_URI=${values.redirectUri}`,
    `SESSION_SECRET=${values.sessionSecret}`,
    "",
    `DISCORD_BOT_TOKEN=${values.botToken}`,
    `DISCORD_GUILD_ID=${values.guildId}`,
    `DISCORD_VERIFY_ROLE_ID=${values.roleId}`,
    `DISCORD_LOGIN_LOG_CHANNEL_ID=${values.loginLogChannelId}`,
    `DISCORD_VERIFY_LOG_CHANNEL_ID=${values.verifyLogChannelId}`,
    `DISCORD_RESET_LOG_CHANNEL_ID=${values.resetLogChannelId}`,
    `DISCORD_ADMIN_ROLE_ID=${values.adminRoleId}`,
    `ADMIN_DISCORD_IDS=${values.adminDiscordIds}`,
    "",
    "PORT=3000",
    ""
  ].join("\r\n");

  const envPath = path.join(__dirname, ".env");

  fs.writeFileSync(
    envPath,
    env,
    {
      encoding: "utf8",
      mode: 0o600
    }
  );

  return envPath;
}

async function main() {
  console.clear();

  console.log("==========================================");
  console.log("      SHADOW BASILISK DISCORD SETUP");
  console.log("==========================================");
  console.log("");
  console.log("Ctrl+V = Paste");
  console.log("Ctrl+C = Cancel");
  console.log("");

  const clientId = await ask(
    "ID ไคลเอ็นต์ (DISCORD_CLIENT_ID)"
  );

  if (!clientId) {
    throw new Error("กรุณาใส่ ID ไคลเอ็นต์");
  }

  const clientSecret = await ask(
    "รหัสลับไคลเอนต์ (DISCORD_CLIENT_SECRET)"
  );

  if (!clientSecret) {
    throw new Error("กรุณาใส่รหัสลับไคลเอนต์");
  }

  const redirectUri = await ask(
    "Redirect URI",
    "http://localhost:3000/auth/discord/callback"
  );

  console.log("");
  console.log("----- VERIFY / AUTO ROLE / LOG -----");
  console.log("");

  const botToken = await ask(
    "Bot Token"
  );

  const guildId = await ask(
    "Server ID / Guild ID"
  );

  const roleId = await ask(
    "Verify Role ID"
  );

  console.log("LOG CHANNELS (สร้างแยก 3 ห้อง)");
  console.log("");

  const loginLogChannelId = await ask(
    "1. Discord Login Log Channel ID"
  );

  const verifyLogChannelId = await ask(
    "2. ยืนยันตัวตน Log Channel ID"
  );

  const resetLogChannelId = await ask(
    "3. ปลดล็อกการยืนยันใหม่ Log Channel ID"
  );

  const adminRoleId = await ask(
    "Admin Role ID (optional)"
  );

  const adminDiscordIds = await ask(
    "Admin Discord IDs, comma separated (optional)"
  );

  const sessionSecret =
    crypto.randomBytes(48).toString("hex");

  const envPath = writeEnv({
    clientId,
    clientSecret,
    redirectUri,
    botToken,
    guildId,
    roleId,
    loginLogChannelId,
    verifyLogChannelId,
    resetLogChannelId,
    adminRoleId,
    adminDiscordIds,
    sessionSecret
  });

  console.log("");
  console.log("==========================================");
  console.log("          SETUP COMPLETE");
  console.log("==========================================");
  console.log("");
  console.log(`สร้าง .env แล้ว: ${envPath}`);
  console.log("");
  console.log("Redirect URI:");
  console.log(redirectUri);
  console.log("");
  console.log("ขั้นตอนต่อไป:");
  console.log("1. ใส่ Redirect URI ใน Discord Developer Portal");
  console.log("2. ตรวจ Bot Permission: Manage Roles / Manage Nicknames");
  console.log("3. ตรวจ Role ของ Bot ให้อยู่สูงกว่า Verify Role");
  console.log("4. เปิด START.bat");
  console.log("");
}

main()
  .catch(error => {
    console.log("");
    console.error("[ERROR]", error.message);
    console.log("");
    process.exitCode = 1;
  })
  .finally(() => {
    rl.close();
  });
