ALTER TABLE `StudentDocument`
  MODIFY `category` ENUM(
    'PASSPORT',
    'TRANSCRIPT',
    'SOP',
    'OFFER_LETTER',
    'COE',
    'HEALTH_INSURANCE',
    'VISA',
    'FINANCIAL',
    'IDENTITY',
    'OTHER'
  ) NOT NULL DEFAULT 'OTHER';
