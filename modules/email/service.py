"""SMTP email sending (Gmail via App Password).

Setup for Gmail:
    1. Enable 2-Step Verification on the Google account.
    2. Create an "App Password" (Google Account -> Security -> App passwords).
    3. Put the 16-char password in SMTP_PASSWORD and the address in SMTP_USER.

If SMTP isn't configured, send_email() returns False and logs to stdout so the
app still works in local/dev (the code is also returned by the API in dev mode).
"""
from __future__ import annotations

import smtplib
import ssl
from email.message import EmailMessage

from config import (
    SMTP_HOST,
    SMTP_PORT,
    SMTP_USER,
    SMTP_PASSWORD,
    SMTP_FROM,
    SMTP_FROM_NAME,
    SMTP_USE_TLS,
)


def is_configured() -> bool:
    return bool(SMTP_USER and SMTP_PASSWORD)


def send_email(to: str, subject: str, text: str, html: str | None = None) -> bool:
    """Send an email. Returns True on success, False if not configured / failed."""
    if not is_configured():
        # Dev fallback: make the message visible in logs instead of failing.
        print(f"[email:dev] To: {to} | {subject}\n{text}")
        return False

    msg = EmailMessage()
    msg["Subject"] = subject
    msg["From"] = f"{SMTP_FROM_NAME} <{SMTP_FROM}>"
    msg["To"] = to
    msg.set_content(text)
    if html:
        msg.add_alternative(html, subtype="html")

    try:
        if SMTP_PORT == 465:
            context = ssl.create_default_context()
            with smtplib.SMTP_SSL(SMTP_HOST, SMTP_PORT, context=context, timeout=20) as server:
                server.login(SMTP_USER, SMTP_PASSWORD)
                server.send_message(msg)
        else:
            with smtplib.SMTP(SMTP_HOST, SMTP_PORT, timeout=20) as server:
                if SMTP_USE_TLS:
                    server.starttls(context=ssl.create_default_context())
                server.login(SMTP_USER, SMTP_PASSWORD)
                server.send_message(msg)
        return True
    except Exception as exc:
        print(f"[email:error] failed to send to {to}: {exc}")
        return False


def code_email(code: str, purpose: str, ttl_min: int) -> tuple[str, str, str]:
    """Builds (subject, text, html) for a verification-code email."""
    titles = {
        "verify": "Confirm your email",
        "login": "Your login code",
        "reset": "Reset your password",
    }
    subject = titles.get(purpose, "Your code") + f" — {code}"
    text = (
        f"Nestora\n\n"
        f"Your verification code is: {code}\n\n"
        f"It expires in {ttl_min} minutes. If you didn't request this, ignore this email."
    )
    html = f"""\
<div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;max-width:420px;margin:auto">
  <div style="font-size:22px;font-weight:700;color:#635bff;margin-bottom:8px">Nestora</div>
  <h2 style="color:#111">{titles.get(purpose, 'Your code')}</h2>
  <p style="color:#444">Use this code to continue:</p>
  <div style="font-size:32px;font-weight:700;letter-spacing:6px;background:#f4f4f7;
              padding:16px;text-align:center;border-radius:10px;color:#111">{code}</div>
  <p style="color:#888;font-size:13px;margin-top:16px">Expires in {ttl_min} minutes.
     If you didn't request this, you can ignore this email.</p>
  <p style="color:#bbb;font-size:12px;margin-top:20px">— The Nestora team</p>
</div>"""
    return subject, text, html
