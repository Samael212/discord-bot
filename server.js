const express = require("express");
const session = require("express-session");
const path = require("path");
const crypto = require("crypto");
const fs = require("fs");
require("dotenv").config();

const app = express();
const PORT = process.env.PORT || 10000;
const HOST = "0.0.0.0";
const OAUTH_REDIRECT_URI = process.env.DISCORD_REDIRECT_URI || "http://localhost:3000/auth/discord/callback";

const {
  DISCORD_CLIENT_ID,
  DISCORD_CLIENT_SECRET,
  DISCORD_REDIRECT_URI,
  SESSION_SECRET,

  DISCORD_BOT_TOKEN,
  DISCORD_GUILD_ID,
  DISCORD_VERIFY_ROLE_ID,
  DISCORD_LOGIN_LOG_CHANNEL_ID,
  DISCORD_VERIFY_LOG_CHANNEL_ID,
  DISCORD_RESET_LOG_CHANNEL_ID,
  // Backward-compatible fallback for older .env files.
  DISCORD_LOG_CHANNEL_ID,

  // ADMIN can be authorized by a Discord role, explicit Discord IDs, or both.
  DISCORD_ADMIN_ROLE_ID,
  ADMIN_DISCORD_IDS
} = process.env;

app.disable("x-powered-by");

// Keep the local development hostname consistent with the OAuth redirect.
// Using 127.0.0.1 for the page and localhost for the callback creates a
// different browser cookie host and can cause "invalid_state" after login.
app.use((req, res, next) => {
    if (req.hostname === "127.0.0.1") {
        const host = String(req.get("host") || "0.0.0.0").replace(
            /^127\.0\.0\.1(?=:\d+$|$)/,
            "localhost"
        );
        return res.redirect(302, `${req.protocol}://${host}${req.originalUrl}`);
    }
    next();
});


app.use(express.json({ limit: "64kb" }));
app.use(express.urlencoded({ extended: true, limit: "64kb" }));

app.use(
  session({
    secret:
      SESSION_SECRET ||
      "shadow-dev-secret-change-this-immediately",

    resave: false,
    saveUninitialized: false,

    cookie: {
      httpOnly: true,
      sameSite: "lax",
      secure: false,
      maxAge: 1000 * 60 * 60 * 24
    }
  })
);

app.use(
  express.static(
    path.join(__dirname, "public")
  )
);

const DATA_DIR = path.join(__dirname, "data");
const ANNOUNCEMENTS_FILE = path.join(DATA_DIR, "announcements.json");
const REQUESTS_FILE = path.join(DATA_DIR, "requests.json");
fs.mkdirSync(DATA_DIR, { recursive: true });

function readJsonFile(file, fallback = []) {
  try {
    if (!fs.existsSync(file)) {
      fs.writeFileSync(file, JSON.stringify(fallback, null, 2), "utf8");
      return fallback;
    }
    const parsed = JSON.parse(fs.readFileSync(file, "utf8"));
    return Array.isArray(parsed) ? parsed : fallback;
  } catch (error) {
    console.error("[DATA READ ERROR]", file, error);
    return fallback;
  }
}

function writeJsonFile(file, value) {
  fs.writeFileSync(file, JSON.stringify(value, null, 2), "utf8");
}

function requireLogin(req, res) {
  if (!req.session.user) {
    res.status(401).json({ success: false, message: "กรุณาเข้าสู่ระบบ Discord ก่อน" });
    return false;
  }
  return true;
}

async function requireAdmin(req, res) {
  if (!requireLogin(req, res)) return false;
  const admin = await isAdminUser(req.session.user.id);
  if (!admin) {
    res.status(403).json({ success: false, message: "คุณไม่มีสิทธิ์ ADMIN" });
    return false;
  }
  return true;
}

const verificationLocks = new Set();

// ======================================================
// CONFIG HELPERS
// ======================================================

function discordOAuthConfigured() {
  return Boolean(
    DISCORD_CLIENT_ID &&
    DISCORD_CLIENT_SECRET &&
    OAUTH_REDIRECT_URI
  );
}

function discordVerifyConfigured() {
  return Boolean(
    DISCORD_BOT_TOKEN &&
    DISCORD_GUILD_ID &&
    DISCORD_VERIFY_ROLE_ID
  );
}

function discordLogConfigured() {
  return Boolean(
    DISCORD_BOT_TOKEN &&
    DISCORD_LOGIN_LOG_CHANNEL_ID &&
    DISCORD_VERIFY_LOG_CHANNEL_ID &&
    DISCORD_RESET_LOG_CHANNEL_ID
  );
}

function getLogChannelId(logType = "verify") {
  const channels = {
    login: DISCORD_LOGIN_LOG_CHANNEL_ID,
    verify: DISCORD_VERIFY_LOG_CHANNEL_ID,
    reset: DISCORD_RESET_LOG_CHANNEL_ID
  };

  // Keep older installations working until SETUP-DISCORD is run again.
  return channels[logType] || DISCORD_LOG_CHANNEL_ID || "";
}

function adminAuthConfigured() {
  return Boolean(
    DISCORD_ADMIN_ROLE_ID ||
    getAdminIdSet().size > 0
  );
}

function getAdminIdSet() {
  return new Set(
    String(ADMIN_DISCORD_IDS || "")
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean)
  );
}

function discordHeaders() {
  return {
    Authorization: `Bot ${DISCORD_BOT_TOKEN}`
  };
}

function safeText(value, max = 100) {
  return String(value || "")
    .replace(/[\u0000-\u001F\u007F]/g, "")
    .trim()
    .slice(0, max);
}

function validDiscordId(value) {
  return /^\d{16,22}$/.test(String(value || "").trim());
}

function avatarURLFor(user) {
  if (!user?.avatar) {
    return null;
  }

  const extension =
    user.avatar.startsWith("a_")
      ? "gif"
      : "png";

  return (
    `https://cdn.discordapp.com/avatars/` +
    `${user.id}/${user.avatar}.${extension}?size=256`
  );
}

// ======================================================
// DISCORD API HELPERS
// ======================================================

async function getGuildMember(userId) {
  try {
    const response =
      await fetch(
        `https://discord.com/api/v10/guilds/${DISCORD_GUILD_ID}/members/${userId}`,
        {
          headers:
            discordHeaders()
        }
      );

    if (!response.ok) {
      const errorText =
        await response.text();

      return {
        ok: false,
        status:
          response.status,
        member: null,
        errorText
      };
    }

    return {
      ok: true,
      status:
        response.status,
      member:
        await response.json(),
      errorText: ""
    };

  } catch (error) {
    return {
      ok: false,
      status: 500,
      member: null,
      errorText:
        error.message
    };
  }
}

function memberHasRole(member, roleId) {
  return Boolean(
    Array.isArray(member?.roles) &&
    member.roles.includes(roleId)
  );
}

async function isAdminUser(userId, knownMember = null) {
  if (
    getAdminIdSet().has(
      String(userId)
    )
  ) {
    return true;
  }

  if (!DISCORD_ADMIN_ROLE_ID) {
    return false;
  }

  let member =
    knownMember;

  if (!member) {
    const result =
      await getGuildMember(
        userId
      );

    if (!result.ok) {
      return false;
    }

    member =
      result.member;
  }

  return memberHasRole(
    member,
    DISCORD_ADMIN_ROLE_ID
  );
}

async function changeDiscordNickname(userId, nickname) {
  const cleanNickname =
    safeText(
      nickname,
      32
    );

  if (!cleanNickname) {
    return {
      ok: false,
      status: 400,
      code: "EMPTY_NICKNAME",
      message:
        "ชื่อเล่นว่าง"
    };
  }

  try {
    const response =
      await fetch(
        `https://discord.com/api/v10/guilds/${DISCORD_GUILD_ID}/members/${userId}`,
        {
          method: "PATCH",

          headers: {
            ...discordHeaders(),
            "Content-Type":
              "application/json"
          },

          body:
            JSON.stringify({
              nick:
                cleanNickname
            })
        }
      );

    if (!response.ok) {
      const errorText =
        await response.text();

      let discordError = null;

      try {
        discordError =
          JSON.parse(
            errorText
          );
      } catch (_) {
        discordError =
          null;
      }

      const discordCode =
        discordError?.code ??
        null;

      const discordMessage =
        discordError?.message ||
        errorText ||
        "Unknown Discord error";

      console.error(
        "[DISCORD NICKNAME ERROR]",
        {
          status:
            response.status,

          discordCode,

          discordMessage,

          userId,

          nickname:
            cleanNickname
        }
      );

      let friendlyMessage =
        `เปลี่ยนชื่อเล่นไม่สำเร็จ (HTTP ${response.status})`;

      if (
        response.status === 401
      ) {
        friendlyMessage =
          "BOT TOKEN ไม่ถูกต้อง";
      }

      if (
        response.status === 403 &&
        discordCode === 50013
      ) {
        friendlyMessage =
          "Bot ไม่มีสิทธิ์เปลี่ยนชื่อ: เปิด Manage Nicknames และย้าย Role ของ Bot ให้อยู่สูงกว่า Role สูงสุดของสมาชิก";
      }

      if (
        response.status === 403 &&
        discordCode !== 50013
      ) {
        friendlyMessage =
          "Discord ปฏิเสธการเปลี่ยนชื่อ (403): ตรวจ Manage Nicknames และลำดับ Role ของ Bot";
      }

      if (
        response.status === 404
      ) {
        friendlyMessage =
          "ไม่พบสมาชิกใน Discord Server";
      }

      return {
        ok: false,
        status:
          response.status,

        code:
          discordCode,

        message:
          friendlyMessage,

        rawMessage:
          discordMessage
      };
    }

    return {
      ok: true,
      status:
        response.status,

      code:
        null,

      nickname:
        cleanNickname,

      message:
        "เปลี่ยนชื่อเล่นสำเร็จ"
    };

  } catch (error) {
    console.error(
      "[DISCORD NICKNAME ERROR]",
      error
    );

    return {
      ok: false,
      status: 500,
      code:
        "REQUEST_FAILED",

      message:
        "เชื่อมต่อ Discord เพื่อเปลี่ยนชื่อไม่สำเร็จ",

      rawMessage:
        error.message
    };
  }
}

// ======================================================
// DISCORD LOG
// ======================================================

async function sendDiscordLog({
  logType = "verify",
  title,
  description = "",
  color = 0x2ecc71,
  fields = []
}) {
  const channelId = getLogChannelId(logType);

  if (!DISCORD_BOT_TOKEN || !channelId) {
    return false;
  }

  try {
    const payload = {
      embeds: [
        {
          title,
          description,
          color,

          fields:
            fields
              .filter(
                (field) =>
                  field &&
                  field.name
              )
              .map(
                (field) => ({
                  name:
                    String(
                      field.name
                    ).slice(
                      0,
                      256
                    ),

                  value:
                    String(
                      field.value ??
                      "-"
                    ).slice(
                      0,
                      1024
                    ),

                  inline:
                    Boolean(
                      field.inline
                    )
                })
              ),

          footer: {
            text:
              "SHADOW BASILISK • Verification Log"
          },

          timestamp:
            new Date()
              .toISOString()
        }
      ]
    };

    const response =
      await fetch(
        `https://discord.com/api/v10/channels/${channelId}/messages`,
        {
          method: "POST",

          headers: {
            Authorization:
              `Bot ${DISCORD_BOT_TOKEN}`,

            "Content-Type":
              "application/json"
          },

          body:
            JSON.stringify(
              payload
            )
        }
      );

    if (!response.ok) {
      console.error(
        "[DISCORD LOG ERROR]",
        response.status,
        await response.text()
      );

      return false;
    }

    return true;

  } catch (error) {
    console.error(
      "[DISCORD LOG ERROR]",
      error
    );

    return false;
  }
}

function userLogFields(user, extra = []) {
  const displayName =
    user?.globalName ||
    user?.username ||
    "Unknown";

  return [
    {
      name:
        "Discord",

      value:
        `${displayName}\n` +
        `<@${user?.id || "0"}>`,

      inline: true
    },

    {
      name:
        "Discord ID",

      value:
        user?.id || "-",

      inline: true
    },

    ...extra
  ];
}

// ======================================================
// HEALTH / STATUS
// ======================================================

app.get(
  "/health",
  (req, res) => {

    res.json({
      ok: true,

      discordLogin:
        discordOAuthConfigured(),

      discordVerify:
        discordVerifyConfigured(),

      discordLog:
        discordLogConfigured(),

      adminReset:
        adminAuthConfigured()
    });
  }
);

app.get(
  "/api/auth/status",
  (req, res) => {

    res.json({
      configured:
        discordOAuthConfigured(),

      verifyConfigured:
        discordVerifyConfigured(),

      logConfigured:
        discordLogConfigured(),

      adminConfigured:
        adminAuthConfigured(),

      redirectUri: OAUTH_REDIRECT_URI
    });
  }
);

// ======================================================
// DISCORD LOGIN
// ======================================================

app.get(
  "/auth/discord",
  (req, res) => {

    if (
      !discordOAuthConfigured()
    ) {
      return res.redirect(
        "/?login=config_required"
      );
    }

    const state =
      crypto
        .randomBytes(24)
        .toString("hex");

    req.session.discordOAuthState =
      state;

    const params =
      new URLSearchParams({
        client_id:
          DISCORD_CLIENT_ID,

        redirect_uri:
          OAUTH_REDIRECT_URI,

        response_type:
          "code",

        scope:
          "identify",

        state
      });

    res.redirect(
      "https://discord.com/oauth2/authorize?" +
      params.toString()
    );
  }
);

app.get(
  "/auth/discord/callback",
  async (req, res) => {

    const {
      code,
      state,
      error
    } = req.query;

    if (error) {
      return res.redirect(
        "/?login=access_denied"
      );
    }

    if (
      !code ||
      !state ||
      state !==
        req.session.discordOAuthState
    ) {
      return res.redirect(
        "/?login=invalid_state"
      );
    }

    delete req.session
      .discordOAuthState;

    try {
      const tokenResponse =
        await fetch(
          "https://discord.com/api/oauth2/token",
          {
            method:
              "POST",

            headers: {
              "Content-Type":
                "application/x-www-form-urlencoded"
            },

            body:
              new URLSearchParams({
                client_id:
                  DISCORD_CLIENT_ID,

                client_secret:
                  DISCORD_CLIENT_SECRET,

                grant_type:
                  "authorization_code",

                code,

                redirect_uri:
                  OAUTH_REDIRECT_URI
              })
          }
        );

      if (!tokenResponse.ok) {
        console.error(
          "[DISCORD TOKEN ERROR]",
          tokenResponse.status,
          await tokenResponse.text()
        );

        return res.redirect(
          "/?login=failed"
        );
      }

      const tokenData =
        await tokenResponse
          .json();

      const userResponse =
        await fetch(
          "https://discord.com/api/users/@me",
          {
            headers: {
              Authorization:
                `Bearer ${tokenData.access_token}`
            }
          }
        );

      if (!userResponse.ok) {
        console.error(
          "[DISCORD USER ERROR]",
          userResponse.status,
          await userResponse.text()
        );

        return res.redirect(
          "/?login=failed"
        );
      }

      const discordUser =
        await userResponse
          .json();

      req.session.user = {
        id:
          discordUser.id,

        username:
          discordUser.username,

        globalName:
          discordUser.global_name,

        avatar:
          discordUser.avatar
      };

      await sendDiscordLog({
        logType: "login",
        title:
          "🔐 Discord Login",

        description:
          "มีผู้ใช้เข้าสู่ระบบเว็บไซต์ SHADOW BASILISK",

        color:
          0x5865F2,

        fields:
          userLogFields(
            req.session.user
          )
      });

      req.session.save(
        () => {
          res.redirect(
            "/?login=success"
          );
        }
      );

    } catch (error) {
      console.error(
        "[DISCORD CALLBACK ERROR]",
        error
      );

      res.redirect(
        "/?login=failed"
      );
    }
  }
);

// ======================================================
// CURRENT USER
// ======================================================

app.get(
  "/api/me",
  async (req, res) => {

    if (!req.session.user) {
      return res
        .status(401)
        .json({
          loggedIn: false
        });
    }

    const user = req.session.user;

    let nickname = null;

    // Read the current Server Nickname so the website can show
    // the same name that Discord members see inside the server.
    if (discordVerifyConfigured()) {
      const memberResult = await getGuildMember(user.id);

      if (memberResult.ok) {
        nickname = memberResult.member?.nick || null;
      }
    }

    res.json({
      loggedIn: true,

      user: {
        id:
          user.id,

        username:
          user.username,

        globalName:
          user.globalName,

        nickname,

        displayName:
          nickname ||
          user.globalName ||
          user.username,

        avatarURL:
          avatarURLFor(user)
      }
    });
  }
);

// ======================================================
// VERIFY STATUS
//
// The verify role itself is the lock.
// - Has role     => verified, cannot verify again.
// - Role removed => may verify again.
// Leaving a Discord server removes member roles automatically,
// so after leaving + rejoining the status becomes unverified.
// ======================================================

app.get(
  "/api/verify/status",
  async (req, res) => {

    if (!req.session.user) {
      return res
        .status(401)
        .json({
          success: false,
          message:
            "กรุณาเข้าสู่ระบบ Discord ก่อน"
        });
    }

    if (!discordVerifyConfigured()) {
      return res
        .status(500)
        .json({
          success: false,
          message:
            "ระบบยืนยันตัวตนยังตั้งค่าไม่ครบ"
        });
    }

    const userId =
      req.session.user.id;

    const memberResult =
      await getGuildMember(
        userId
      );

    if (
      !memberResult.ok &&
      memberResult.status === 404
    ) {
      return res.json({
        success: true,
        inServer: false,
        verified: false,

        isAdmin:
          getAdminIdSet()
            .has(
              String(userId)
            ),

        message:
          "ยังไม่พบบัญชีนี้ใน Discord Server"
      });
    }

    if (!memberResult.ok) {
      return res
        .status(500)
        .json({
          success: false,

          message:
            memberResult.status === 401
              ? "BOT TOKEN ไม่ถูกต้อง"
              : `ตรวจสอบสถานะไม่สำเร็จ (HTTP ${memberResult.status})`
        });
    }

    const verified =
      memberHasRole(
        memberResult.member,
        DISCORD_VERIFY_ROLE_ID
      );

    const isAdmin =
      await isAdminUser(
        userId,
        memberResult.member
      );

    res.json({
      success: true,
      inServer: true,
      verified,
      isAdmin,

      message:
        verified
          ? "ยืนยันเสร็จสิ้น"
          : "ยังไม่ได้ยืนยันตัวตน"
    });
  }
);

// ======================================================
// VERIFY
// ======================================================

app.post(
  "/api/verify",
  async (req, res) => {

    try {
      if (!req.session.user) {
        return res
          .status(401)
          .json({
            success: false,
            message:
              "กรุณาเข้าสู่ระบบ Discord ก่อน"
          });
      }

      if (!discordVerifyConfigured()) {
        return res
          .status(500)
          .json({
            success: false,
            message:
              "ระบบยืนยันตัวตนยังตั้งค่าไม่ครบ"
          });
      }

      const userId =
        req.session.user.id;

      if (verificationLocks.has(userId)) {
        return res
          .status(429)
          .json({
            success: false,
            message: "กำลังดำเนินการยืนยันตัวตนอยู่ กรุณารอสักครู่"
          });
      }

      verificationLocks.add(userId);

      // Check current member + lock status FIRST.
      const memberResult =
        await getGuildMember(
          userId
        );

      if (
        !memberResult.ok &&
        memberResult.status === 404
      ) {
        return res
          .status(400)
          .json({
            success: false,
            code:
              "NOT_IN_SERVER",
            message:
              "ไม่พบบัญชีนี้ใน Discord Server กรุณาเข้า Server ก่อน"
          });
      }

      if (!memberResult.ok) {
        return res
          .status(500)
          .json({
            success: false,
            message:
              memberResult.status === 401
                ? "BOT TOKEN ไม่ถูกต้อง กรุณาตรวจ DISCORD_BOT_TOKEN"
                : `ตรวจสอบสมาชิก Discord ไม่สำเร็จ (HTTP ${memberResult.status})`
          });
      }

      // Already verified = LOCKED.
      // No role update and no nickname update on repeated submissions.
      if (
        memberHasRole(
          memberResult.member,
          DISCORD_VERIFY_ROLE_ID
        )
      ) {
        await sendDiscordLog({
          logType: "verify",
          title:
            "🔒 Duplicate Verify Blocked",

          description:
            "ระบบบล็อกการยืนยันซ้ำ เนื่องจากผู้ใช้ยืนยันเสร็จสิ้นแล้ว",

          color:
            0xf1c40f,

          fields:
            userLogFields(
              req.session.user,
              [
                {
                  name:
                    "Status",

                  value:
                    "ยืนยันเสร็จสิ้นแล้ว / ไม่อนุญาตให้ยืนยันซ้ำ",

                  inline:
                    false
                }
              ]
            )
        });

        return res
          .status(409)
          .json({
            success: false,
            code:
              "ALREADY_VERIFIED",
            verified: true,
            message:
              "ยืนยันเสร็จสิ้นแล้ว ไม่สามารถยืนยันซ้ำได้"
          });
      }

      const icName =
        safeText(
          req.body.icName,
          50
        );

      const studentId =
        safeText(
          req.body.studentId,
          30
        );

      if (icName.length < 2) {
        return res
          .status(400)
          .json({
            success: false,
            message:
              "กรุณากรอกชื่อ - นามสกุล IC ให้ถูกต้อง"
          });
      }

      // Add verify role.
      const roleResponse =
        await fetch(
          `https://discord.com/api/v10/guilds/${DISCORD_GUILD_ID}/members/${userId}/roles/${DISCORD_VERIFY_ROLE_ID}`,
          {
            method:
              "PUT",

            headers:
              discordHeaders()
          }
        );

      if (!roleResponse.ok) {
        const errorText =
          await roleResponse
            .text();

        console.error(
          "[DISCORD ROLE ERROR]",
          roleResponse.status,
          errorText
        );

        await sendDiscordLog({
          logType: "verify",
          title:
            "❌ Verify / Role Failed",

          description:
            `Discord API ไม่สามารถเพิ่ม Role ได้ (HTTP ${roleResponse.status})`,

          color:
            0xe74c3c,

          fields:
            userLogFields(
              req.session.user,
              [
                {
                  name:
                    "IC Name",

                  value:
                    icName || "-",

                  inline:
                    true
                },

                {
                  name:
                    "Role",

                  value:
                    `<@&${DISCORD_VERIFY_ROLE_ID}>`,

                  inline:
                    true
                }
              ]
            )
        });

        if (roleResponse.status === 401) {
          return res
            .status(500)
            .json({
              success: false,
              message:
                "BOT TOKEN ไม่ถูกต้อง"
            });
        }

        if (roleResponse.status === 403) {
          return res
            .status(500)
            .json({
              success: false,
              message:
                "Bot ไม่มีสิทธิ์ให้ Role กรุณาเปิด Manage Roles และวาง Role Bot ให้อยู่สูงกว่า Role SHADOW"
            });
        }

        if (roleResponse.status === 404) {
          return res
            .status(500)
            .json({
              success: false,
              message:
                "ไม่พบ Server / สมาชิก / Role กรุณาตรวจ Guild ID และ Role ID"
            });
        }

        return res
          .status(500)
          .json({
            success: false,
            message:
              `เพิ่ม Role ไม่สำเร็จ (HTTP ${roleResponse.status})`
          });
      }

      // Nickname is changed only on the first successful verify.
      const nicknameResult =
        await changeDiscordNickname(
          userId,
          icName
        );

      console.log(
        "[VERIFY SUCCESS]",
        {
          discord:
            req.session.user.username,

          discordId:
            userId,

          icName,

          studentId:
            studentId || "-"
        }
      );

      await sendDiscordLog({
        logType: "verify",
        title:
          "✅ Verify Success",

        description:
          "ยืนยันตัวตนสมาชิก SHADOW BASILISK สำเร็จ",

        color:
          0x2ecc71,

        fields:
          userLogFields(
            req.session.user,
            [
              {
                name:
                  "IC Name",

                value:
                  icName || "-",

                inline:
                  true
              },

              {
                name:
                  "Student ID",

                value:
                  studentId || "-",

                inline:
                  true
              },

              {
                name:
                  "Role Added",

                value:
                  `<@&${DISCORD_VERIFY_ROLE_ID}>`,

                inline:
                  true
              },

              {
                name:
                  "Nickname",

                value:
                  nicknameResult.ok
                    ? nicknameResult.nickname
                    : nicknameResult.message,

                inline:
                  true
              },

              {
                name:
                  "Nickname Error",

                value:
                  nicknameResult.ok
                    ? "-"
                    : `HTTP ${nicknameResult.status}${nicknameResult.code ? ` / Discord ${nicknameResult.code}` : ""}`,

                inline:
                  true
              }
            ]
          )
      });

      res.json({
        success: true,
        verified: true,
        message:
          "ยืนยันเสร็จสิ้น",

        nicknameChanged:
          nicknameResult.ok,

        nickname:
          nicknameResult.ok
            ? nicknameResult.nickname
            : null,

        nicknameError:
          nicknameResult.ok
            ? null
            : nicknameResult.message,

        nicknameErrorStatus:
          nicknameResult.ok
            ? null
            : nicknameResult.status,

        nicknameErrorCode:
          nicknameResult.ok
            ? null
            : nicknameResult.code
      });

    } catch (error) {
      console.error(
        "[VERIFY SERVER ERROR]",
        error
      );

      res
        .status(500)
        .json({
          success: false,
          message:
            "เกิดข้อผิดพลาดในระบบยืนยันตัวตน"
        });
    } finally {
      verificationLocks.delete(req.session.user?.id);
    }
  }
);

// ======================================================
// ADMIN RESET VERIFY
//
// ADMIN enters the target Discord ID.
// The server removes the verify role.
// After the role is removed, that user may verify again once.
// ======================================================

app.post(
  "/api/admin/reset-verification",
  async (req, res) => {

    try {
      if (!req.session.user) {
        return res
          .status(401)
          .json({
            success: false,
            message:
              "กรุณาเข้าสู่ระบบ Discord ก่อน"
          });
      }

      if (!discordVerifyConfigured()) {
        return res
          .status(500)
          .json({
            success: false,
            message:
              "ระบบยืนยันตัวตนยังตั้งค่าไม่ครบ"
          });
      }

      const adminId =
        req.session.user.id;

      const adminMemberResult =
        await getGuildMember(
          adminId
        );

      const adminMember =
        adminMemberResult.ok
          ? adminMemberResult.member
          : null;

      const isAdmin =
        await isAdminUser(
          adminId,
          adminMember
        );

      if (!isAdmin) {
        await sendDiscordLog({
          logType: "reset",
          title:
            "⛔ Unauthorized Reset Attempt",

          description:
            "มีผู้ใช้พยายาม Reset Verify โดยไม่มีสิทธิ์ ADMIN",

          color:
            0xe74c3c,

          fields:
            userLogFields(
              req.session.user
            )
        });

        return res
          .status(403)
          .json({
            success: false,
            message:
              "เฉพาะ ADMIN เท่านั้นที่สามารถปลดล็อกการยืนยันใหม่ได้"
          });
      }

      const targetId =
        safeText(
          req.body.discordId,
          22
        );

      if (!validDiscordId(targetId)) {
        return res
          .status(400)
          .json({
            success: false,
            message:
              "กรุณาใส่ Discord ID ให้ถูกต้อง"
          });
      }

      const targetMemberResult =
        await getGuildMember(
          targetId
        );

      // If the target has left the server, there is no role to remove.
      // When they join again, Discord creates a fresh member without the verify role.
      if (
        !targetMemberResult.ok &&
        targetMemberResult.status === 404
      ) {
        await sendDiscordLog({
          logType: "reset",
          title:
            "♻️ ADMIN Verify Reset",

          description:
            "ผู้ใช้เป้าหมายไม่ได้อยู่ใน Server แล้ว จึงถือว่าสามารถยืนยันใหม่ได้เมื่อกลับเข้า Server",

          color:
            0x3498db,

          fields:
            userLogFields(
              req.session.user,
              [
                {
                  name:
                    "Target Discord ID",

                  value:
                    targetId,

                  inline:
                    true
                }
              ]
            )
        });

        return res.json({
          success: true,
          outOfServer: true,
          message:
            "ID นี้ไม่ได้อยู่ใน Server แล้ว เมื่อเข้า Server ใหม่จะสามารถยืนยันได้"
        });
      }

      if (!targetMemberResult.ok) {
        return res
          .status(500)
          .json({
            success: false,
            message:
              `ตรวจสอบสมาชิกเป้าหมายไม่สำเร็จ (HTTP ${targetMemberResult.status})`
          });
      }

      // Already unlocked.
      if (
        !memberHasRole(
          targetMemberResult.member,
          DISCORD_VERIFY_ROLE_ID
        )
      ) {
        return res.json({
          success: true,
          alreadyReset: true,
          message:
            "บัญชีนี้สามารถยืนยันใหม่ได้อยู่แล้ว"
        });
      }

      const removeRoleResponse =
        await fetch(
          `https://discord.com/api/v10/guilds/${DISCORD_GUILD_ID}/members/${targetId}/roles/${DISCORD_VERIFY_ROLE_ID}`,
          {
            method:
              "DELETE",

            headers:
              discordHeaders()
          }
        );

      if (!removeRoleResponse.ok) {
        const errorText =
          await removeRoleResponse
            .text();

        console.error(
          "[ADMIN RESET ROLE ERROR]",
          removeRoleResponse.status,
          errorText
        );

        if (removeRoleResponse.status === 403) {
          return res
            .status(500)
            .json({
              success: false,
              message:
                "Bot ไม่มีสิทธิ์นำ Role ออก กรุณาตรวจ Manage Roles และลำดับ Role"
            });
        }

        return res
          .status(500)
          .json({
            success: false,
            message:
              `ปลดล็อกไม่สำเร็จ (HTTP ${removeRoleResponse.status})`
          });
      }

      await sendDiscordLog({
        logType: "reset",
        title:
          "♻️ ADMIN Verify Reset",

        description:
          "ADMIN อนุญาตให้ผู้ใช้ยืนยันตัวตนใหม่",

        color:
          0x9b59b6,

        fields:
          userLogFields(
            req.session.user,
            [
              {
                name:
                  "Target",

                value:
                  `<@${targetId}>`,

                inline:
                  true
              },

              {
                name:
                  "Target Discord ID",

                value:
                  targetId,

                inline:
                  true
              },

              {
                name:
                  "Action",

                value:
                  "นำ Verify Role ออก / สามารถยืนยันใหม่ได้",

                inline:
                  false
              }
            ]
          )
      });

      res.json({
        success: true,
        reset: true,
        discordId:
          targetId,
        message:
          "ปลดล็อกสำเร็จ บัญชีนี้สามารถยืนยันใหม่ได้แล้ว"
      });

    } catch (error) {
      console.error(
        "[ADMIN RESET ERROR]",
        error
      );

      res
        .status(500)
        .json({
          success: false,
          message:
            "เกิดข้อผิดพลาดในการปลดล็อกการยืนยัน"
        });
    }
  }
);

// ======================================================
// ANNOUNCEMENTS
// ======================================================
app.get("/api/announcements", (req, res) => {
  res.json({ success: true, announcements: readJsonFile(ANNOUNCEMENTS_FILE, []) });
});

app.post("/api/admin/announcements", async (req, res) => {
  if (!(await requireAdmin(req, res))) return;
  const title = safeText(req.body?.title, 120).trim();
  const date = safeText(req.body?.date, 30).trim();
  const text = safeText(req.body?.text, 2000).trim();
  if (!title || !text) return res.status(400).json({ success: false, message: "กรุณากรอกหัวข้อและรายละเอียดประกาศ" });
  const items = readJsonFile(ANNOUNCEMENTS_FILE, []);
  const item = { id: crypto.randomUUID(), title, date, text, createdAt: new Date().toISOString(), authorId: req.session.user.id };
  items.unshift(item);
  writeJsonFile(ANNOUNCEMENTS_FILE, items.slice(0, 100));
  res.json({ success: true, announcement: item });
});

app.delete("/api/admin/announcements/:id", async (req, res) => {
  if (!(await requireAdmin(req, res))) return;
  const items = readJsonFile(ANNOUNCEMENTS_FILE, []);
  const next = items.filter(item => item.id !== req.params.id);
  if (next.length === items.length) return res.status(404).json({ success: false, message: "ไม่พบประกาศ" });
  writeJsonFile(ANNOUNCEMENTS_FILE, next);
  res.json({ success: true, message: "ลบประกาศแล้ว" });
});

// ======================================================
// TEACHER REQUESTS
// ======================================================
app.post("/api/requests", (req, res) => {
  if (!requireLogin(req, res)) return;
  const teacher = safeText(req.body?.teacher, 40).trim();
  const subject = safeText(req.body?.subject, 120).trim();
  const message = safeText(req.body?.message, 2000).trim();
  if (!teacher || !subject || !message) return res.status(400).json({ success: false, message: "กรุณากรอกข้อมูลให้ครบ" });
  const items = readJsonFile(REQUESTS_FILE, []);
  const item = { id: crypto.randomUUID(), teacher, subject, message, status: "pending", createdAt: new Date().toISOString(), user: { id: req.session.user.id, username: req.session.user.username, displayName: req.session.user.displayName || req.session.user.nickname || req.session.user.username } };
  items.unshift(item);
  writeJsonFile(REQUESTS_FILE, items.slice(0, 500));
  res.json({ success: true, request: { id: item.id, status: item.status } });
});

app.get("/api/admin/requests", async (req, res) => {
  if (!(await requireAdmin(req, res))) return;
  res.json({ success: true, requests: readJsonFile(REQUESTS_FILE, []) });
});

// ======================================================
// LOGOUT
// ======================================================

app.get(
  "/logout",
  (req, res) => {

    req.session.destroy(
      () => {

        res.clearCookie(
          "connect.sid"
        );

        res.redirect(
          "/"
        );
      }
    );
  }
);

// ======================================================
// FALLBACK
// ======================================================

app.use(
  (req, res) => {

    res
      .status(404)
      .json({
        success: false,
        message:
          `ไม่พบ Route: ${req.method} ${req.path}`
      });
  }
);

// ======================================================
// START
// ======================================================

if (!SESSION_SECRET || SESSION_SECRET.length < 32) {
  console.error("[CONFIG ERROR] SESSION_SECRET must be at least 32 characters.");
  process.exit(1);
}

app.listen(
  PORT,
  HOST,
  () => {

    console.log("");
    console.log(
      "=================================="
    );
    console.log(
      " SHADOW BASILISK WEBSITE"
    );
    console.log(
      "=================================="
    );
    console.log(
      `Website       : http://localhost:${PORT}`
    );
    console.log(
      `Bind          : localhost:${PORT}`
    );
    console.log(
      `Discord Login : ${
        discordOAuthConfigured()
          ? "READY"
          : "NOT CONFIGURED"
      }`
    );
    console.log(
      `Verify System : ${
        discordVerifyConfigured()
          ? "READY"
          : "NOT CONFIGURED"
      }`
    );
    console.log(
      `Discord Log   : ${
        discordLogConfigured()
          ? "READY"
          : "NOT CONFIGURED"
      }`
    );
    console.log(
      `ADMIN Reset   : ${
        adminAuthConfigured()
          ? "READY"
          : "NOT CONFIGURED"
      }`
    );
    console.log(
      `Health Check  : http://localhost:${PORT}/health`
    );
    console.log(
      "=================================="
    );
    console.log("");
  }
);
