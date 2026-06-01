export type PreferredSubscriptionPlan = 'monthly' | 'yearly';

export interface RegistrationSourceInfo {
  source: string;
  label?: string;
  note?: string;
  designId?: number;
  designCaption?: string;
  designUrl?: string;
  designImageUrl?: string;
  returnPath?: string;
  preferredPlan?: PreferredSubscriptionPlan;
}
