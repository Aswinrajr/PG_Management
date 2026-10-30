import { logger } from '../../lib/logger.js';

export interface SmsDriver {
  sendOtp(phone: string, code: string): Promise<void>;
}

const consoleDriver: SmsDriver = {
  async sendOtp(phone) {
    logger.info({ phone: `${phone.slice(0, 4)}****${phone.slice(-2)}` }, 'OTP issued (dev mode, code is 123456)');
  },
};

const msg91Driver: SmsDriver = {
  async sendOtp(phone, code) {
    const res = await fetch('https://control.msg91.com/api/v5/otp', {
      method: 'POST',
      headers: { authkey: process.env.MSG91_AUTH_KEY ?? '', 'content-type': 'application/json' },
      body: JSON.stringify({ template_id: process.env.MSG91_TEMPLATE_ID_OTP, mobile: phone, otp: code }),
    });
    if (!res.ok) throw new Error(`MSG91 responded ${res.status}`);
  },
};

export const smsDriver: SmsDriver = process.env.MSG91_AUTH_KEY ? msg91Driver : consoleDriver;
