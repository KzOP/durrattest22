const OFFICE_WHATSAPP_NUMBER = '0569996744';

export function whatsappUrl(phone: string, text?: string) {
  const digits = phone.replace(/\D/g, '').replace(/^0/, '');
  const query = text ? `?text=${encodeURIComponent(text)}` : '';
  return `https://wa.me/966${digits}${query}`;
}

export function publisherPhone(property: { publisher_phone?: string; contact_phone?: string }) {
  return property.publisher_phone || property.contact_phone || OFFICE_WHATSAPP_NUMBER;
}
