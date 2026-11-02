export type RentPeriod = 'monthly' | 'annual' | 'two_installments';

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

export function formatPrice(price: number, listingType: string, rentPeriod?: RentPeriod) {
  const amount = new Intl.NumberFormat('ar-SA').format(price) + ' ر.س';
  if (listingType !== 'rent') return amount;
  return amount + ' ' + rentPeriodPriceText[rentPeriod ?? 'annual'];
}

export function formatListingLabel(listingType: string, rentPeriod?: RentPeriod) {
  if (listingType !== 'rent') return 'للبيع';
  return 'للإيجار (' + rentPeriodLabelText[rentPeriod ?? 'annual'] + ')';
}
