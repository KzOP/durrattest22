import type { IncomingMessage, ServerResponse } from 'node:http';
import { authenticateStaff, bearerToken, firestoreDocumentsUrl } from '../server/staff-auth';

type ApiRequest = IncomingMessage & { body?: unknown };
type ApiResponse = ServerResponse & {
  status(code: number): ApiResponse;
  json(body: unknown): void;
};

type FirestoreValue = {
  stringValue?: string;
  booleanValue?: boolean;
  integerValue?: string;
  doubleValue?: number;
  arrayValue?: { values?: FirestoreValue[] };
  mapValue?: { fields?: Record<string, FirestoreValue> };
};

type FirestoreDocument = {
  fields?: Record<string, FirestoreValue>;
};

type RentPeriod = 'monthly' | 'annual' | 'two_installments';

const PRODUCTION_APP_URL = 'https://durrattest18.vercel.app';

const rentPeriodPriceText: Record<RentPeriod, string> = {
  monthly: 'شهرياً',
  annual: 'سنوياً',
  two_installments: 'على الدفعة الواحدة',
};

const rentPeriodLabelText: Record<RentPeriod, string> = {
  monthly: 'شهري',
  annual: 'سنوي',
  two_installments: 'على دفعتين',
};

function stringField(fields: Record<string, FirestoreValue>, name: string) {
  const value = fields[name]?.stringValue;
  return typeof value === 'string' ? value : '';
}

function firstTextField(fields: Record<string, FirestoreValue>, names: string[]) {
  for (const name of names) {
    const value = fields[name];
    if (typeof value?.stringValue === 'string' && value.stringValue.trim()) {
      return value.stringValue.trim();
    }
    if (typeof value?.integerValue === 'string') return value.integerValue;
    if (typeof value?.doubleValue === 'number' && Number.isFinite(value.doubleValue)) {
      return String(value.doubleValue);
    }
  }
  return '';
}

function numberField(fields: Record<string, FirestoreValue>, name: string) {
  const value = fields[name];
  const number = value?.doubleValue ?? Number(value?.integerValue);
  return Number.isFinite(number) ? number : 0;
}

function formatNumericText(value: string) {
  const number = Number(value);
  return value.trim() && Number.isFinite(number)
    ? new Intl.NumberFormat('ar-SA', { maximumFractionDigits: 2 }).format(number)
    : value;
}

function areaText(fields: Record<string, FirestoreValue>) {
  const rawArea = limitText(firstTextField(fields, ['area']), 30);
  if (!rawArea) return '';

  const numericArea = Number(rawArea);
  if (Number.isFinite(numericArea) && numericArea <= 0) return '';

  const alreadyHasUnit = /(?:م²|م2|متر|sqm|sq\.?\s*m|ft²|ft2|sq\.?\s*ft)/i.test(rawArea);
  return `${formatNumericText(rawArea)}${alreadyHasUnit ? '' : ' م²'}`;
}

function normalizedLabel(value: string) {
  return value.trim().toLowerCase().replace(/[أإآ]/g, 'ا').replace(/ى/g, 'ي');
}

function isRentLabel(value: string) {
  return /(?:^|[^a-z])(?:rent|rental|lease)(?:$|[^a-z])|(?:ايجار|استئجار|شهري|شهر|سنوي|سنة)|(?:^|[^a-z])(?:monthly|month|annual|yearly|year)(?:$|[^a-z])/i.test(normalizedLabel(value));
}

function isSaleLabel(value: string) {
  return /(?:^|[^a-z])(?:sale|sell)(?:$|[^a-z])|بيع/i.test(normalizedLabel(value));
}

function rentPeriodFromFields(fields: Record<string, FirestoreValue>): RentPeriod {
  const value = stringField(fields, 'rent_period');
  if (value === 'monthly' || value === 'annual' || value === 'two_installments') return value;
  return 'annual';
}

function isRentListing(fields: Record<string, FirestoreValue>) {
  const listingFields = ['listing_type', 'listingType', 'subType', 'offerType', 'offer_type'];
  const values = listingFields.map((name) => stringField(fields, name).trim()).filter(Boolean);
  const recognized = values.find((value) => isRentLabel(value) || isSaleLabel(value));
  if (recognized) return isRentLabel(recognized);
  return values.some((value) => /(?:^|[^a-z])(?:monthly|month|annual|yearly|year)(?:$|[^a-z])|شهري|شهر|سنوي|سنة/i.test(normalizedLabel(value)));
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => {
    const entities: Record<string, string> = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;',
    };
    return entities[character];
  });
}

function limitText(value: string, maxCharacters: number) {
  return Array.from(value.trim()).slice(0, maxCharacters).join('');
}

function isDirectImageUrl(value: string) {
  if (!value || value.length > 2048) return false;
  try {
    const protocol = new URL(value).protocol;
    return protocol === 'https:' || protocol === 'http:';
  } catch {
    return false;
  }
}

function imageUrlFromValue(value?: FirestoreValue): string {
  if (!value) return '';

  const directValue = typeof value.stringValue === 'string' ? value.stringValue.trim() : '';
  if (directValue && isDirectImageUrl(directValue)) return directValue;

  const nestedFields = value.mapValue?.fields;
  if (!nestedFields) return '';

  for (const key of ['url', 'imageUrl', 'image_url', 'src', 'downloadURL', 'downloadUrl']) {
    const candidate = nestedFields[key];
    const directCandidate = candidate?.stringValue?.trim() ?? '';
    if (directCandidate && isDirectImageUrl(directCandidate)) return directCandidate;
    const nestedCandidate = imageUrlFromValue(candidate);
    if (nestedCandidate) return nestedCandidate;
  }
  return '';
}

function firstImageUrl(fields: Record<string, FirestoreValue>) {
  for (const name of ['imageUrl', 'image_url', 'imageURL', 'images', 'photos', 'imageUrls', 'photo']) {
    const value = fields[name];
    const candidates = value?.arrayValue?.values ?? (value ? [value] : []);
    for (const candidate of candidates) {
      const imageUrl = imageUrlFromValue(candidate);
      if (imageUrl) return imageUrl;
    }
  }
  return '';
}

function parseBody(body: unknown): Record<string, unknown> | null {
  try {
    const parsed = typeof body === 'string' ? JSON.parse(body) as unknown : body;
    return parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : null;
  } catch {
    return null;
  }
}

type TelegramApiResult = {
  ok?: boolean;
  description?: string;
  error_code?: number;
};

type TelegramSendResult = {
  ok: boolean;
  description?: string;
};

function safeDiagnostic(value: unknown, secrets?: string | Array<string | undefined>) {
  const text = value instanceof Error ? value.message : String(value ?? '');
  const secretList = Array.isArray(secrets) ? secrets : [secrets];
  const redacted = secretList.reduce<string>(
    (message, secret) => secret ? message.split(secret).join('[redacted]') : message,
    text,
  );
  return redacted.slice(0, 500);
}

async function sendTelegram(
  botToken: string,
  method: 'sendPhoto' | 'sendMessage',
  payload: Record<string, unknown>,
  propertyId: string,
): Promise<TelegramSendResult> {
  try {
    const response = await fetch(`https://api.telegram.org/bot${botToken}/${method}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const responseText = await response.text();
    let result: TelegramApiResult | null = null;

    try {
      result = JSON.parse(responseText) as TelegramApiResult;
    } catch {
      // Keep a bounded response excerpt for diagnosing malformed replies.
    }

    if (response.ok && result?.ok === true) return { ok: true };

    const description = result?.description
      ? safeDiagnostic(result.description, botToken)
      : `Telegram returned HTTP ${response.status}`;
    console.error('[telegram-notify] Telegram request rejected', {
      propertyId,
      method,
      httpStatus: response.status,
      telegramErrorCode: result?.error_code,
      telegramDescription: description,
      responseExcerpt: result ? undefined : safeDiagnostic(responseText, botToken),
    });
    return { ok: false, description };
  } catch (error) {
    const description = safeDiagnostic(error, botToken);
    console.error('[telegram-notify] Telegram request failed before a response', {
      propertyId,
      method,
      error: description,
    });
    return { ok: false, description };
  }
}

export default async function handler(req: ApiRequest, res: ApiResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed', code: 'METHOD_NOT_ALLOWED' });
  }

  const idToken = bearerToken(req.headers.authorization);
  if (!idToken) return res.status(401).json({ error: 'Unauthorized', code: 'MISSING_BEARER_TOKEN' });

  const apiKey = process.env.VITE_FIREBASE_API_KEY?.trim();
  const projectId = process.env.FIREBASE_PROJECT_ID?.trim();
  const botToken = process.env.TELEGRAM_BOT_TOKEN?.trim();
  const chatId = process.env.TELEGRAM_CHAT_ID?.trim();
  if (!apiKey || !projectId) {
    const missingSettings = [
      ['VITE_FIREBASE_API_KEY', apiKey],
      ['FIREBASE_PROJECT_ID', projectId],
    ].filter(([, value]) => !value).map(([name]) => name);
    console.error('[telegram-notify] Required Firebase server settings are missing', { missingSettings });
    return res.status(500).json({
      error: 'Server Firebase settings are incomplete',
      code: 'FIREBASE_CONFIG_INCOMPLETE',
      missingSettings,
    });
  }

  const body = parseBody(req.body);
  const propertyId = body?.propertyId;
  if (typeof propertyId !== 'string' || !/^[A-Za-z0-9_-]{1,150}$/.test(propertyId)) {
    return res.status(400).json({ error: 'Invalid property ID', code: 'INVALID_PROPERTY_ID' });
  }

  try {
    const staff = await authenticateStaff(idToken, apiKey, projectId);
    if (!staff.ok) {
      console.error('[telegram-notify] Firebase staff authentication failed', {
        propertyId,
        status: staff.status,
        error: safeDiagnostic(staff.error, [botToken, apiKey, idToken]),
      });
      return res.status(staff.status).json({ error: staff.error, code: 'STAFF_AUTHENTICATION_FAILED' });
    }

    const firestoreBase = firestoreDocumentsUrl(projectId);
    const propertyResponse = await fetch(
      `${firestoreBase}/properties/${encodeURIComponent(propertyId)}`,
      { headers: { Authorization: `Bearer ${idToken}` } },
    );
    if (!propertyResponse.ok) {
      console.error('[telegram-notify] Firestore property lookup failed', {
        propertyId,
        httpStatus: propertyResponse.status,
      });
      if (propertyResponse.status === 404) {
        return res.status(404).json({ error: 'Property not found', code: 'PROPERTY_NOT_FOUND' });
      }
      return res.status(502).json({ error: 'Unable to load property', code: 'PROPERTY_LOOKUP_FAILED' });
    }
    const property = await propertyResponse.json() as FirestoreDocument;
    const fields = property.fields ?? {};
    if (stringField(fields, 'created_by_staff_id') !== staff.uid) {
      return res.status(403).json({ error: 'Property owner required', code: 'PROPERTY_OWNER_REQUIRED' });
    }

    if (!botToken || !chatId) {
      const missingSettings = [
        ['TELEGRAM_BOT_TOKEN', botToken],
        ['TELEGRAM_CHAT_ID', chatId],
      ].filter(([, value]) => !value).map(([name]) => name);
      console.error('[telegram-notify] Required Telegram server settings are missing', {
        propertyId,
        missingSettings,
      });
      return res.status(200).json({
        propertyFound: true,
        notificationSent: false,
        sent: false,
        warning: 'Property is available, but Telegram notification settings are incomplete.',
        code: 'TELEGRAM_CONFIG_INCOMPLETE',
        missingSettings,
      });
    }

    const title = limitText(stringField(fields, 'title') || 'عقار جديد', 140);
    const propertyType = limitText(stringField(fields, 'property_type') || 'غير محدد', 60);
    const rentPeriod = rentPeriodFromFields(fields);
    const isRent = isRentListing(fields);
    const listingLabel = isRent ? `للإيجار (${rentPeriodLabelText[rentPeriod]})` : 'للبيع';
    const price = `${new Intl.NumberFormat('ar-SA').format(numberField(fields, 'price'))} ر.س${isRent ? ` ${rentPeriodPriceText[rentPeriod]}` : ''}`;
    const city = limitText(stringField(fields, 'city'), 60);
    const district = limitText(stringField(fields, 'district'), 60);
    const serialNumber = numberField(fields, 'serial_number');
    const area = areaText(fields);
    const detailsUrl = `${PRODUCTION_APP_URL}/?property=${encodeURIComponent(propertyId)}`;
    const normalizedType = propertyType.toLowerCase();
    const isApartment = normalizedType.includes('apartment')
      || propertyType.includes('شقة')
      || propertyType.includes('شقق');

    const apartmentLines = isApartment
      ? [
          ...[
            ['غرف النوم', ['bedrooms', 'bedroom_count', 'rooms']],
            ['الصالات', ['lounges', 'living_rooms', 'halls']],
            ['المطابخ', ['kitchens', 'kitchen_count']],
            ['دورات المياه', ['bathrooms', 'bathroom_count', 'baths']],
          ].map(([label, keys]) => {
            const value = firstTextField(fields, keys as string[]);
            return value
              ? `${label}: ${escapeHtml(formatNumericText(limitText(value, 30)))}`
              : '';
          }).filter(Boolean),
        ]
      : [];

    const apartmentPlainLines = isApartment
      ? [
          ...[
            ['غرف النوم', ['bedrooms', 'bedroom_count', 'rooms']],
            ['الصالات', ['lounges', 'living_rooms', 'halls']],
            ['المطابخ', ['kitchens', 'kitchen_count']],
            ['دورات المياه', ['bathrooms', 'bathroom_count', 'baths']],
          ].map(([label, keys]) => {
            const value = firstTextField(fields, keys as string[]);
            return value
              ? `${label}: ${formatNumericText(limitText(value, 30))}`
              : '';
          }).filter(Boolean),
        ]
      : [];

    const htmlMessage = [
      '<b>🏡 إعلان عقاري جديد</b>',
      `<b>${escapeHtml(title)}</b>`,
      `النوع: ${escapeHtml(propertyType)} — ${listingLabel}`,
      `السعر: ${price}`,
      area ? `المساحة: ${escapeHtml(area)}` : '',
      ...apartmentLines.map((line) => `\n${line}`),
      city || district
        ? `الموقع: ${escapeHtml([city, district].filter(Boolean).join(' — '))}`
        : '',
      serialNumber
        ? `رقم الإعلان: ${new Intl.NumberFormat('ar-SA').format(serialNumber)}`
        : '',
      '',
      `<a href="${escapeHtml(detailsUrl)}">عرض تفاصيل العقار</a>`,
    ].filter(Boolean).flat().join('\n');
    const plainMessage = [
      '🏡 إعلان عقاري جديد',
      title,
      `النوع: ${propertyType} — ${listingLabel}`,
      `السعر: ${price}`,
      area ? `المساحة: ${area}` : '',
      ...apartmentPlainLines,
      city || district
        ? `الموقع: ${[city, district].filter(Boolean).join(' — ')}`
        : '',
      serialNumber
        ? `رقم الإعلان: ${new Intl.NumberFormat('ar-SA').format(serialNumber)}`
        : '',
      '',
      `عرض تفاصيل العقار: ${detailsUrl}`,
    ].filter(Boolean).flat().join('\n');
    const imageUrl = firstImageUrl(fields);
    const textPayload = {
      chat_id: chatId,
      text: limitText(plainMessage, 4000),
      disable_web_page_preview: true,
    };

    let telegramResult: TelegramSendResult;
    if (imageUrl && Array.from(htmlMessage).length <= 1024) {
      telegramResult = await sendTelegram(botToken, 'sendPhoto', {
        chat_id: chatId,
        photo: imageUrl,
        caption: htmlMessage,
        parse_mode: 'HTML',
      }, propertyId);

      if (!telegramResult.ok) {
        console.error('[telegram-notify] Falling back from sendPhoto to sendMessage', {
          propertyId,
          reason: telegramResult.description,
        });
        telegramResult = await sendTelegram(botToken, 'sendMessage', textPayload, propertyId);
      }
    } else {
      if (imageUrl) {
        console.error('[telegram-notify] Photo caption exceeds Telegram limit; using sendMessage', {
          propertyId,
          captionCharacters: Array.from(htmlMessage).length,
          maximumCaptionCharacters: 1024,
        });
      }
      telegramResult = await sendTelegram(botToken, 'sendMessage', textPayload, propertyId);
    }

    if (!telegramResult.ok) {
      return res.status(200).json({
        propertyFound: true,
        notificationSent: false,
        sent: false,
        warning: 'Property is available, but the Telegram notification could not be delivered.',
        code: 'TELEGRAM_DELIVERY_FAILED',
      });
    }

    return res.status(200).json({
      propertyFound: true,
      notificationSent: true,
      sent: true,
    });
  } catch (error) {
    console.error('[telegram-notify] Unexpected request failure', {
      propertyId,
      error: safeDiagnostic(error, [botToken, apiKey, idToken]),
    });
    return res.status(502).json({
      error: 'Notification service unavailable',
      code: 'NOTIFICATION_SERVICE_UNAVAILABLE',
    });
  }
}
