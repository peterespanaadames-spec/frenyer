import { getBusinessProfile } from './businessProfile';

export const getReportHeaderHtml = () => {
  const business = getBusinessProfile();
  return `
    <div class="header-banner" style="background-color: #4b5563; color: #ffffff; padding: 16px; border-radius: 6px; margin-bottom: 20px;">
      <h2 style="margin: 0 0 4px; font-size: 18px; color: #ffffff;">${business.businessName}</h2>
      <p style="margin: 0; font-size: 12px; color: #e5e7eb;">RIF: ${business.rif} | Tel: ${business.phone}</p>
    </div>
  `;
};
